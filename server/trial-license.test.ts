import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import test from 'node:test'
import { hardwareDeviceId } from './device-identity.js'
import { loadMigrationFiles, runMigrations } from './migrations.js'
import { createMemoryTrialLicenseStore, createPostgresTrialLicenseStore, createTrialLicenseService, LicenseError, readTrialProfile } from './trial-license.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const deviceId = hardwareDeviceId({ uuid: 'A1B2C3D4-1234-5678-90AB-123456789ABC', biosSerial: 'BIOS-TEST-42' })
const otherDeviceId = hardwareDeviceId({ uuid: 'A1B2C3D4-1234-5678-90AB-123456789ABD', biosSerial: 'BIOS-OTHER-57' })
function activationCode(installationId = deviceId, overrides: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ version: 2, installationId, edition: 'full', issuedAt: new Date().toISOString(), ...overrides })
  return `${Buffer.from(payload).toString('base64url')}.${sign(null, Buffer.from(payload), keys.privateKey).toString('base64url')}`
}
const quotaError = (error: unknown) => error instanceof LicenseError && error.code === 'QUOTA_EXHAUSTED'
const invalidActivation = (error: unknown) => error instanceof LicenseError && error.code === 'INVALID_ACTIVATION'

function trialService(store = createMemoryTrialLicenseStore(), identity = deviceId) {
  return createTrialLicenseService({ store, trial: true, publicKey, deviceId: identity })
}

test('project migrations load with unique versions and include the additive trial migration', async () => {
  const files = await loadMigrationFiles(path.join(process.cwd(), 'db', 'migrations'))
  assert.equal(new Set(files.map((file) => file.version)).size, files.length)
  assert.ok(files.some((file) => file.name === '022_trial_license.sql'))
})

test('profile resolves hardware once only for trial builds and propagates hardware failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ayscan-trial-profile-'))
  let probes = 0
  const probe = async () => { probes++; return deviceId }
  try {
    assert.deepEqual(await readTrialProfile(root, probe), { trial: false })
    assert.equal(probes, 0)
    await writeFile(path.join(root, 'trial-build.json'), '{"edition":"trial","recordLimit":50}', 'utf8')
    await writeFile(path.join(root, 'trial-public.pem'), publicKey, 'utf8')
    const profile = await readTrialProfile(root, probe)
    assert.deepEqual(profile, { trial: true, publicKey, deviceId })
    const service = createTrialLicenseService({ store: createMemoryTrialLicenseStore(), ...profile })
    await service.withRecordEntry(async () => true)
    await service.getStatus()
    assert.equal(probes, 1)
    await assert.rejects(readTrialProfile(root, async () => { throw new Error('Hardware unavailable') }), /Hardware unavailable/)
    assert.throws(() => createTrialLicenseService({ store: createMemoryTrialLicenseStore(), trial: true, publicKey }), /hardware-derived device identity/)
    await writeFile(path.join(root, 'trial-build.json'), '\uFEFF{"edition":"trial","recordLimit":50}', 'utf8')
    await assert.rejects(readTrialProfile(root, probe), SyntaxError)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('free trial immediately allows 50 global successful creates and blocks the 51st', async () => {
  const service = trialService()
  assert.deepEqual(await service.getStatus(), { edition: 'trial', status: 'active', installationId: deviceId, recordLimit: 50, recordsUsed: 0, recordsRemaining: 50, canEnterData: true })
  await assert.rejects(service.withRecordEntry(async () => { throw new Error('failed write') }), /failed write/)
  assert.equal((await service.getStatus()).recordsUsed, 0)
  for (let count = 0; count < 49; count++) await service.withRecordEntry(async () => ({ order: true, specimens: 2, orderItems: 2 }))
  assert.equal((await service.getStatus()).recordsUsed, 49)
  assert.equal((await service.getStatus()).recordsRemaining, 1)
  await assert.rejects(service.withRecordEntry(async () => { throw new Error('last-slot failure') }), /last-slot failure/)
  assert.equal((await service.getStatus()).recordsUsed, 49)
  await service.withRecordEntry(async () => true)
  assert.equal((await service.getStatus()).status, 'limit_reached')
  let executed = false
  await assert.rejects(service.withRecordEntry(async () => { executed = true }), quotaError)
  assert.equal(executed, false)
  assert.equal((await service.getStatus()).recordsUsed, 50)
})

async function assertConcurrentQuota(services: Array<ReturnType<typeof trialService>>) {
  let signalWriteStarted!: () => void
  let failPendingWrite!: () => void
  const writeStarted = new Promise<void>((resolve) => { signalWriteStarted = resolve })
  const pendingFailure = new Promise<void>((resolve) => { failPendingWrite = resolve })
  const failedWrite = assert.rejects(services[0].withRecordEntry(async () => { signalWriteStarted(); await pendingFailure; throw new Error('failed concurrent write') }), /failed concurrent write/)
  await writeStarted
  try {
    const attempts = await Promise.allSettled(Array.from({ length: 60 }, (_, index) => services[index % 2].withRecordEntry(async () => true)))
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 49)
    assert.ok(attempts.filter((attempt) => attempt.status === 'rejected').every((attempt) => quotaError(attempt.reason)))
    assert.equal((await services[0].getStatus()).recordsUsed, 50)
  } finally { failPendingWrite(); await failedWrite }
  assert.equal((await services[0].getStatus()).recordsUsed, 49)
  await services[1].withRecordEntry(async () => true)
  assert.equal((await services[0].getStatus()).recordsUsed, 50)
}

test('concurrent trial reservations stay capped across services and failed writes release their slot', async () => {
  const store = createMemoryTrialLicenseStore()
  await assertConcurrentQuota([trialService(store), trialService(store)])
})

test('full activation after exhaustion unlocks more than 50 creates, persists and is bound to server hardware', async () => {
  const store = createMemoryTrialLicenseStore()
  const service = trialService(store)
  for (let count = 0; count < 50; count++) await service.withRecordEntry(async () => true)
  await assert.rejects(service.withRecordEntry(async () => true), quotaError)
  const code = activationCode()
  assert.equal((await service.activate(code)).edition, 'full')
  assert.equal((await service.activate(code)).recordLimit, null)
  const restarted = trialService(store)
  for (let count = 0; count < 60; count++) assert.equal(await restarted.withRecordEntry(async () => 'created'), 'created')
  assert.deepEqual(await restarted.getStatus(), { edition: 'full', status: 'active', installationId: deviceId, recordLimit: null, recordsUsed: 50, recordsRemaining: null, canEnterData: true })
  // Reusing the exact persisted database state on another host must not transfer entitlement.
  const restored = trialService(store, otherDeviceId)
  assert.equal((await restored.getStatus()).installationId, otherDeviceId)
  assert.equal((await restored.getStatus()).edition, 'trial')
  await assert.rejects(restored.withRecordEntry(async () => true), quotaError)
  await assert.rejects(restored.activate(code), invalidActivation)
  assert.equal((await restored.activate(activationCode(otherDeviceId))).edition, 'full')
  assert.equal((await trialService(store).getStatus()).edition, 'trial')
})

test('invalid, tampered, wrong-device and historical tokens never confer full entitlement or block replacement', async () => {
  const valid = activationCode()
  const [payload, signature] = valid.split('.')
  const otherKeys = generateKeyPairSync('ed25519')
  const invalidCodes = [
    'invalid', `${valid}.`, `${payload}.${signature.slice(0, -4)}AAAA`,
    `${payload}.${sign(null, Buffer.from(payload, 'base64url'), otherKeys.privateKey).toString('base64url')}`,
    `${Buffer.from(JSON.stringify({ version: 2, installationId: otherDeviceId, edition: 'full' })).toString('base64url')}.${signature}`,
    activationCode(otherDeviceId), activationCode(deviceId, { issuedAt: 'not-a-date' }),
    activationCode(deviceId, { version: 1, edition: 'trial', recordLimit: 50 }),
    activationCode(deviceId, { version: 1 }), activationCode(deviceId, { recordLimit: 50 }),
  ]
  for (const code of invalidCodes) {
    const store = createMemoryTrialLicenseStore()
    const service = trialService(store)
    await assert.rejects(service.activate(code), invalidActivation)
    await store.activate(code)
    assert.equal((await trialService(store).getStatus()).edition, 'trial')
    await service.withRecordEntry(async () => true)
    assert.equal((await service.activate(valid)).edition, 'full')
  }
})

test('legacy non-trial builds remain unrestricted without a hardware identity', async () => {
  const service = createTrialLicenseService({ store: createMemoryTrialLicenseStore(), trial: false })
  for (let count = 0; count < 60; count++) await service.withRecordEntry(async () => true)
  const status = await service.getStatus()
  assert.equal(status.edition, 'legacy')
  assert.equal(status.recordLimit, null)
  assert.equal(status.canEnterData, true)
})

test('CLI issues a verifiable v2 full token from the default private key and keygen refuses overwrite', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ayscan-license-cli-'))
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const privatePath = path.join(root, '.ay-scan', 'trial-private.pem')
  const run = promisify(execFile)
  const cli = (command: string, ...flags: string[]) => run(process.execPath, ['--import', import.meta.resolve('tsx'), path.join(process.cwd(), 'tools', 'trial-license.ts'), command, '--', ...flags], { cwd: root, env: { ...process.env, HOME: root, USERPROFILE: root }, timeout: 20_000 })
  try {
    await mkdir(path.dirname(privatePath), { recursive: true })
    await writeFile(privatePath, privateKey, { flag: 'wx' })
    const { stdout } = await cli('issue', '--installation-id', deviceId)
    const code = stdout.trim()
    const [payload, signature] = code.split('.')
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    assert.deepEqual(Object.keys(body).sort(), ['edition', 'installationId', 'issuedAt', 'version'])
    assert.equal(body.version, 2)
    assert.equal(body.edition, 'full')
    assert.equal(body.installationId, deviceId)
    assert.ok(Number.isFinite(Date.parse(String(body.issuedAt))))
    assert.ok(verify(null, Buffer.from(payload, 'base64url'), publicKey, Buffer.from(signature, 'base64url')))
    assert.equal((await trialService().activate(code)).edition, 'full')
    await assert.rejects(cli('issue', '--installation-id', '00000000-0000-4000-8000-000000000001'), /AYSCAN-HW2-deviceId/)
    await assert.rejects(cli('keygen'), /refusing to overwrite/)
    assert.equal(await readFile(privatePath, 'utf8'), privateKey)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('PostgreSQL free trial reserves atomically, rolls back failures and validates persisted full activation on this host', { skip: databaseUrl ? false : 'TEST_DATABASE_URL is not set' }, async () => {
  const baseUrl = new URL(databaseUrl as string)
  const databaseName = `ayscan_license_${randomBytes(5).toString('hex')}`
  const admin = new Pool({ connectionString: databaseUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${databaseName}`)
  baseUrl.pathname = `/${databaseName}`
  const pool = new Pool({ connectionString: baseUrl.toString(), max: 10 })
  try {
    await runMigrations(pool, undefined, () => {})
    const store = createPostgresTrialLicenseStore(pool)
    const service = trialService(store)
    assert.equal((await service.getStatus()).recordsUsed, 0)
    await assert.rejects(service.withRecordEntry(async () => { throw new Error('failed write') }), /failed write/)
    assert.equal((await service.getStatus()).recordsUsed, 0)
    await assertConcurrentQuota([service, trialService(createPostgresTrialLicenseStore(pool))])
    const persisted = () => trialService(createPostgresTrialLicenseStore(pool))
    assert.equal((await persisted().getStatus()).recordsUsed, 50)
    await store.activate(activationCode(deviceId, { version: 1, edition: 'trial', recordLimit: 50 }))
    await assert.rejects(persisted().withRecordEntry(async () => true), quotaError)
    await store.activate('tampered')
    await assert.rejects(persisted().withRecordEntry(async () => true), quotaError)
    await service.activate(activationCode())
    for (let count = 0; count < 60; count++) await persisted().withRecordEntry(async () => true)
    assert.equal((await persisted().getStatus()).edition, 'full')
    assert.equal((await persisted().getStatus()).recordsUsed, 50)
    const restored = trialService(createPostgresTrialLicenseStore(pool), otherDeviceId)
    assert.equal((await restored.getStatus()).edition, 'trial')
    await assert.rejects(restored.withRecordEntry(async () => true), quotaError)
    await assert.rejects(restored.activate(activationCode()), invalidActivation)
    assert.equal((await restored.activate(activationCode(otherDeviceId))).edition, 'full')
  } finally {
    await pool.end()
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
    await admin.end()
  }
})

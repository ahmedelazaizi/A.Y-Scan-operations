import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import test from 'node:test'
import { loadMigrationFiles, runMigrations } from './migrations.js'
import { createMemoryTrialLicenseStore, createPostgresTrialLicenseStore, createTrialLicenseService, LicenseError, readTrialProfile } from './trial-license.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const activationCode = (installationId: string) => {
  const payload = JSON.stringify({ version: 1, installationId, edition: 'trial', recordLimit: 50, issuedAt: new Date().toISOString() })
  return `${Buffer.from(payload).toString('base64url')}.${sign(null, Buffer.from(payload), keys.privateKey).toString('base64url')}`
}

test('project migrations load with unique versions and include the additive trial migration', async () => {
  const files = await loadMigrationFiles(path.join(process.cwd(), 'db', 'migrations'))
  assert.equal(new Set(files.map((file) => file.version)).size, files.length)
  assert.ok(files.some((file) => file.name === '022_trial_license.sql'))
})

test('trial marker profile parses BOM-less JSON and legacy builds remain unrestricted', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ayscan-trial-profile-'))
  try {
    assert.deepEqual(await readTrialProfile(root), { trial: false })
    await writeFile(path.join(root, 'trial-build.json'), '{"edition":"trial","recordLimit":50}', 'utf8')
    await writeFile(path.join(root, 'trial-public.pem'), publicKey, 'utf8')
    const profile = await readTrialProfile(root)
    assert.equal(profile.trial, true)
    assert.equal(profile.publicKey, publicKey)
    await writeFile(path.join(root, 'trial-build.json'), '\uFEFF{"edition":"trial","recordLimit":50}', 'utf8')
    await assert.rejects(readTrialProfile(root), SyntaxError)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('memory trial activation binds install and counts only successful entries', async () => {
  const store = createMemoryTrialLicenseStore()
  const service = createTrialLicenseService({ store, trial: true, publicKey })
  const installationId = (await service.getStatus()).installationId
  await assert.rejects(service.withRecordEntry(async () => true), (error: unknown) => error instanceof LicenseError && error.code === 'ACTIVATION_REQUIRED' && error.message === 'Trial activation is required before creating records.')
  await assert.rejects(service.activate(activationCode('00000000-0000-4000-8000-000000000001')), LicenseError)
  await assert.rejects(service.activate('invalid'), LicenseError)
  await service.activate(activationCode(installationId))
  await assert.rejects(service.withRecordEntry(async () => { throw new Error('failed') }))
  assert.equal((await service.getStatus()).recordsUsed, 0)
  let count = 0
  for (let i = 0; i < 50; i++) await service.withRecordEntry(async () => { count++; return { order: true, specimens: 2, orderItems: 2 } })
  assert.equal(count, 50)
  assert.equal((await service.getStatus()).recordsUsed, 50)
  await assert.rejects(service.withRecordEntry(async () => { count++ }), (error: unknown) => error instanceof LicenseError && error.code === 'QUOTA_EXHAUSTED' && error.message === 'Trial record creation limit reached.')
  assert.equal(count, 50)
  const restarted = createTrialLicenseService({ store, trial: true, publicKey })
  assert.equal((await restarted.getStatus()).recordsUsed, 50)
})

test('PostgreSQL license persistence verifies stored signature and serializes quota slots', { skip: databaseUrl ? false : 'TEST_DATABASE_URL is not set' }, async () => {
  const baseUrl = new URL(databaseUrl as string)
  const databaseName = `ayscan_license_${randomBytes(5).toString('hex')}`
  const admin = new Pool({ connectionString: databaseUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${databaseName}`)
  baseUrl.pathname = `/${databaseName}`
  const pool = new Pool({ connectionString: baseUrl.toString(), max: 10 })
  try {
    await runMigrations(pool, undefined, () => {})
    const store = createPostgresTrialLicenseStore(pool)
    const service = createTrialLicenseService({ store, trial: true, publicKey })
    const id = (await service.getStatus()).installationId
    await service.activate(activationCode(id))
    const attempts = await Promise.allSettled(Array.from({ length: 60 }, () => service.withRecordEntry(async () => true)))
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 50)
    assert.equal((await createTrialLicenseService({ store: createPostgresTrialLicenseStore(pool), trial: true, publicKey }).getStatus()).recordsUsed, 50)
    await pool.query("UPDATE trial_license_state SET activation_code = 'tampered' WHERE singleton = TRUE")
    const tamperedService = createTrialLicenseService({ store, trial: true, publicKey })
    assert.equal((await tamperedService.getStatus()).status, 'activation_required')
    await assert.rejects(tamperedService.withRecordEntry(async () => true), (error: unknown) => error instanceof LicenseError && error.code === 'ACTIVATION_REQUIRED')
  } finally {
    await pool.end()
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
    await admin.end()
  }
})

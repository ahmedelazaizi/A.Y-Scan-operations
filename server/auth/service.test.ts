import assert from 'node:assert/strict'
import test from 'node:test'
import { Pool } from 'pg'
import { createMemoryUserStore } from './memory-user-store.js'
import { hashPassword, passwordPolicyError, verifyPassword } from './passwords.js'
import { createPostgresUserStore } from './postgres-user-store.js'
import { LoginThrottle } from './rate-limit.js'
import { AuthConflictError, AuthCredentialError, AuthInputError, createAuthService } from './service.js'
import type { UserStore } from './types.js'

const PASSWORD = 'Strong-pass-123'

async function seededService(store: UserStore = createMemoryUserStore(), throttle?: LoginThrottle) {
  const auth = createAuthService(store, { throttle })
  const admin = await auth.createUser({ email: 'Admin@Example.test', displayName: 'Admin', role: 'admin', password: PASSWORD }, { mustChangePassword: false })
  return { auth, store, admin }
}

test('password hashes are salted per user and verify only the right password', async () => {
  const first = await hashPassword(PASSWORD)
  const second = await hashPassword(PASSWORD)
  assert.notEqual(first, second)
  assert.match(first, /^scrypt\$16384\$8\$1\$/)
  assert.equal(await verifyPassword(PASSWORD, first), true)
  assert.equal(await verifyPassword('wrong-password-1', first), false)
  assert.equal(await verifyPassword(PASSWORD, 'not-a-hash'), false)
})

test('password policy requires length, letters and digits', () => {
  assert.ok(passwordPolicyError('short1'))
  assert.ok(passwordPolicyError('onlyletterslong'))
  assert.equal(passwordPolicyError('كلمةسر-آمنة-2024'), null)
  assert.equal(passwordPolicyError(PASSWORD), null)
})

test('login issues a revocable session and normalizes the email', async () => {
  const { auth } = await seededService()
  const result = await auth.login(' ADMIN@example.test ', PASSWORD, '10.0.0.1')
  assert.equal(result.status, 'success')
  if (result.status !== 'success') return
  assert.equal(result.user.email, 'admin@example.test')
  assert.deepEqual(await auth.authenticate(result.token), result.user)
  await auth.logout(result.token)
  assert.equal(await auth.authenticate(result.token), null)
})

test('wrong passwords and unknown accounts fail identically', async () => {
  const { auth } = await seededService()
  assert.deepEqual(await auth.login('admin@example.test', 'Wrong-pass-999', '10.0.0.1'), { status: 'invalid' })
  assert.deepEqual(await auth.login('nobody@example.test', PASSWORD, '10.0.0.1'), { status: 'invalid' })
})

test('repeated failures lock the account temporarily', async () => {
  let clock = 0
  const throttle = new LoginThrottle({ maxFailuresPerAccount: 3, maxFailuresPerAddress: 100, windowMs: 60_000, lockoutMs: 60_000, now: () => clock })
  const { auth } = await seededService(createMemoryUserStore(), throttle)
  for (let attempt = 0; attempt < 3; attempt += 1) await auth.login('admin@example.test', 'Wrong-pass-999', '10.0.0.2')
  const locked = await auth.login('admin@example.test', PASSWORD, '10.0.0.2')
  assert.equal(locked.status, 'throttled')
  clock = 61_000
  assert.equal((await auth.login('admin@example.test', PASSWORD, '10.0.0.2')).status, 'success')
})

test('deactivated users lose existing sessions immediately', async () => {
  const { auth, admin } = await seededService()
  const clerk = await auth.createUser({ email: 'clerk@example.test', displayName: 'Clerk', role: 'receptionist', password: PASSWORD })
  const session = await auth.login('clerk@example.test', PASSWORD, '10.0.0.3')
  assert.equal(session.status, 'success')
  if (session.status !== 'success') return
  assert.equal(session.user.mustChangePassword, true)
  await auth.updateUser({ ...admin }, clerk.id, { isActive: false })
  assert.equal(await auth.authenticate(session.token), null)
  assert.deepEqual(await auth.login('clerk@example.test', PASSWORD, '10.0.0.3'), { status: 'invalid' })
})

test('the last active admin cannot be demoted or deactivated, and nobody can lock themselves out', async () => {
  const { auth, admin } = await seededService()
  const other = await auth.createUser({ email: 'manager@example.test', displayName: 'Manager', role: 'branch_manager', password: PASSWORD })
  await assert.rejects(auth.updateUser(other, admin.id, { role: 'receptionist' }), AuthConflictError)
  await assert.rejects(auth.updateUser(admin, admin.id, { isActive: false }), AuthConflictError)
  await auth.updateUser(admin, other.id, { role: 'admin' })
  const demoted = await auth.updateUser(other, admin.id, { role: 'receptionist' })
  assert.equal(demoted.role, 'receptionist')
})

test('changing the own password keeps the current session and revokes the others', async () => {
  const { auth } = await seededService()
  const first = await auth.login('admin@example.test', PASSWORD, '10.0.0.4')
  const second = await auth.login('admin@example.test', PASSWORD, '10.0.0.5')
  assert.ok(first.status === 'success' && second.status === 'success')
  await assert.rejects(auth.changeOwnPassword(first.user, first.token, 'Wrong-pass-999', 'Another-pass-456'), AuthCredentialError)
  await assert.rejects(auth.changeOwnPassword(first.user, first.token, PASSWORD, 'weak'), AuthInputError)
  await auth.changeOwnPassword(first.user, first.token, PASSWORD, 'Another-pass-456')
  assert.ok(await auth.authenticate(first.token))
  assert.equal(await auth.authenticate(second.token), null)
  assert.equal((await auth.login('admin@example.test', 'Another-pass-456', '10.0.0.4')).status, 'success')
})

test('admin password reset forces a change at next login and signs the user out', async () => {
  const { auth } = await seededService()
  const clerk = await auth.createUser({ email: 'clerk@example.test', displayName: 'Clerk', role: 'receptionist', password: PASSWORD }, { mustChangePassword: false })
  const session = await auth.login('clerk@example.test', PASSWORD, '10.0.0.6')
  assert.ok(session.status === 'success')
  await auth.resetPassword(clerk.id, 'Reset-pass-789')
  assert.equal(await auth.authenticate(session.token), null)
  const next = await auth.login('clerk@example.test', 'Reset-pass-789', '10.0.0.6')
  assert.ok(next.status === 'success' && next.user.mustChangePassword)
})

test('bootstrap creates the first admin only on an empty installation', async () => {
  const auth = createAuthService(createMemoryUserStore())
  const environment = { AUTH_ADMIN_EMAIL: 'owner@example.test', AUTH_ADMIN_PASSWORD: PASSWORD }
  assert.equal(await auth.bootstrapAdmin({}), 'skipped')
  assert.equal(await auth.bootstrapAdmin(environment), 'created')
  assert.equal(await auth.bootstrapAdmin({ ...environment, AUTH_ADMIN_EMAIL: 'second@example.test' }), 'skipped')
  assert.equal((await auth.listUsers()).length, 1)
  await assert.rejects(createAuthService(createMemoryUserStore()).bootstrapAdmin({ AUTH_ADMIN_EMAIL: 'x@example.test', AUTH_ADMIN_PASSWORD: 'weak' }), AuthInputError)
})

const databaseUrl = process.env.TEST_DATABASE_URL
test('postgres user store enforces the same session rules', { skip: databaseUrl ? false : 'TEST_DATABASE_URL is not set' }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await pool.query("DELETE FROM users WHERE email LIKE '%@store-test.example'")
    const store = createPostgresUserStore(pool)
    const auth = createAuthService(store)
    const admin = await auth.createUser({ email: 'Admin@Store-Test.example', displayName: 'Admin', role: 'admin', password: PASSWORD }, { mustChangePassword: false })
    assert.equal(admin.email, 'admin@store-test.example')
    await assert.rejects(auth.createUser({ email: 'ADMIN@store-test.example', displayName: 'Dup', role: 'admin', password: PASSWORD }))
    const session = await auth.login('admin@store-test.example', PASSWORD, '127.0.0.1')
    assert.ok(session.status === 'success')
    assert.equal((await auth.authenticate(session.token))?.id, admin.id)
    assert.equal(await store.findUserById('not-a-uuid'), null)
    await auth.logout(session.token)
    assert.equal(await auth.authenticate(session.token), null)
  } finally {
    await pool.query("DELETE FROM users WHERE email LIKE '%@store-test.example'")
    await pool.end()
  }
})

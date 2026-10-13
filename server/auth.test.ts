import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import type { AuthService } from './auth/service.js'
import type { AuthenticatedUser, Role, UserAccount } from './auth/types.js'
import { capabilitiesFor, hasCapability } from './permissions.js'
import { startTestServer, TEST_ADMIN_TOKEN, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'

type TestServer = { server: Server; baseUrl: string; auth: AuthService }
type LoginBody = { user: AuthenticatedUser; token: string; expiresAt: string; capabilities: string[] }

const PASSWORD = 'Strong-pass-123'
const NEW_PASSWORD = 'Changed-pass-456'

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function withServer(callback: (testServer: TestServer) => Promise<void>): Promise<void> {
  const testServer = await startTestServer()
  try {
    await callback(testServer)
  } finally {
    await stopTestServer(testServer.server)
  }
}

async function request(baseUrl: string, path: string, options: TestRequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: testHeaders(options),
  })
}

async function createUser(
  auth: AuthService,
  email: string,
  options: { role?: Role; mustChangePassword?: boolean; displayName?: string } = {},
): Promise<UserAccount> {
  return auth.createUser(
    { email, displayName: options.displayName ?? 'Test User', role: options.role ?? 'receptionist', password: PASSWORD },
    { mustChangePassword: options.mustChangePassword ?? false },
  )
}

async function login(baseUrl: string, email: string, password = PASSWORD): Promise<Response> {
  return request(baseUrl, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), token: null })
}

test('successful login returns a safe profile, token, and capabilities, and allows me lookup', async () => {
  await withServer(async ({ baseUrl, auth }) => {
    await createUser(auth, 'clerk@example.test', { displayName: 'Front Desk Clerk' })
    const loginResponse = await login(baseUrl, 'CLERK@example.test')
    const body = await loginResponse.json() as LoginBody
    assert.equal(loginResponse.status, 200)
    assert.deepEqual(body.user, {
      id: body.user.id,
      email: 'clerk@example.test',
      displayName: 'Front Desk Clerk',
      role: 'receptionist',
      mustChangePassword: false,
    })
    assert.ok(body.token.length >= 32)
    assert.ok(new Date(body.expiresAt).getTime() > Date.now())
    assert.deepEqual(body.capabilities, capabilitiesFor('receptionist'))
    assert.ok(!JSON.stringify(body).includes('passwordHash'))

    const meResponse = await request(baseUrl, '/api/auth/me', { token: body.token })
    assert.equal(meResponse.status, 200)
    assert.deepEqual(await meResponse.json(), { user: body.user, capabilities: body.capabilities })
  })
})

test('invalid credentials return the same unauthorized response', async () => {
  await withServer(async ({ baseUrl, auth }) => {
    await createUser(auth, 'known@example.test')
    for (const [email, password] of [['unknown@example.test', PASSWORD], ['known@example.test', 'Wrong-pass-999']]) {
      const response = await login(baseUrl, email, password)
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Invalid credentials.' })
    }
  })
})

test('malformed login bodies return 400', async () => {
  await withServer(async ({ baseUrl }) => {
    for (const body of [JSON.stringify({ email: 'user@example.test' }), JSON.stringify([]), JSON.stringify({ email: 1, password: PASSWORD })]) {
      const response = await request(baseUrl, '/api/auth/login', { method: 'POST', body, token: null })
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'email and password are required.' })
    }
    const malformed = await request(baseUrl, '/api/auth/login', { method: 'POST', body: '{', token: null })
    assert.equal(malformed.status, 400)
    assert.deepEqual(await malformed.json(), { error: 'Bad Request', message: 'Body must be valid JSON.' })
  })
})

test('me rejects missing and invalid tokens without revealing token state', async () => {
  await withServer(async ({ baseUrl }) => {
    for (const token of [null, 'not-a-real-token']) {
      const response = await request(baseUrl, '/api/auth/me', { token })
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
    }
  })
})

test('logout revokes the session token', async () => {
  await withServer(async ({ baseUrl, auth }) => {
    await createUser(auth, 'leaver@example.test')
    const { token } = await (await login(baseUrl, 'leaver@example.test')).json() as LoginBody
    assert.equal((await request(baseUrl, '/api/auth/me', { token })).status, 200)

    const logoutResponse = await request(baseUrl, '/api/auth/logout', { method: 'POST', token })
    assert.equal(logoutResponse.status, 204)

    const meResponse = await request(baseUrl, '/api/auth/me', { token })
    assert.equal(meResponse.status, 401)
  })
})

test('a pending password change blocks other routes until the password is changed', async () => {
  await withServer(async ({ baseUrl, auth }) => {
    await createUser(auth, 'fresh@example.test', { mustChangePassword: true })
    const { token, user } = await (await login(baseUrl, 'fresh@example.test')).json() as LoginBody
    assert.equal(user.mustChangePassword, true)

    const meResponse = await request(baseUrl, '/api/auth/me', { token })
    assert.equal(meResponse.status, 200)

    const blocked = await request(baseUrl, '/api/dashboard', { token })
    assert.equal(blocked.status, 403)
    assert.deepEqual(await blocked.json(), { error: 'Password Change Required', message: 'Change your password before continuing.' })

    const wrongCurrent = await request(baseUrl, '/api/auth/password', {
      method: 'POST', body: JSON.stringify({ currentPassword: 'Wrong-pass-999', newPassword: NEW_PASSWORD }), token,
    })
    assert.equal(wrongCurrent.status, 403)
    assert.deepEqual(await wrongCurrent.json(), { error: 'Forbidden', message: 'Current password is incorrect.' })

    const weak = await request(baseUrl, '/api/auth/password', {
      method: 'POST', body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'short' }), token,
    })
    assert.equal(weak.status, 400)

    const changed = await request(baseUrl, '/api/auth/password', {
      method: 'POST', body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }), token,
    })
    assert.equal(changed.status, 200)
    assert.equal((await changed.json() as { user: AuthenticatedUser }).user.mustChangePassword, false)

    assert.equal((await request(baseUrl, '/api/dashboard', { token })).status, 200)
    assert.equal((await login(baseUrl, 'fresh@example.test')).status, 401)
    assert.equal((await login(baseUrl, 'fresh@example.test', NEW_PASSWORD)).status, 200)
  })
})

test('clinical routes require authentication but health stays public', async () => {
  await withServer(async ({ baseUrl }) => {
    const healthResponse = await request(baseUrl, '/api/health', { token: null })
    assert.equal(healthResponse.status, 200)

    const dashboardResponse = await request(baseUrl, '/api/dashboard', { token: null })
    assert.equal(dashboardResponse.status, 401)
    assert.deepEqual(await dashboardResponse.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  })
})

test('admins list, create, update, and reset passwords for users', async () => {
  await withServer(async ({ baseUrl }) => {
    const listResponse = await request(baseUrl, '/api/users')
    const users = await listResponse.json() as UserAccount[]
    assert.equal(listResponse.status, 200)
    assert.ok(users.some((user) => user.role === 'admin'))
    assert.ok(!JSON.stringify(users).includes('passwordHash'))

    const createBody = JSON.stringify({ email: 'new.hire@example.test', displayName: 'New Hire', role: 'lab_technician', password: PASSWORD })
    const createResponse = await request(baseUrl, '/api/users', { method: 'POST', body: createBody })
    const created = await createResponse.json() as UserAccount
    assert.equal(createResponse.status, 201)
    assert.equal(created.email, 'new.hire@example.test')
    assert.equal(created.role, 'lab_technician')
    assert.equal(created.mustChangePassword, true)
    assert.equal(created.isActive, true)
    assert.ok(!('passwordHash' in created))

    const duplicate = await request(baseUrl, '/api/users', { method: 'POST', body: createBody })
    assert.equal(duplicate.status, 409)

    const weak = await request(baseUrl, '/api/users', {
      method: 'POST', body: JSON.stringify({ email: 'weak@example.test', displayName: 'Weak', role: 'accountant', password: 'onlyletters' }),
    })
    assert.equal(weak.status, 400)

    const roleResponse = await request(baseUrl, `/api/users/${created.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'radiologist' }) })
    assert.equal(roleResponse.status, 200)
    assert.equal((await roleResponse.json() as UserAccount).role, 'radiologist')

    const resetResponse = await request(baseUrl, `/api/users/${created.id}/reset-password`, {
      method: 'POST', body: JSON.stringify({ password: NEW_PASSWORD }),
    })
    assert.equal(resetResponse.status, 204)
    const resetLogin = await login(baseUrl, 'new.hire@example.test', NEW_PASSWORD)
    const resetBody = await resetLogin.json() as LoginBody
    assert.equal(resetLogin.status, 200)
    assert.equal(resetBody.user.mustChangePassword, true)
    assert.equal(resetBody.user.role, 'radiologist')

    const deactivate = await request(baseUrl, `/api/users/${created.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) })
    assert.equal(deactivate.status, 200)
    assert.equal((await deactivate.json() as UserAccount).isActive, false)
    assert.equal((await request(baseUrl, '/api/auth/me', { token: resetBody.token })).status, 401)
    assert.equal((await login(baseUrl, 'new.hire@example.test', NEW_PASSWORD)).status, 401)

    const emptyUpdate = await request(baseUrl, `/api/users/${created.id}`, { method: 'PATCH', body: '{}' })
    assert.equal(emptyUpdate.status, 400)
    const badId = await request(baseUrl, '/api/users/not-a-uuid', { method: 'PATCH', body: JSON.stringify({ isActive: true }) })
    assert.equal(badId.status, 400)
    const missing = await request(baseUrl, '/api/users/00000000-0000-4000-8000-000000000999', { method: 'PATCH', body: JSON.stringify({ isActive: true }) })
    assert.equal(missing.status, 404)

    const me = await (await request(baseUrl, '/api/auth/me')).json() as { user: AuthenticatedUser }
    const selfDeactivate = await request(baseUrl, `/api/users/${me.user.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) })
    assert.equal(selfDeactivate.status, 409)
  })
})

test('user management is forbidden for non-admin roles', async () => {
  await withServer(async ({ baseUrl, auth }) => {
    const target = await createUser(auth, 'target@example.test')
    const token = TEST_TOKENS.branch_manager
    const attempts: Array<[string, TestRequestOptions]> = [
      ['/api/users', { token }],
      ['/api/users', { method: 'POST', body: JSON.stringify({ email: 'x@example.test', displayName: 'X', role: 'admin', password: PASSWORD }), token }],
      [`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }), token }],
      [`/api/users/${target.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: NEW_PASSWORD }), token }],
    ]
    for (const [path, options] of attempts) {
      const response = await request(baseUrl, path, options)
      assert.equal(response.status, 403, `${options.method ?? 'GET'} ${path}`)
      assert.deepEqual(await response.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })
    }
    assert.equal((await request(baseUrl, '/api/users', { token: null })).status, 401)
    assert.equal((await request(baseUrl, '/api/users', { token: TEST_ADMIN_TOKEN })).status, 200)
  })
})

test('repeated failed logins are throttled with 429 even for the correct password', async () => {
  await withServer(async ({ baseUrl, auth }) => {
    await createUser(auth, 'target@example.test')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await login(baseUrl, 'target@example.test', 'Wrong-pass-999')).status, 401)
    }
    const throttled = await login(baseUrl, 'target@example.test')
    const body = await throttled.json() as Record<string, unknown>
    assert.equal(throttled.status, 429)
    assert.equal(body.error, 'Too Many Requests')
    assert.equal(typeof body.retryAfterSeconds, 'number')
    assert.ok(Number(throttled.headers.get('retry-after')) > 0)
  })
})

test('capability helper grants admin everything and other roles only their own capabilities', () => {
  assert.equal(hasCapability('radiologist', 'radiology.report'), true)
  assert.equal(hasCapability('radiologist', 'billing.view'), false)
  assert.equal(hasCapability('branch_manager', 'users.manage'), false)
  assert.equal(hasCapability('admin', 'users.manage'), true)
  assert.ok(!capabilitiesFor('accountant').includes('results.enter'))
})

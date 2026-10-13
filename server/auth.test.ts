import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApp } from './app.js'
import { hasRole, type AuthenticatedUser } from './auth.js'
import { mockRepository } from './domain.js'

const AUTH_ENV_KEYS = [
  'AUTH_REQUIRED',
  'AUTH_ADMIN_EMAIL',
  'AUTH_ADMIN_PASSWORD',
  'AUTH_ADMIN_ROLE',
  'AUTH_ADMIN_DISPLAY_NAME',
  'AUTH_TOKEN_SECRET',
] as const

type AuthEnvironment = Partial<Record<(typeof AUTH_ENV_KEYS)[number], string | undefined>>
type TestServer = { server: Server; baseUrl: string }
type RequestOptions = { method?: string; body?: string; token?: string }

async function startTestServer(): Promise<TestServer> {
  const server = createServer(createApp(mockRepository))
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function request(baseUrl: string, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  if (options.body) headers['content-type'] = 'application/json'
  if (options.token) headers.authorization = `Bearer ${options.token}`
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })
}

async function withEnvironment<T>(values: AuthEnvironment, callback: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]])) as AuthEnvironment
  for (const key of AUTH_ENV_KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await callback()
  } finally {
    for (const key of AUTH_ENV_KEYS) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const configuredEnvironment: AuthEnvironment = {
  AUTH_ADMIN_EMAIL: 'admin@example.test',
  AUTH_ADMIN_PASSWORD: 'test-password-only',
  AUTH_ADMIN_ROLE: 'admin',
  AUTH_ADMIN_DISPLAY_NAME: 'Test Administrator',
  AUTH_TOKEN_SECRET: 'test-token-secret-with-more-than-enough-length',
}

test('unconfigured login returns safe service unavailable response', async () => {
  await withEnvironment({}, async () => {
    const testServer = await startTestServer()
    try {
      const response = await request(testServer.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.test', password: 'anything' }),
      })
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { error: 'Service Unavailable', message: 'Authentication is not configured.' })
    } finally {
      await stopTestServer(testServer.server)
    }
  })
})

test('invalid credentials return the same unauthorized response', async () => {
  await withEnvironment(configuredEnvironment, async () => {
    const testServer = await startTestServer()
    try {
      const response = await request(testServer.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'other@example.test', password: 'wrong-password' }),
      })
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Invalid credentials.' })
    } finally {
      await stopTestServer(testServer.server)
    }
  })
})

test('successful login returns a safe profile and allows me lookup', async () => {
  await withEnvironment(configuredEnvironment, async () => {
    const testServer = await startTestServer()
    try {
      const loginResponse = await request(testServer.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'ADMIN@example.test', password: 'test-password-only' }),
      })
      const login = await loginResponse.json() as { user: AuthenticatedUser; token: string; expiresAt: string }
      assert.equal(loginResponse.status, 200)
      assert.deepEqual(login.user, {
        id: login.user.id,
        email: 'admin@example.test',
        displayName: 'Test Administrator',
        role: 'admin',
      })
      assert.match(login.token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      assert.doesNotThrow(() => new Date(login.expiresAt).toISOString())

      const meResponse = await request(testServer.baseUrl, '/api/auth/me', { token: login.token })
      assert.equal(meResponse.status, 200)
      assert.deepEqual(await meResponse.json(), { user: login.user })
    } finally {
      await stopTestServer(testServer.server)
    }
  })
})

test('me rejects missing and invalid tokens without revealing token state', async () => {
  await withEnvironment(configuredEnvironment, async () => {
    const testServer = await startTestServer()
    try {
      for (const token of [undefined, 'v1.invalid.invalid']) {
        const response = await request(testServer.baseUrl, '/api/auth/me', token === undefined ? {} : { token })
        assert.equal(response.status, 401)
        assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
      }
    } finally {
      await stopTestServer(testServer.server)
    }
  })
})

test('auth required protects clinical routes but leaves health public', async () => {
  await withEnvironment({ AUTH_REQUIRED: 'true' }, async () => {
    const testServer = await startTestServer()
    try {
      const healthResponse = await request(testServer.baseUrl, '/api/health')
      assert.equal(healthResponse.status, 200)

      const dashboardResponse = await request(testServer.baseUrl, '/api/dashboard')
      assert.equal(dashboardResponse.status, 401)
      assert.deepEqual(await dashboardResponse.json(), { error: 'Unauthorized', message: 'Authentication required.' })
    } finally {
      await stopTestServer(testServer.server)
    }
  })
})

test('role helper matches only an allowed role', () => {
  const user: AuthenticatedUser = { id: 'user-1', email: 'user@example.test', displayName: 'User', role: 'radiologist' }
  assert.equal(hasRole(user, ['radiologist', 'admin']), true)
  assert.equal(hasRole(user, ['accountant']), false)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { ConfigError, loadServerConfig } from './config.js'
import { MAX_BODY_BYTES } from './http.js'
import { startTestServer, testHeaders } from './test-support.js'

async function withServer(callback: (baseUrl: string) => Promise<void>): Promise<void> {
  const { server, baseUrl } = await startTestServer()
  try {
    await callback(baseUrl)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('oversized JSON bodies are rejected with 413 before parsing', async () => {
  await withServer(async (baseUrl) => {
    const body = JSON.stringify({ fullName: 'x'.repeat(MAX_BODY_BYTES) })
    const response = await fetch(`${baseUrl}/api/patients`, { method: 'POST', headers: testHeaders({ body }), body })
    assert.equal(response.status, 413)
    assert.equal((await response.json() as Record<string, unknown>).error, 'Payload Too Large')
  })
})

test('non-JSON content types are rejected with 415', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { ...testHeaders(), 'content-type': 'text/plain' },
      body: '{}',
    })
    assert.equal(response.status, 415)
  })
})

test('responses carry security headers and are not cacheable', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(response.headers.get('cache-control'), 'no-store')
  })
})

test('CORS only echoes configured origins', async () => {
  const previous = process.env.CORS_ORIGIN
  process.env.CORS_ORIGIN = 'https://clinic.example'
  try {
    await withServer(async (baseUrl) => {
      const allowed = await fetch(`${baseUrl}/api/health`, { headers: { origin: 'https://clinic.example' } })
      assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://clinic.example')
      const denied = await fetch(`${baseUrl}/api/health`, { headers: { origin: 'https://evil.example' } })
      assert.equal(denied.headers.get('access-control-allow-origin'), null)
    })
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = previous
  }
})

test('server config requires DATABASE_URL unless in-memory mode is explicitly allowed outside production', () => {
  assert.throws(() => loadServerConfig({}), ConfigError)
  assert.throws(() => loadServerConfig({ NODE_ENV: 'production', ALLOW_IN_MEMORY_STORE: 'true' }), ConfigError)
  assert.equal(loadServerConfig({ ALLOW_IN_MEMORY_STORE: 'true' }).databaseUrl, null)
  const config = loadServerConfig({ DATABASE_URL: 'postgresql://u:p@localhost/db', PORT: '4000' })
  assert.equal(config.port, 4000)
  assert.equal(config.host, '127.0.0.1')
  assert.throws(() => loadServerConfig({ DATABASE_URL: 'postgresql://x', PORT: '70000' }), ConfigError)
  assert.equal(config.timeZone, 'Africa/Cairo')
  assert.throws(() => loadServerConfig({ DATABASE_URL: 'postgresql://x', APP_TIMEZONE: 'Mars/Base' }), ConfigError)
})

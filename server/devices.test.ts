import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from './app.js'
import { createMemoryRepository } from './domain.js'
import { checkDeviceConnection, isDeviceProtocol, isDeviceStatus, isSafeDeviceEndpoint, type LabDevice } from './devices.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { RepositoryConflictError } from './storage/repository.js'

async function startTestServer(repository = createMemoryRepository()): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(createApp(repository))
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function request(baseUrl: string, path: string, options: { method?: string; body?: string } = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  })
}

const DEVICE_INPUT = { name: 'Analyzer One', manufacturer: 'Vendor', model: 'Model A', protocol: 'hl7' as const, endpoint: '127.0.0.1:5000' }

 test('device guards accept supported protocols and statuses only', () => {
  assert.equal(isDeviceProtocol('hl7'), true)
  assert.equal(isDeviceProtocol('astm'), true)
  assert.equal(isDeviceProtocol('tcp_ip'), true)
  assert.equal(isDeviceProtocol('serial'), true)
  assert.equal(isDeviceProtocol('http'), false)
  assert.equal(isDeviceStatus('configured'), true)
  assert.equal(isDeviceStatus('online'), true)
  assert.equal(isDeviceStatus('offline'), true)
  assert.equal(isDeviceStatus('unknown'), true)
  assert.equal(isDeviceStatus('connected'), false)
})

test('device endpoint validation rejects credentials and unsafe whitespace', () => {
  assert.equal(isSafeDeviceEndpoint('127.0.0.1:5000'), true)
  assert.equal(isSafeDeviceEndpoint('COM3'), true)
  assert.equal(isSafeDeviceEndpoint('/dev/ttyUSB0'), true)
  assert.equal(isSafeDeviceEndpoint('https://user:secret@example.test/device'), false)
  assert.equal(isSafeDeviceEndpoint('host:5000@secret'), false)
  assert.equal(isSafeDeviceEndpoint('host name:5000'), false)
})

test('memory repository creates, filters, and checks a device without changing stored status', async () => {
  const repository = createMemoryRepository()
  const created = await repository.createDevice({ ...DEVICE_INPUT, status: 'offline', isActive: false })
  assert.equal(created.status, 'offline')
  assert.equal(created.isActive, false)
  assert.equal((await repository.listDevices(true)).length, 0)
  assert.equal((await repository.listDevices(false)).length, 1)
  const result = await repository.checkDeviceConnection(created.id)
  assert.equal(result.device.id, created.id)
  assert.equal(result.status, 'offline')
  assert.equal(result.adapterConfigured, false)
  assert.match(result.message, /adapter/i)
  await assert.rejects(async () => repository.createDevice({ ...DEVICE_INPUT }), RepositoryConflictError)
})

test('device HTTP endpoints create, list, check, and audit without endpoint secrets', async () => {
  const repository = createMemoryRepository()
  const testServer = await startTestServer(repository)
  try {
    const createResponse = await request(testServer.baseUrl, '/api/devices', { method: 'POST', body: JSON.stringify(DEVICE_INPUT) })
    const created = await createResponse.json() as LabDevice
    assert.equal(createResponse.status, 201)
    assert.equal(created.status, 'unknown')
    assert.equal((await request(testServer.baseUrl, '/api/devices?activeOnly=true')).status, 200)
    const checkResponse = await request(testServer.baseUrl, `/api/devices/${created.id}/check-connection`, { method: 'POST' })
    const checked = await checkResponse.json() as { adapterConfigured: boolean; message: string }
    assert.equal(checkResponse.status, 200)
    assert.equal(checked.adapterConfigured, false)
    assert.match(checked.message, /not configured/i)
    const events = await repository.listAuditEvents({ entityType: 'device' })
    assert.equal(events.length, 2)
    assert.ok(events.every((event) => !JSON.stringify(event).includes(DEVICE_INPUT.endpoint)))
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('AUTH_REQUIRED protects device routes', async () => {
  const previous = process.env.AUTH_REQUIRED
  process.env.AUTH_REQUIRED = 'true'
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/devices')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  } finally {
    await stopTestServer(testServer.server)
    if (previous === undefined) delete process.env.AUTH_REQUIRED
    else process.env.AUTH_REQUIRED = previous
  }
})

test('Postgres device methods map rows and use parameterized SQL', async () => {
  const id = '00000000-0000-4000-8000-000000000901'
  const row = {
    id, name: 'Postgres Analyzer', manufacturer: 'Vendor', model: 'M2', protocol: 'astm', endpoint: 'COM4', status: 'configured', is_active: true,
    last_seen_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const fakePool = { query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params })
    return { rows: sql.includes('INSERT INTO') || sql.includes('WHERE id') ? [row] : [] }
  } } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)
  const created = await repository.createDevice({ name: row.name, manufacturer: row.manufacturer, model: row.model, protocol: 'astm', endpoint: row.endpoint })
  assert.equal(created.id, id)
  assert.deepEqual(queries[0].params, [row.name, row.manufacturer, row.model, 'astm', row.endpoint, 'unknown', true])
  assert.equal((await repository.listDevices(true)).length, 0)
  assert.deepEqual(queries[1].params, [true])
  await repository.checkDeviceConnection(id)
  assert.deepEqual(queries[2].params, [id])
  assert.ok(queries.every(({ sql }) => !sql.includes(row.endpoint)))
})

test('connection check does not attempt network or serial access', () => {
  const device: LabDevice = {
    id: '00000000-0000-4000-8000-000000000902', name: 'Pure Check', manufacturer: null, model: null,
    protocol: 'tcp_ip', endpoint: '127.0.0.1:1', status: 'configured', isActive: true, lastSeenAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('network must not be called') }) as typeof fetch
  try {
    assert.doesNotThrow(() => checkDeviceConnection(device))
  } finally {
    globalThis.fetch = originalFetch
  }
})

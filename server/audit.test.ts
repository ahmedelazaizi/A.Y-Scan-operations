import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { createApp } from './app.js'
import { mockRepository } from './domain.js'
import { AUDIT_MAX_METADATA_BYTES, sanitizeAuditMetadata } from './audit.js'

type TestServer = { server: Server; baseUrl: string }

type RequestOptions = { method?: string; body?: string }

async function startTestServer(): Promise<TestServer> {
  const server = createServer(createApp(mockRepository))
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function request(baseUrl: string, path: string, options: RequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  })
}

test('audit metadata keeps only bounded operational values and drops secrets', () => {
  const metadata = sanitizeAuditMetadata({
    status: 'approved',
    password: 'never-store-this',
    token: 'secret-token',
    email: 'person@example.test',
    fullName: 'مريض تجريبي',
    source: 'x'.repeat(10000),
  })
  assert.deepEqual(metadata, { status: 'approved' })
  assert.ok(Buffer.byteLength(JSON.stringify(metadata), 'utf8') <= AUDIT_MAX_METADATA_BYTES)
})

test('memory audit repository lists newest bounded events with filters', async () => {
  const first = await mockRepository.recordAuditEvent({ action: 'test.filter.one', entityType: 'order', metadata: { status: 'created' } })
  await mockRepository.recordAuditEvent({ action: 'test.filter.two', entityType: 'patient', metadata: { status: 'created' } })
  const filtered = await mockRepository.listAuditEvents({ action: 'test.filter.one', limit: 1 })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, first.id)
  assert.equal(filtered[0].entityType, 'order')
})

test('audit endpoint requires authentication when AUTH_REQUIRED is enabled', async () => {
  const previous = process.env.AUTH_REQUIRED
  process.env.AUTH_REQUIRED = 'true'
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/audit-events')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  } finally {
    await stopTestServer(testServer.server)
    if (previous === undefined) delete process.env.AUTH_REQUIRED
    else process.env.AUTH_REQUIRED = previous
  }
})

test('successful patient and order writes create safe audit events', async () => {
  const testServer = await startTestServer()
  try {
    const patientResponse = await request(testServer.baseUrl, '/api/patients', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'مريض تجريبي للتدقيق', phone: '01000000000', sex: 'unknown' }),
    })
    const patient = await patientResponse.json() as { id: string }
    assert.equal(patientResponse.status, 201)

    const orderResponse = await request(testServer.baseUrl, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({ patientId: patient.id, tests: ['CBC'], priority: 'urgent' }),
    })
    assert.equal(orderResponse.status, 201)

    const patientEvents = await mockRepository.listAuditEvents({ action: 'patient.created', limit: 100 })
    const orderEvents = await mockRepository.listAuditEvents({ action: 'order.created', limit: 100 })
    assert.ok(patientEvents.some((event) => event.entityId === patient.id))
    assert.ok(orderEvents.length > 0)
    assert.ok(!JSON.stringify([...patientEvents, ...orderEvents]).includes('password'))
    assert.ok(!JSON.stringify([...patientEvents, ...orderEvents]).includes('token'))
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('audit endpoint does not expose a public POST write surface', async () => {
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/audit-events', { method: 'POST', body: '{}' })
    assert.equal(response.status, 405)
  } finally {
    await stopTestServer(testServer.server)
  }
})

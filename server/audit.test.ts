import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import { mockRepository } from './domain.js'
import { AUDIT_MAX_METADATA_BYTES, sanitizeAuditMetadata } from './audit.js'
import { startTestServer, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function request(baseUrl: string, path: string, options: TestRequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: testHeaders(options),
  })
}

test('audit metadata keeps only bounded operational values and drops secrets', () => {
  const metadata = sanitizeAuditMetadata({
    status: 'approved',
    orderItemId: '00000000-0000-4000-8000-000000000101',
    orderId: '00000000-0000-4000-8000-000000000102',
    password: 'never-store-this',
    token: 'secret-token',
    username: 'person@example.test',
    fullName: 'مريض تجريبي',
    source: 'x'.repeat(10000),
  })
  assert.deepEqual(metadata, {
    orderId: '00000000-0000-4000-8000-000000000102',
    orderItemId: '00000000-0000-4000-8000-000000000101',
    status: 'approved',
  })
  for (const secretKey of ['password', 'token', 'username', 'fullName']) {
    assert.equal(secretKey in metadata, false)
  }
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

test('audit endpoint requires authentication and the audit capability', async () => {
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/audit-events', { token: null })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })

    const forbidden = await request(testServer.baseUrl, '/api/audit-events', { token: TEST_TOKENS.receptionist })
    assert.equal(forbidden.status, 403)
    assert.deepEqual(await forbidden.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })

    const manager = await request(testServer.baseUrl, '/api/audit-events?limit=5', { token: TEST_TOKENS.branch_manager })
    assert.equal(manager.status, 200)
    assert.ok(Array.isArray(await manager.json()))
  } finally {
    await stopTestServer(testServer.server)
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
      body: JSON.stringify({ patientId: patient.id, testIds: ['00000000-0000-4000-8000-000000000101'], priority: 'urgent' }),
    })
    assert.equal(orderResponse.status, 201)

    const meResponse = await request(testServer.baseUrl, '/api/auth/me')
    const me = await meResponse.json() as { user: { id: string } }

    const patientEvents = await mockRepository.listAuditEvents({ action: 'patient.created', limit: 100 })
    const orderEvents = await mockRepository.listAuditEvents({ action: 'order.created', limit: 100 })
    const patientEvent = patientEvents.find((event) => event.entityId === patient.id)
    assert.ok(patientEvent)
    assert.equal(patientEvent.actorId, me.user.id)
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
    assert.equal(response.headers.get('allow'), 'GET')
  } finally {
    await stopTestServer(testServer.server)
  }
})

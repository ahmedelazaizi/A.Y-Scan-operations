import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import {
  canTransitionHomeVisit,
  validateCreateHomeVisitInput,
  validateHomeVisitTransitionInput,
} from './home-visits.js'
import { mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { startTestServer, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'
const PATIENT_ID = '00000000-0000-4000-8000-000000000001'


async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function request(baseUrl: string, path: string, options: TestRequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', body: options.body, headers: testHeaders(options) })
}

test('home visit validation normalizes dates and enforces legal transitions', () => {
  const input = validateCreateHomeVisitInput({
    patientId: PATIENT_ID, orderId: 'AY-10482', address: '  Test Home Address  ', contactPhone: ' 01000000000 ',
    scheduledAt: '2026-04-05T10:30:00+02:00', assignedTo: null, notes: null,
  })
  assert.deepEqual(input, {
    patientId: PATIENT_ID, orderId: 'AY-10482', address: 'Test Home Address', contactPhone: '01000000000',
    scheduledAt: '2026-04-05T08:30:00.000Z', assignedTo: null, notes: null,
  })
  assert.equal(validateCreateHomeVisitInput({ ...input, scheduledAt: 'not-a-date' }), null)
  assert.equal(validateCreateHomeVisitInput({ ...input, scheduledAt: '2026-02-30T09:00:00Z' }), null)
  assert.deepEqual(validateHomeVisitTransitionInput({ status: 'confirmed' }), { status: 'confirmed' })
  assert.equal(canTransitionHomeVisit('scheduled', 'confirmed'), true)
  assert.equal(canTransitionHomeVisit('scheduled', 'in_progress'), false)
  assert.equal(canTransitionHomeVisit('completed', 'cancelled'), false)
  assert.equal(canTransitionHomeVisit('cancelled', 'scheduled'), false)
})

test('memory HTTP home visits create, list, transition, and audit successful changes', async () => {
  const testServer = await startTestServer()
  const address = `Test Home Address ${Date.now()}`
  try {
    const createdResponse = await request(testServer.baseUrl, '/api/home-visits', {
      method: 'POST',
      body: JSON.stringify({ patientId: PATIENT_ID, orderId: 'AY-10482', address, contactPhone: '01000000000', scheduledAt: '2026-05-01T09:00:00Z' }),
    })
    const created = await createdResponse.json() as Record<string, unknown>
    assert.equal(createdResponse.status, 201)
    assert.equal(created.orderId, 'AY-10482')
    assert.equal(created.status, 'scheduled')

    const listedResponse = await request(testServer.baseUrl, `/api/home-visits?patientId=${PATIENT_ID}&status=scheduled`)
    const listed = await listedResponse.json() as Array<Record<string, unknown>>
    assert.equal(listedResponse.status, 200)
    assert.ok(listed.some((visit) => visit.id === created.id && visit.address === address))

    const transitionedResponse = await request(testServer.baseUrl, `/api/home-visits/${created.id as string}/transition`, {
      method: 'POST', body: JSON.stringify({ status: 'confirmed' }),
    })
    assert.equal(transitionedResponse.status, 200)
    assert.equal((await transitionedResponse.json() as Record<string, unknown>).status, 'confirmed')

    const auditEvents = await mockRepository.listAuditEvents({ entityType: 'home_visit' })
    assert.ok(auditEvents.filter((event) => event.entityId === created.id).some((event) => event.action === 'home_visit.created'))
    assert.ok(auditEvents.filter((event) => event.entityId === created.id).some((event) => event.action === 'home_visit.transitioned'))
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('memory HTTP home visits map invalid input, missing records, and illegal transitions', async () => {
  const testServer = await startTestServer()
  try {
    const invalid = await request(testServer.baseUrl, '/api/home-visits?status=unknown')
    assert.equal(invalid.status, 400)

    const missingPatient = await request(testServer.baseUrl, '/api/home-visits', {
      method: 'POST',
      body: JSON.stringify({ patientId: '00000000-0000-4000-8000-000000000099', address: 'Test Address', contactPhone: '01000000000', scheduledAt: '2026-05-01T09:00:00Z' }),
    })
    assert.equal(missingPatient.status, 404)

    const missingVisit = await request(testServer.baseUrl, '/api/home-visits/00000000-0000-4000-8000-000000000099/transition', {
      method: 'POST', body: JSON.stringify({ status: 'confirmed' }),
    })
    assert.equal(missingVisit.status, 404)

    const created = await mockRepository.createHomeVisit(PATIENT_ID, undefined, 'Test Illegal Transition', '01000000000', '2026-05-01T09:00:00Z')
    await mockRepository.transitionHomeVisit(created.id, 'cancelled')
    const illegal = await request(testServer.baseUrl, `/api/home-visits/${created.id}/transition`, {
      method: 'POST', body: JSON.stringify({ status: 'confirmed' }),
    })
    assert.equal(illegal.status, 409)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('home visit routes require authentication and a home visit role', async () => {
  const testServer = await startTestServer()
  try {
    const anonymous = await request(testServer.baseUrl, '/api/home-visits', { token: null })
    assert.equal(anonymous.status, 401)
    assert.deepEqual(await anonymous.json(), { error: 'Unauthorized', message: 'Authentication required.' })

    const accountant = await request(testServer.baseUrl, '/api/home-visits', { token: TEST_TOKENS.accountant })
    assert.equal(accountant.status, 403)
    assert.deepEqual(await accountant.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })

    const labSchedule = await request(testServer.baseUrl, '/api/home-visits', {
      method: 'POST', token: TEST_TOKENS.lab_technician,
      body: JSON.stringify({ patientId: PATIENT_ID, address: 'Test Forbidden Address', contactPhone: '01000000000', scheduledAt: '2026-05-01T09:00:00Z' }),
    })
    assert.equal(labSchedule.status, 403)

    const labTechnician = await request(testServer.baseUrl, '/api/home-visits', { token: TEST_TOKENS.lab_technician })
    assert.equal(labTechnician.status, 200)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('postgres home visit creation resolves public AY order numbers to internal UUIDs', async () => {
  const internalOrderId = '00000000-0000-4000-8000-000000000301'
  const visitId = '00000000-0000-4000-8000-000000000302'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const visitRow = {
    id: visitId, patient_id: PATIENT_ID, order_id: internalOrderId, order_number: 10482,
    address: 'Test Postgres Address', contact_phone: '01000000000', scheduled_at: '2026-05-01T07:00:00.000Z',
    assigned_to: null, status: 'scheduled', notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM patients')) return { rows: [{ id: PATIENT_ID }] }
      if (sql.includes('FROM orders WHERE order_number')) return { rows: [{ id: internalOrderId }] }
      if (sql.includes('INSERT INTO home_visits')) return { rows: [{ id: visitId }] }
      return { rows: [visitRow] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  const visit = await repository.createHomeVisit(PATIENT_ID, 'AY-10482', 'Test Postgres Address', '01000000000', '2026-05-01T09:00:00Z')
  assert.equal(visit.orderId, 'AY-10482')
  assert.match(queries[1].sql, /order_number/)
  assert.deepEqual(queries[1].params, ['10482'])
  assert.deepEqual(queries[2].params, [PATIENT_ID, internalOrderId, 'Test Postgres Address', '01000000000', '2026-05-01T09:00:00.000Z', null, null])
})

test('postgres home visit listing uses parameterized patient and status filters', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return { rows: [] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  assert.deepEqual(await repository.listHomeVisits(PATIENT_ID, 'confirmed'), [])
  assert.match(queries[0].sql, /hv\.patient_id = \$1/)
  assert.match(queries[0].sql, /hv\.status = \$2/)
  assert.deepEqual(queries[0].params, [PATIENT_ID, 'confirmed'])
})

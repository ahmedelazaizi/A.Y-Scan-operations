import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createMemoryRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { startTestServer, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'

const PATIENT_ID = '00000000-0000-4000-8000-000000000001'
const RADIOLOGY_CATALOG_ID = '00000000-0000-4000-8000-000000000104'
const FEE_CATALOG_ID = '00000000-0000-4000-8000-000000000105'
const LAB_CATALOG_ID = '00000000-0000-4000-8000-000000000101'

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function request(baseUrl: string, path: string, options: TestRequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', body: options.body, headers: testHeaders(options) })
}

function studyBody(orderItemId: string): string {
  return JSON.stringify({ orderItemId, modality: 'ct', bodyPart: 'chest', priority: 'urgent', scheduledAt: '2026-02-01T10:00:00.000Z', referringProvider: 'Dr. Test' })
}

async function createReceptionOrder(repository: ReturnType<typeof createMemoryRepository>, testIds = [RADIOLOGY_CATALOG_ID, FEE_CATALOG_ID]) {
  return repository.createReceptionOrder({ patientId: PATIENT_ID, testIds, actor: 'Test receptionist' })
}

async function createStudy(baseUrl: string, orderItemId: string): Promise<Record<string, unknown>> {
  const response = await request(baseUrl, '/api/radiology/studies', { method: 'POST', body: studyBody(orderItemId) })
  assert.equal(response.status, 201)
  return await response.json() as Record<string, unknown>
}

function assertLinkedStudyFields(study: Record<string, unknown>, itemId: string, order: Awaited<ReturnType<typeof createReceptionOrder>>): void {
  assert.equal(study.orderItemId, itemId)
  assert.equal(study.orderId, order.id)
  assert.equal(study.invoiceNumber, order.invoice?.invoiceNumber)
  assert.equal(study.invoiceStatus, order.invoice?.status)
}

test('radiology order-items list contains only unscheduled imaging services, not fee items', async () => {
  const repository = createMemoryRepository()
  const order = await createReceptionOrder(repository)
  const target = order.specimens.find((specimen) => specimen.testName === 'CT chest')
  assert.ok(target?.orderItemId)
  const testServer = await startTestServer(repository)
  try {
    const response = await request(testServer.baseUrl, '/api/radiology/order-items')
    const rows = await response.json() as Array<Record<string, unknown>>
    assert.equal(response.status, 200)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].orderItemId, target.orderItemId)
    assert.equal(rows[0].orderId, order.id)
    assert.equal(rows[0].publicOrderId, order.id)
    assert.equal(rows[0].patientId, PATIENT_ID)
    assert.equal(rows[0].patientName, order.patient)
    assert.equal(rows[0].catalogCode, 'RAD-CT-CHEST')
    assert.equal(rows[0].invoiceNumber, order.invoice?.invoiceNumber)
    assert.equal(rows[0].invoiceStatus, order.invoice?.status)
    assert.ok(!rows.some((row) => row.catalogCode === 'RAD-300'))

    const created = await createStudy(testServer.baseUrl, target.orderItemId)
    assert.match(created.id as string, /^[0-9a-f-]{36}$/i)
    assert.match(created.accessionNumber as string, /^RAD-\d+$/)
    assert.equal(created.status, 'scheduled')
    assert.equal(created.patientId, PATIENT_ID)
    assert.equal(created.orderItemId, target.orderItemId)
    assert.equal(created.orderId, order.id)
    assert.equal(created.catalogCode, 'RAD-CT-CHEST')
    assert.equal(created.invoiceNumber, order.invoice?.invoiceNumber)
    assert.equal(created.invoiceStatus, order.invoice?.status)

    const listed = await request(testServer.baseUrl, '/api/radiology/studies?status=scheduled')
    const studies = await listed.json() as Array<Record<string, unknown>>
    assert.equal(listed.status, 200)
    assert.ok(studies.some((study) => study.id === created.id && study.orderItemId === target.orderItemId))
    const noLongerSchedulable = await request(testServer.baseUrl, '/api/radiology/order-items')
    assert.deepEqual(await noLongerSchedulable.json(), [])
    const duplicate = await request(testServer.baseUrl, '/api/radiology/studies', { method: 'POST', body: studyBody(target.orderItemId) })
    assert.equal(duplicate.status, 409)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('radiology studies enforce scheduled to verified transitions and report requirements', async () => {
  const repository = createMemoryRepository()
  const order = await createReceptionOrder(repository)
  const itemId = order.specimens.find((specimen) => specimen.testName === 'CT chest')?.orderItemId
  assert.ok(itemId)
  const testServer = await startTestServer(repository)
  try {
    const created = await createStudy(testServer.baseUrl, itemId)
    const id = created.id as string
    const startedResponse = await request(testServer.baseUrl, `/api/radiology/studies/${id}/start`, { method: 'POST' })
    assert.equal(startedResponse.status, 200)
    const started = await startedResponse.json() as Record<string, unknown>
    assert.equal(started.status, 'in_progress')
    assertLinkedStudyFields(started, itemId, order)
    const repeatedStart = await request(testServer.baseUrl, `/api/radiology/studies/${id}/start`, { method: 'POST' })
    assert.equal(repeatedStart.status, 409)
    const missingReport = await request(testServer.baseUrl, `/api/radiology/studies/${id}/report`, { method: 'POST', body: JSON.stringify({ reportText: '', impression: '' }) })
    assert.equal(missingReport.status, 400)
    const earlyVerify = await request(testServer.baseUrl, `/api/radiology/studies/${id}/verify`, { method: 'POST' })
    assert.equal(earlyVerify.status, 409)
    const reportedResponse = await request(testServer.baseUrl, `/api/radiology/studies/${id}/report`, { method: 'POST', body: JSON.stringify({ reportText: 'No acute finding.', impression: 'Normal CT study.' }) })
    assert.equal(reportedResponse.status, 200)
    const reported = await reportedResponse.json() as Record<string, unknown>
    assert.equal(reported.status, 'reported')
    assertLinkedStudyFields(reported, itemId, order)
    const verifiedResponse = await request(testServer.baseUrl, `/api/radiology/studies/${id}/verify`, { method: 'POST' })
    const verified = await verifiedResponse.json() as Record<string, unknown>
    assert.equal(verifiedResponse.status, 200)
    assert.equal(verified.status, 'verified')
    assert.equal(verified.verifiedBy, 'Test admin')
    assertLinkedStudyFields(verified, itemId, order)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('radiology creation rejects missing, lab-kind, and fee order items', async () => {
  const repository = createMemoryRepository()
  const imagingOrder = await createReceptionOrder(repository)
  const feeId = imagingOrder.specimens.find((specimen) => specimen.testName === 'Radiology fee')?.orderItemId
  const labOrder = await createReceptionOrder(repository, [LAB_CATALOG_ID])
  const labId = labOrder.specimens[0]?.orderItemId
  assert.ok(feeId && labId)
  const testServer = await startTestServer(repository)
  try {
    const missing = await request(testServer.baseUrl, '/api/radiology/studies', { method: 'POST', body: studyBody('00000000-0000-4000-8000-000000009999') })
    assert.equal(missing.status, 404)
    const fee = await request(testServer.baseUrl, '/api/radiology/studies', { method: 'POST', body: studyBody(feeId) })
    assert.equal(fee.status, 400)
    const wrongKind = await request(testServer.baseUrl, '/api/radiology/studies', { method: 'POST', body: studyBody(labId) })
    assert.equal(wrongKind.status, 400)
    const noAppointment = await request(testServer.baseUrl, '/api/radiology/studies', { method: 'POST', body: JSON.stringify({ orderItemId: imagingOrder.specimens[0]?.orderItemId, modality: 'ct', bodyPart: 'chest' }) })
    assert.equal(noAppointment.status, 400)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('missing radiology studies return 404 and invalid status returns 400', async () => {
  const testServer = await startTestServer(createMemoryRepository())
  try {
    const missing = await request(testServer.baseUrl, '/api/radiology/studies/00000000-0000-4000-8000-000000009999/start', { method: 'POST' })
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: 'Not Found', message: 'Radiology study was not found.' })
    const invalidStatus = await request(testServer.baseUrl, '/api/radiology/studies?status=unknown')
    assert.equal(invalidStatus.status, 400)
    const invalidId = await request(testServer.baseUrl, '/api/radiology/studies/not-a-uuid/start', { method: 'POST' })
    assert.equal(invalidId.status, 400)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('radiology routes require authentication and a radiology role', async () => {
  const testServer = await startTestServer(createMemoryRepository())
  try {
    const anonymous = await request(testServer.baseUrl, '/api/radiology/studies', { token: null })
    assert.equal(anonymous.status, 401)
    assert.deepEqual(await anonymous.json(), { error: 'Unauthorized', message: 'Authentication required.' })
    const labTechnician = await request(testServer.baseUrl, '/api/radiology/studies', { token: TEST_TOKENS.lab_technician })
    assert.equal(labTechnician.status, 403)
    assert.deepEqual(await labTechnician.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })
    const receptionistVerify = await request(testServer.baseUrl, '/api/radiology/studies/00000000-0000-4000-8000-000000009999/verify', { method: 'POST', token: TEST_TOKENS.receptionist })
    assert.equal(receptionistVerify.status, 403)
    const radiologist = await request(testServer.baseUrl, '/api/radiology/order-items', { token: TEST_TOKENS.radiologist })
    assert.equal(radiologist.status, 200)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('postgres radiology creation takes an order-item id and returns linked order metadata', async () => {
  const orderItemId = '00000000-0000-4000-8000-000000000103'
  const patientId = '00000000-0000-4000-8000-000000000101'
  const studyId = '00000000-0000-4000-8000-000000000102'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const studyRow = {
    id: studyId, accession_number: '42', patient_id: patientId, order_item_id: orderItemId, modality: 'mri', body_part: 'brain', priority: 'stat', status: 'scheduled',
    scheduled_at: '2026-02-01T10:00:00.000Z', performed_at: null, report_text: null, impression: null, referring_provider: null, verified_by: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', order_id: '00000000-0000-4000-8000-000000000201', public_order_id: 'AY-77', patient_name: 'Test patient',
    catalog_code: 'RAD-MRI', catalog_name: 'MRI brain', invoice_number: 9, invoice_status: 'issued',
  }
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (queries.length === 1) return { rows: [{ id: orderItemId, order_id: studyRow.order_id, patient_id: patientId, order_number: 77, order_status: 'awaiting_sample', kind: 'radiology', is_fee: false, has_invoice: true }] }
      if (queries.length === 2) return { rows: [{ id: studyId }] }
      return { rows: [studyRow] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)
  const study = await repository.createRadiologyStudy(orderItemId, 'mri', 'brain', 'stat', '2026-02-01T10:00:00.000Z')
  assert.equal(study.accessionNumber, 'RAD-42')
  assert.equal(study.orderItemId, orderItemId)
  assert.equal(study.orderId, studyRow.order_id)
  assert.equal(study.publicOrderId, 'AY-77')
  assert.equal(study.patientName, 'Test patient')
  assert.equal(study.invoiceNumber, 'INV-9')
  assert.match(queries[1].sql, /INSERT INTO radiology_studies/)
  assert.deepEqual(queries[1].params, [patientId, orderItemId, 'mri', 'brain', 'stat', '2026-02-01T10:00:00.000Z', null])
})

test('postgres radiology creation rejects an order item from a cancelled order', async () => {
  const orderItemId = '00000000-0000-4000-8000-000000000103'
  const fakePool = {
    query: async () => ({ rows: [{ id: orderItemId, order_id: '00000000-0000-4000-8000-000000000201', patient_id: PATIENT_ID, order_number: 77, order_status: 'cancelled', kind: 'radiology', is_fee: false, has_invoice: true }] }),
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)
  await assert.rejects(
    async () => repository.createRadiologyStudy(orderItemId, 'mri', 'brain', 'stat', '2026-02-01T10:00:00.000Z'),
    { message: 'Cancelled orders cannot be scheduled for radiology.' },
  )
})

import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createMemoryRepository, mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { startTestServer, TEST_ADMIN_TOKEN, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'

const MOCK_PATIENT_ID = '00000000-0000-4000-8000-000000000001'
const MOCK_CBC_ID = '00000000-0000-4000-8000-000000000101'
const MOCK_URINALYSIS_ID = '00000000-0000-4000-8000-000000000103'
const MOCK_BUNDLE_ID = '00000000-0000-4000-8000-000000000201'
const MOCK_PRACTITIONER_ID = '00000000-0000-4000-8000-000000000301'

async function request(server: Server, baseUrl: string, path: string, options: TestRequestOptions = {}): Promise<Response> {
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      body: options.body,
      headers: testHeaders(options),
    })
  } finally {
    server.close()
  }
}

test('health endpoint returns service status', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/health')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await response.json(), { status: 'ok', service: 'ay-scan-api' })
})

test('readiness endpoint reports memory mode without a database', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/ready')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ready', database: 'memory' })
})

test('readiness endpoint reports configured mode without exposing credentials', async () => {
  const configuredRepository = { ...mockRepository, databaseMode: 'configured' as const }
  const testServer = await startTestServer(configuredRepository)
  const response = await request(testServer.server, testServer.baseUrl, '/api/ready')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ready', database: 'configured' })
})

test('dashboard endpoint returns cards, recent orders, and sample summary', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/dashboard')
  const dashboard = await response.json() as Record<string, unknown>
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(dashboard.metrics))
  assert.equal((dashboard.metrics as unknown[]).length, 4)
  assert.ok(Array.isArray(dashboard.recentOrders))
  assert.deepEqual(Object.keys(dashboard.samples as object).sort(), ['completed', 'completionRate', 'inProgress', 'needsAttention', 'total'])
})

test('orders endpoint returns recent orders', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders')
  const orders = await response.json() as Array<Record<string, unknown>>
  assert.equal(response.status, 200)
  assert.ok(orders.length > 0)
  assert.deepEqual(Object.keys(orders[0]).sort(), ['id', 'patient', 'state', 'status', 'tests', 'time', 'tone'])
})

test('unknown route returns JSON 404', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/missing')
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Not Found' })
})

test('creating an order returns a sequenced awaiting-sample order', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID, MOCK_URINALYSIS_ID], priority: 'urgent' }),
  })
  const order = await response.json() as Record<string, unknown>
  assert.equal(response.status, 201)
  assert.match(order.id as string, /^AY-\d+$/)
  assert.equal(order.patient, 'مريض تجريبي 01')
  assert.equal(order.tests, 'CBC / صورة دم كاملة · Urinalysis / تحليل بول كامل')
  assert.equal(order.state, 'بانتظار العينة')
  assert.equal(order.status, 'awaiting_sample')
  assert.equal(order.tone, 'warning')
  assert.equal(order.priority, 'urgent')
})

test('reception accepts a bundle-only order, snapshots payments, samples, and returns it in the reception list', async () => {
  const repository = createMemoryRepository()
  const createdServer = await startTestServer(repository)
  const response = await request(createdServer.server, createdServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [], bundleIds: [MOCK_BUNDLE_ID], practitionerId: MOCK_PRACTITIONER_ID, fasting: true, diagnosis: 'متابعة', insuranceCoveragePiastres: 2500, initialPaymentPiastres: 3000, paymentMethod: 'cash' }),
  })
  const order = await response.json() as { id: string; fasting: boolean; subtotalPiastres: number; invoice: { id: string; status: string; payments: Array<{ method: string }> }; specimens: Array<{ barcode: string }>; commission: { amountPiastres: number; status: string } }
  assert.equal(response.status, 201)
  assert.equal(order.fasting, true)
  assert.equal(order.subtotalPiastres, 14500)
  assert.equal(order.invoice.status, 'partially_paid')
  assert.deepEqual(order.invoice.payments.map((payment) => payment.method), ['insurance', 'cash'])
  assert.equal(order.specimens.length, 1)
  assert.match(order.specimens[0].barcode, /^AY[A-F0-9]{32}$/)
  assert.deepEqual(order.commission, { amountPiastres: 1200, status: 'pending' })
  assert.equal((await repository.listAuditEvents({ action: 'order.created', entityType: 'order' })).length, 1)

  await repository.recordPayment(String(order.invoice.id), 90, 'cash', undefined, 'Test admin')
  const listServer = await startTestServer(repository)
  const listResponse = await request(listServer.server, listServer.baseUrl, '/api/reception/orders')
  const list = await listResponse.json() as Array<{ id: string; invoice: { id: string; status: string } }>
  assert.equal(listResponse.status, 200)
  assert.equal(list[0].id, order.id)
  assert.equal(list[0].invoice.id, order.invoice.id)
  assert.equal(list[0].invoice.status, 'paid')
  assert.equal(list.find((item) => item.id === 'AY-10482')?.invoice, null)
})

test('reception failure and unauthorized discount leave the order list unchanged', async () => {
  const repository = createMemoryRepository()
  const failedServer = await startTestServer(repository)
  const failed = await request(failedServer.server, failedServer.baseUrl, '/api/orders', {
    method: 'POST', body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID], insuranceCoveragePiastres: 15001 }),
  })
  assert.equal(failed.status, 400)
  const unchangedServer = await startTestServer(repository)
  const unchangedResponse = await request(unchangedServer.server, unchangedServer.baseUrl, '/api/reception/orders')
  const unchanged = await unchangedResponse.json() as Array<Record<string, unknown>>
  assert.equal(unchanged.some((item) => item.id === 'AY-10483'), false)
  assert.equal((await repository.listInvoices()).some((invoice) => invoice.orderId === 'AY-10483'), false)
  assert.equal((await repository.listSpecimens()).length, 0)

  const forbiddenServer = await startTestServer(repository)
  const forbidden = await request(forbiddenServer.server, forbiddenServer.baseUrl, '/api/orders', {
    method: 'POST', token: TEST_TOKENS.receptionist,
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID], discountPiastres: 1 }),
  })
  assert.equal(forbidden.status, 403)
})

test('creating an order without priority defaults to normal', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [MOCK_URINALYSIS_ID] }),
  })
  const order = await response.json() as Record<string, unknown>
  assert.equal(response.status, 201)
  assert.equal(order.priority, 'normal')
})

test('invalid order body returns clear JSON validation error', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientName: 'مريض غير مسجل', tests: ['صورة دم كاملة'] }),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'patientId, testIds (unique catalog ids), and priority are invalid.' })
})

test('orders reject duplicate, unknown, or inactive catalog tests', async () => {
  const duplicateServer = await startTestServer()
  const duplicate = await request(duplicateServer.server, duplicateServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID, MOCK_CBC_ID] }),
  })
  assert.equal(duplicate.status, 400)

  const unknownServer = await startTestServer()
  const unknown = await request(unknownServer.server, unknownServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: ['00000000-0000-4000-8000-000000000999'] }),
  })
  assert.equal(unknown.status, 400)
  assert.deepEqual(await unknown.json(), { error: 'Bad Request', message: 'One or more tests are not in the active catalog.' })

  const missingPatientServer = await startTestServer()
  const missingPatient = await request(missingPatientServer.server, missingPatientServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: '00000000-0000-4000-8000-000000000999', testIds: [MOCK_CBC_ID] }),
  })
  assert.equal(missingPatient.status, 400)
  assert.deepEqual(await missingPatient.json(), { error: 'Bad Request', message: 'patientId does not reference an existing patient.' })
})

test('catalog tests can be created and repriced by managers only', async () => {
  const repository = createMemoryRepository()
  const { server, baseUrl } = await startTestServer(repository)
  try {
    const call = (path: string, method: string, body: unknown, token: string | null = TEST_ADMIN_TOKEN) => fetch(`${baseUrl}${path}`, {
      method, body: JSON.stringify(body), headers: testHeaders({ body: JSON.stringify(body), token }),
    })
    const forbidden = await call('/api/catalog', 'POST', { code: 'TSH', name: 'TSH', specimenType: 'مصل', price: 200 }, TEST_TOKENS.receptionist)
    assert.equal(forbidden.status, 403)
    const created = await call('/api/catalog', 'POST', { code: 'tsh', name: 'هرمون الغدة', specimenType: 'مصل', price: 200, isActive: false }, TEST_TOKENS.branch_manager)
    assert.equal(created.status, 201)
    const item = await created.json() as Record<string, unknown>
    assert.equal(item.code, 'TSH')
    assert.equal(item.isActive, false)
    assert.equal((await call('/api/catalog', 'POST', { code: 'TSH', name: 'x', specimenType: 'y', price: 1 })).status, 409)
    assert.equal((await call('/api/catalog', 'POST', { code: 'bad code', name: 'x', specimenType: 'y', price: 1 })).status, 400)

    const inactiveOrder = await call('/api/orders', 'POST', { patientId: MOCK_PATIENT_ID, testIds: [item.id] })
    assert.equal(inactiveOrder.status, 400)
    const updated = await call(`/api/catalog/${item.id as string}`, 'PATCH', { price: 225.5, isActive: true })
    assert.equal(updated.status, 200)
    assert.deepEqual(await updated.json(), { ...item, price: 225.5, isActive: true })
    assert.equal((await call('/api/orders', 'POST', { patientId: MOCK_PATIENT_ID, testIds: [item.id] })).status, 201)
    assert.equal((await call(`/api/catalog/${item.id as string}`, 'PATCH', {})).status, 400)
    assert.equal((await call('/api/catalog/00000000-0000-4000-8000-000000000999', 'PATCH', { price: 1 })).status, 404)
  } finally {
    server.close()
  }
})

test('malformed order JSON returns clear JSON error', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', { method: 'POST', body: '{' })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'Body must be valid JSON.' })
})

test('unsupported method returns 405 with GET and POST allowed', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', { method: 'PUT' })
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET, POST')
  assert.deepEqual(await response.json(), { error: 'Method Not Allowed' })
})

test('unsupported method lists only the methods registered for that path', async () => {
  const dashboardServer = await startTestServer()
  const dashboardResponse = await request(dashboardServer.server, dashboardServer.baseUrl, '/api/dashboard', { method: 'POST', body: '{}' })
  assert.equal(dashboardResponse.status, 405)
  assert.equal(dashboardResponse.headers.get('allow'), 'GET')

  const collectServer = await startTestServer()
  const collectResponse = await request(collectServer.server, collectServer.baseUrl, '/api/specimens/LAB-ANY/collect')
  assert.equal(collectResponse.status, 405)
  assert.equal(collectResponse.headers.get('allow'), 'POST')
})

test('clinical routes require authentication but health and readiness stay public', async () => {
  for (const path of ['/api/health', '/api/ready']) {
    const publicServer = await startTestServer()
    const response = await request(publicServer.server, publicServer.baseUrl, path, { token: null })
    assert.equal(response.status, 200)
  }

  for (const path of ['/api/dashboard', '/api/orders', '/api/patients', '/api/catalog', '/api/specimens', '/api/results']) {
    const protectedServer = await startTestServer()
    const response = await request(protectedServer.server, protectedServer.baseUrl, path, { token: null })
    assert.equal(response.status, 401, path)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  }

  const invalidServer = await startTestServer()
  const invalidResponse = await request(invalidServer.server, invalidServer.baseUrl, '/api/dashboard', { token: 'not-a-real-token' })
  assert.equal(invalidResponse.status, 401)
})

test('roles without the capability are forbidden from clinical writes', async () => {
  const orderServer = await startTestServer()
  const orderResponse = await request(orderServer.server, orderServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID] }),
    token: TEST_TOKENS.accountant,
  })
  assert.equal(orderResponse.status, 403)
  assert.deepEqual(await orderResponse.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })

  const resultServer = await startTestServer()
  const resultResponse = await request(resultServer.server, resultServer.baseUrl, '/api/results', {
    method: 'POST',
    body: JSON.stringify({ orderItemId: '00000000-0000-4000-8000-000000000201', value: '1', flag: 'normal' }),
    token: TEST_TOKENS.receptionist,
  })
  assert.equal(resultResponse.status, 403)

  const readServer = await startTestServer()
  const readResponse = await request(readServer.server, readServer.baseUrl, '/api/dashboard', { token: TEST_TOKENS.receptionist })
  assert.equal(readResponse.status, 200)
})

test('unexpected repository errors return a generic 500 without details', async () => {
  const failingRepository = {
    ...mockRepository,
    getDashboard: () => { throw new Error('connection string postgres://secret leaked') },
  }
  const testServer = await startTestServer(failingRepository)
  const originalError = console.error
  console.error = () => undefined
  try {
    const response = await request(testServer.server, testServer.baseUrl, '/api/dashboard')
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'Internal Server Error' })
  } finally {
    console.error = originalError
  }
})

test('patients endpoint supports optional search and returns safe records', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/patients?q=%D8%AA%D8%AC%D8%B1%D9%8A%D8%A8%D9%8A')
  const patients = await response.json() as Array<Record<string, unknown>>
  assert.equal(response.status, 200)
  assert.ok(patients.length > 0)
  assert.ok(patients.every((patient) => typeof patient.id === 'string' && typeof patient.fullName === 'string'))
  assert.ok(patients.every((patient) => !('password' in patient) && !('credentials' in patient)))
})

test('creating a patient returns a generated safe record', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/patients', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'مريض تجريبي جديد', phone: '01000000000', dateOfBirth: '1990-01-02', sex: 'female' }),
  })
  const patient = await response.json() as Record<string, unknown>
  assert.equal(response.status, 201)
  assert.match(patient.id as string, /^[0-9a-f-]{36}$/i)
  assert.equal(patient.fullName, 'مريض تجريبي جديد')
  assert.equal(patient.dateOfBirth, '1990-01-02')
  assert.equal(patient.sex, 'female')
  assert.equal(patient.phone, '01000000000')
  assert.ok(!('password' in patient))
})

test('invalid patient input returns a clear validation error', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/patients', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'مريض تجريبي', dateOfBirth: '1990-02-31', sex: 'female' }),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'fullName, dateOfBirth, and sex are invalid.' })
})

test('malformed patient JSON returns a clear JSON error', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/patients', { method: 'POST', body: '{' })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'Body must be valid JSON.' })
})

test('invalid patient sex returns a clear validation error', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/patients', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'مريض تجريبي', sex: 'not-specified' }),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'fullName, dateOfBirth, and sex are invalid.' })
})

test('catalog endpoint returns active bilingual test metadata', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/catalog')
  const catalog = await response.json() as Array<Record<string, unknown>>
  assert.equal(response.status, 200)
  assert.ok(catalog.length > 0)
  assert.ok(catalog.every((item) => typeof item.code === 'string' && typeof item.name === 'string'))
  assert.ok(catalog.every((item) => typeof item.specimenType === 'string' && typeof item.price === 'number' && typeof item.isActive === 'boolean'))
})

test('creating an order with patientId reuses the registered patient', async () => {
  const patientServer = await startTestServer()
  const patientResponse = await request(patientServer.server, patientServer.baseUrl, '/api/patients', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'مريض مرتبط بالطلب', sex: 'unknown' }),
  })
  const patient = await patientResponse.json() as Record<string, unknown>

  const orderServer = await startTestServer()
  const orderResponse = await request(orderServer.server, orderServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientId: patient.id, testIds: [MOCK_CBC_ID] }),
  })
  const order = await orderResponse.json() as Record<string, unknown>
  assert.equal(orderResponse.status, 201)
  assert.equal(order.patient, 'مريض مرتبط بالطلب')
  assert.equal(order.status, 'awaiting_sample')
  assert.equal(order.priority, 'normal')
})

test('specimens can be created, listed, and collected only once', async () => {
  const barcode = 'LAB-TEST-COLLECT-001'
  const createServerTest = await startTestServer()
  const createResponse = await request(createServerTest.server, createServerTest.baseUrl, '/api/specimens', {
    method: 'POST',
    body: JSON.stringify({ orderId: 'AY-10482', specimenType: 'blood', barcode }),
  })
  const created = await createResponse.json() as Record<string, unknown>
  assert.equal(createResponse.status, 201)
  assert.equal(created.status, 'pending')

  const listServer = await startTestServer()
  const listResponse = await request(listServer.server, listServer.baseUrl, '/api/specimens?status=pending')
  const pending = await listResponse.json() as Array<Record<string, unknown>>
  assert.equal(listResponse.status, 200)
  assert.ok(pending.some((specimen) => specimen.barcode === barcode))

  const collectServer = await startTestServer()
  const blockedResponse = await request(collectServer.server, collectServer.baseUrl, `/api/specimens/${barcode}/collect`, { method: 'POST' })
  assert.equal(blockedResponse.status, 409)
  const prematureReceiveServer = await startTestServer()
  assert.equal((await request(prematureReceiveServer.server, prematureReceiveServer.baseUrl, `/api/specimens/${barcode}/receive`, { method: 'POST' })).status, 409)

  const overrideServer = await startTestServer()
  const overrideResponse = await request(overrideServer.server, overrideServer.baseUrl, `/api/specimens/${barcode}/collect-with-override`, {
    method: 'POST', body: JSON.stringify({ reason: 'استثناء إداري موثق' }), token: TEST_TOKENS.branch_manager,
  })
  const collected = await overrideResponse.json() as Record<string, unknown>
  assert.equal(overrideResponse.status, 200)
  assert.equal(collected.status, 'collected')
  assert.equal(typeof collected.collectedAt, 'string')

  const repeatServer = await startTestServer()
  const repeatResponse = await request(repeatServer.server, repeatServer.baseUrl, `/api/specimens/${barcode}/collect`, { method: 'POST' })
  assert.equal(repeatResponse.status, 409)

  const receiveServer = await startTestServer()
  const receivedResponse = await request(receiveServer.server, receiveServer.baseUrl, `/api/specimens/${barcode}/receive`, { method: 'POST' })
  const received = await receivedResponse.json() as Record<string, unknown>
  assert.equal(receivedResponse.status, 200)
  assert.equal(received.status, 'received')
  const repeatReceiveServer = await startTestServer()
  assert.equal((await request(repeatReceiveServer.server, repeatReceiveServer.baseUrl, `/api/specimens/${barcode}/receive`, { method: 'POST' })).status, 409)
})

test('partially paid specimen remains blocked until invoice payment completes', async () => {
  const repository = createMemoryRepository()
  const initialPaymentPiastres = 1000
  const order = await repository.createReceptionOrder({
    patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID], initialPaymentPiastres, actor: 'Specimen test',
  })
  const barcode = order.specimens[0].barcode
  const listBeforeServer = await startTestServer(repository)
  const listBefore = await request(listBeforeServer.server, listBeforeServer.baseUrl, '/api/specimens?status=pending')
  const beforeSpecimen = (await listBefore.json() as Array<Record<string, unknown>>).find((item) => item.barcode === barcode)
  assert.equal(beforeSpecimen?.paymentCleared, false)
  assert.equal(beforeSpecimen?.invoiceStatus, 'partially_paid')

  const blockedServer = await startTestServer(repository)
  assert.equal((await request(blockedServer.server, blockedServer.baseUrl, `/api/specimens/${barcode}/collect`, { method: 'POST' })).status, 409)

  const remainingBalance = order.invoice!.total - initialPaymentPiastres / 100
  const paymentServer = await startTestServer(repository)
  const payment = await request(paymentServer.server, paymentServer.baseUrl, `/api/billing/invoices/${order.invoice!.id}/payments`, {
    method: 'POST', body: JSON.stringify({ amount: remainingBalance, method: 'cash' }),
  })
  assert.equal(payment.status, 201)

  const listAfterServer = await startTestServer(repository)
  const listAfter = await request(listAfterServer.server, listAfterServer.baseUrl, '/api/specimens?status=pending')
  const afterSpecimen = (await listAfter.json() as Array<Record<string, unknown>>).find((item) => item.barcode === barcode)
  assert.equal(afterSpecimen?.paymentCleared, true)
  assert.equal(afterSpecimen?.invoiceStatus, 'paid')

  const collectServer = await startTestServer(repository)
  assert.equal((await request(collectServer.server, collectServer.baseUrl, `/api/specimens/${barcode}/collect`, { method: 'POST' })).status, 200)
})

test('fully insured specimen is eligible for normal collection', async () => {
  const repository = createMemoryRepository()
  const cbc = (await repository.listCatalog()).find((item) => item.id === MOCK_CBC_ID)!
  const totalPiastres = Math.round(cbc.price * 100)
  const order = await repository.createReceptionOrder({
    patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID], insuranceCoveragePiastres: totalPiastres, actor: 'Specimen test',
  })
  const server = await startTestServer(repository)
  assert.equal((await request(server.server, server.baseUrl, `/api/specimens/${order.specimens[0].barcode}/collect`, { method: 'POST' })).status, 200)
})

test('fully cash-paid specimen is eligible for normal collection', async () => {
  const repository = createMemoryRepository()
  const cbc = (await repository.listCatalog()).find((item) => item.id === MOCK_CBC_ID)!
  const totalPiastres = Math.round(cbc.price * 100)
  const order = await repository.createReceptionOrder({
    patientId: MOCK_PATIENT_ID, testIds: [MOCK_CBC_ID], initialPaymentPiastres: totalPiastres, actor: 'Specimen test',
  })
  const server = await startTestServer(repository)
  assert.equal((await request(server.server, server.baseUrl, `/api/specimens/${order.specimens[0].barcode}/collect`, { method: 'POST' })).status, 200)
})

test('specimen override is manager-only, validates its reason, and audits the exception', async () => {
  const repository = createMemoryRepository()
  const specimen = await repository.createSpecimen('AY-10482', 'blood', 'LAB-OVERRIDE-001')
  const deniedServer = await startTestServer(repository)
  const denied = await request(deniedServer.server, deniedServer.baseUrl, `/api/specimens/${specimen.barcode}/collect-with-override`, {
    method: 'POST', body: JSON.stringify({ reason: 'approved' }), token: TEST_TOKENS.receptionist,
  })
  assert.equal(denied.status, 403)

  const invalidServer = await startTestServer(repository)
  const invalid = await request(invalidServer.server, invalidServer.baseUrl, `/api/specimens/${specimen.barcode}/collect-with-override`, {
    method: 'POST', body: JSON.stringify({ reason: '   ' }), token: TEST_TOKENS.branch_manager,
  })
  assert.equal(invalid.status, 400)

  const overrideServer = await startTestServer(repository)
  const override = await request(overrideServer.server, overrideServer.baseUrl, `/api/specimens/${specimen.barcode}/collect-with-override`, {
    method: 'POST', body: JSON.stringify({ reason: 'approved by manager' }), token: TEST_TOKENS.branch_manager,
  })
  assert.equal(override.status, 200)
  const audit = await repository.listAuditEvents({ action: 'specimen.payment_override', entityType: 'specimen' })
  assert.equal(audit.length, 1)
  assert.deepEqual(audit[0].metadata, { reason: 'approved by manager' })
})

test('specimen rejection accepts pending specimens and conflicts after rejection', async () => {
  const repository = createMemoryRepository()
  const specimen = await repository.createSpecimen('AY-10482', 'blood', 'LAB-REJECT-001')
  const rejectedServer = await startTestServer(repository)
  const rejected = await request(rejectedServer.server, rejectedServer.baseUrl, `/api/specimens/${specimen.barcode}/reject`, {
    method: 'POST', body: JSON.stringify({ reason: 'العينة غير صالحة' }),
  })
  assert.equal(rejected.status, 200)
  assert.equal((await rejected.json() as Record<string, unknown>).status, 'rejected')
  const repeatServer = await startTestServer(repository)
  assert.equal((await request(repeatServer.server, repeatServer.baseUrl, `/api/specimens/${specimen.barcode}/reject`, {
    method: 'POST', body: JSON.stringify({ reason: 'تكرار' }),
  })).status, 409)
})

test('invalid and duplicate specimen barcodes return client errors', async () => {
  const invalidServer = await startTestServer()
  const invalidResponse = await request(invalidServer.server, invalidServer.baseUrl, '/api/specimens', {
    method: 'POST',
    body: JSON.stringify({ orderId: 'AY-10482', specimenType: 'blood', barcode: ' ' }),
  })
  assert.equal(invalidResponse.status, 400)

  const barcode = 'LAB-TEST-DUPLICATE-001'
  const firstServer = await startTestServer()
  await request(firstServer.server, firstServer.baseUrl, '/api/specimens', {
    method: 'POST',
    body: JSON.stringify({ orderId: 'AY-10482', specimenType: 'urine', barcode }),
  })
  const duplicateServer = await startTestServer()
  const duplicateResponse = await request(duplicateServer.server, duplicateServer.baseUrl, '/api/specimens', {
    method: 'POST',
    body: JSON.stringify({ orderId: 'AY-10482', specimenType: 'urine', barcode }),
  })
  assert.equal(duplicateResponse.status, 409)
})

test('result entry rejects an unlinked order item without a received specimen', async () => {
  const orderItemId = '00000000-0000-4000-8000-000000000201'
  const server = await startTestServer()
  const response = await request(server.server, server.baseUrl, '/api/results', {
    method: 'POST',
    body: JSON.stringify({ orderItemId, value: '5.4', unit: 'mmol/L', referenceRange: '3.9-5.5', flag: 'normal' }),
  })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'Conflict', message: 'Result requires a received or processing lab specimen.' })
})

test('missing lab operations records return JSON 404 responses', async () => {
  const specimenServer = await startTestServer()
  const specimenResponse = await request(specimenServer.server, specimenServer.baseUrl, '/api/specimens/UNKNOWN-BARCODE/collect', { method: 'POST' })
  assert.equal(specimenResponse.status, 404)
  assert.deepEqual(await specimenResponse.json(), { error: 'Not Found', message: 'Specimen was not found.' })

  const resultServer = await startTestServer()
  const resultResponse = await request(resultServer.server, resultServer.baseUrl, '/api/results/00000000-0000-4000-8000-000000000299/review', { method: 'POST' })
  assert.equal(resultResponse.status, 404)
  assert.deepEqual(await resultResponse.json(), { error: 'Not Found', message: 'Lab result was not found.' })
})

test('postgres specimen creation resolves public AY order numbers before UUID SQL', async () => {
  const internalOrderId = '00000000-0000-4000-8000-000000000301'
  const specimenId = '00000000-0000-4000-8000-000000000302'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const specimenRow = {
    id: specimenId, order_id: internalOrderId, order_number: 10482, barcode: 'LAB-POSTGRES-001', specimen_type: 'blood',
    status: 'pending', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', collected_at: null, rejected_reason: null,
  }
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (queries.length === 1) return { rows: [{ id: internalOrderId }] }
      if (queries.length === 2) return { rows: [{ id: specimenId }] }
      return { rows: [specimenRow] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  const specimen = await repository.createSpecimen('AY-10482', 'blood', 'LAB-POSTGRES-001')
  assert.equal(specimen.orderId, 'AY-10482')
  assert.match(queries[0].sql, /order_number/)
  assert.deepEqual(queries[0].params, ['10482'])
  assert.deepEqual(queries[1].params, [internalOrderId, 'blood', 'LAB-POSTGRES-001'])
})

test('postgres result listing resolves public AY order numbers before UUID filtering', async () => {
  const internalOrderId = '00000000-0000-4000-8000-000000000303'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return queries.length === 1 ? { rows: [{ id: internalOrderId }] } : { rows: [] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  assert.deepEqual(await repository.listResults('AY-10482'), [])
  assert.match(queries[0].sql, /order_number/)
  assert.deepEqual(queries[0].params, ['10482'])
  assert.deepEqual(queries[1].params, [internalOrderId, 100, 0])
})

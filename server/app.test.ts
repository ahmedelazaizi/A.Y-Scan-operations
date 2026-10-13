import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from './app.js'
import { mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'

async function startTestServer(repository = mockRepository): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(createApp(repository))
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

type RequestOptions = { method?: string; body?: string }

async function request(server: Server, baseUrl: string, path: string, options: RequestOptions = {}): Promise<Response> {
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      body: options.body,
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
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
    body: JSON.stringify({ patientName: 'مريض تجريبي جديد', tests: ['صورة دم كاملة'], priority: 'urgent' }),
  })
  const order = await response.json() as Record<string, unknown>
  assert.equal(response.status, 201)
  assert.match(order.id as string, /^AY-\d+$/)
  assert.equal(order.patient, 'مريض تجريبي جديد')
  assert.equal(order.state, 'بانتظار العينة')
  assert.equal(order.status, 'awaiting_sample')
  assert.equal(order.tone, 'warning')
  assert.equal(order.priority, 'urgent')
})

test('creating an order without priority defaults to normal', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientName: 'مريض تجريبي بدون أولوية', tests: ['تحليل بول كامل'] }),
  })
  const order = await response.json() as Record<string, unknown>
  assert.equal(response.status, 201)
  assert.equal(order.priority, 'normal')
})

test('invalid order body returns clear JSON validation error', async () => {
  const testServer = await startTestServer()
  const response = await request(testServer.server, testServer.baseUrl, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ patientName: ' ', tests: [''] }),
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'patientName, tests, and priority are invalid.' })
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
    body: JSON.stringify({ patientId: patient.id, tests: ['صورة دم كاملة'] }),
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
  const collectResponse = await request(collectServer.server, collectServer.baseUrl, `/api/specimens/${barcode}/collect`, { method: 'POST' })
  const collected = await collectResponse.json() as Record<string, unknown>
  assert.equal(collectResponse.status, 200)
  assert.equal(collected.status, 'collected')
  assert.equal(typeof collected.collectedAt, 'string')

  const repeatServer = await startTestServer()
  const repeatResponse = await request(repeatServer.server, repeatServer.baseUrl, `/api/specimens/${barcode}/collect`, { method: 'POST' })
  assert.equal(repeatResponse.status, 409)
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

test('results enter as draft and advance through review states safely', async () => {
  const orderItemId = '00000000-0000-4000-8000-000000000201'
  const enterServer = await startTestServer()
  const enterResponse = await request(enterServer.server, enterServer.baseUrl, '/api/results', {
    method: 'POST',
    body: JSON.stringify({ orderItemId, value: '5.4', unit: 'mmol/L', referenceRange: '3.9-5.5', flag: 'normal' }),
  })
  const entered = await enterResponse.json() as Record<string, unknown>
  assert.equal(enterResponse.status, 201)
  assert.equal(entered.status, 'draft')

  const firstReviewServer = await startTestServer()
  const firstReviewResponse = await request(firstReviewServer.server, firstReviewServer.baseUrl, `/api/results/${entered.id}/review`, { method: 'POST' })
  assert.equal(firstReviewResponse.status, 200)
  assert.equal((await firstReviewResponse.json() as Record<string, unknown>).status, 'in_review')

  const secondReviewServer = await startTestServer()
  const secondReviewResponse = await request(secondReviewServer.server, secondReviewServer.baseUrl, `/api/results/${entered.id}/review`, { method: 'POST' })
  assert.equal(secondReviewResponse.status, 200)
  assert.equal((await secondReviewResponse.json() as Record<string, unknown>).status, 'approved')

  const thirdReviewServer = await startTestServer()
  const thirdReviewResponse = await request(thirdReviewServer.server, thirdReviewServer.baseUrl, `/api/results/${entered.id}/review`, { method: 'POST' })
  assert.equal(thirdReviewResponse.status, 409)

  const listServer = await startTestServer()
  const listResponse = await request(listServer.server, listServer.baseUrl, `/api/results?orderId=${orderItemId}`)
  const results = await listResponse.json() as Array<Record<string, unknown>>
  assert.equal(listResponse.status, 200)
  assert.ok(results.some((result) => result.id === entered.id && result.status === 'approved'))
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
  assert.deepEqual(queries[1].params, [internalOrderId])
})

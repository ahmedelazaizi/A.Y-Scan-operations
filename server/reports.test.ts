import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createMemoryRepository } from './domain.js'
import { validateReportQuery } from './reports.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { startTestServer, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function getReport(baseUrl: string, query = '', options: TestRequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}/api/reports/operations${query}`, { headers: testHeaders(options) })
}

test('memory operations report is zero-safe for an empty period', async () => {
  const repository = createMemoryRepository()
  const report = await repository.getOperationsReport('2099-01-01', '2099-01-31')
  assert.deepEqual(report, {
    period: { from: '2099-01-01', to: '2099-01-31' },
    orders: { total: 0, completed: 0, awaitingSample: 0, inProgress: 0 },
    specimens: { total: 0, collected: 0, processing: 0, completed: 0 },
    results: { total: 0, draft: 0, reviewed: 0 },
    billing: { invoiced: 0, paid: 0, open: 0 },
    radiology: { total: 0, scheduled: 0, inProgress: 0, reported: 0, verified: 0 },
    inventory: { items: 0, lowStock: 0 },
    insurance: { claimsTotal: 0, submitted: 0, approved: 0, paid: 0 },
    homeVisits: { total: 0, scheduled: 0, inProgress: 0, completed: 0 },
  })
})

test('memory operations report counts current order statuses without exposing records', async () => {
  const report = await createMemoryRepository().getOperationsReport()
  assert.deepEqual(report.period, { from: null, to: null })
  assert.deepEqual(report.orders, { total: 4, completed: 1, awaitingSample: 1, inProgress: 2 })
  assert.equal('patient' in report, false)
})

test('report query validation rejects malformed and reversed date ranges', () => {
  assert.deepEqual(validateReportQuery({ from: '2026-01-02', to: '2026-01-31' }), { from: '2026-01-02', to: '2026-01-31' })
  assert.throws(() => validateReportQuery({ from: '2026-02-30' }), /from must be a valid YYYY-MM-DD date/)
  assert.throws(() => validateReportQuery({ from: '2026-02-01', to: '2026-01-31' }), /from must be before or equal to to/)
})

test('operations report route returns a bad request for an invalid range', async () => {
  const testServer = await startTestServer(createMemoryRepository())
  try {
    const response = await getReport(testServer.baseUrl, '?from=2026-02-01&to=2026-01-31')
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'from must be before or equal to to.' })
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('operations report route requires authentication and a finance role', async () => {
  const testServer = await startTestServer(createMemoryRepository())
  try {
    const anonymous = await getReport(testServer.baseUrl, '', { token: null })
    assert.equal(anonymous.status, 401)
    assert.deepEqual(await anonymous.json(), { error: 'Unauthorized', message: 'Authentication required.' })

    const receptionist = await getReport(testServer.baseUrl, '', { token: TEST_TOKENS.receptionist })
    assert.equal(receptionist.status, 403)
    assert.deepEqual(await receptionist.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })

    const accountant = await getReport(testServer.baseUrl, '', { token: TEST_TOKENS.accountant })
    assert.equal(accountant.status, 200)
    assert.deepEqual((await accountant.json() as { orders: unknown }).orders, { total: 4, completed: 1, awaitingSample: 1, inProgress: 2 })
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('postgres operations report uses parameterized date bounds and aggregate fields', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return { rows: [{ orders_total: '2', billing_invoiced: '125.50', billing_paid: '25.50', billing_open: '100.00' }] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  const report = await repository.getOperationsReport('2026-01-01', '2026-01-31')
  assert.equal(report.orders.total, 2)
  assert.equal(report.billing.invoiced, 125.5)
  assert.equal(report.billing.paid, 25.5)
  assert.equal(report.billing.open, 100)
  assert.deepEqual(queries[0].params, ['2026-01-01', '2026-01-31'])
  assert.match(queries[0].sql, /\$1::date/)
  assert.match(queries[0].sql, /\$2::date/)
  assert.match(queries[0].sql, /FROM orders/)
  assert.match(queries[0].sql, /FROM payments/)
  assert.equal(queries[0].sql.includes('2026-01-01'), false)
  assert.equal(queries[0].sql.includes('patient'), false)
})

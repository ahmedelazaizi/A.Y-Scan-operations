import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from './app.js'
import { createMemoryRepository } from './domain.js'
import { validateReportQuery } from './reports.js'
import { createPostgresRepository } from './storage/postgres-repository.js'

const AUTH_KEYS = ['AUTH_REQUIRED'] as const

type TestServer = { server: Server; baseUrl: string }
type Environment = Partial<Record<(typeof AUTH_KEYS)[number], string | undefined>>

async function startTestServer(repository = createMemoryRepository()): Promise<TestServer> {
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

async function withEnvironment<T>(values: Environment, callback: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(AUTH_KEYS.map((key) => [key, process.env[key]])) as Environment
  for (const key of AUTH_KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await callback()
  } finally {
    for (const key of AUTH_KEYS) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
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
  const testServer = await startTestServer()
  try {
    const response = await fetch(`${testServer.baseUrl}/api/reports/operations?from=2026-02-01&to=2026-01-31`)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'from must be before or equal to to.' })
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('operations report route requires authentication when AUTH_REQUIRED is enabled', async () => {
  await withEnvironment({ AUTH_REQUIRED: 'true' }, async () => {
    const testServer = await startTestServer()
    try {
      const response = await fetch(`${testServer.baseUrl}/api/reports/operations`)
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
    } finally {
      await stopTestServer(testServer.server)
    }
  })
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

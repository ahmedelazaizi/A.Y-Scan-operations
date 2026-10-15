import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { RepositoryConflictError, RepositoryInputError, RepositoryNotFoundError } from './storage/repository.js'
import { startTestServer, TEST_TOKENS, testHeaders, type TestRequestOptions } from './test-support.js'

const CASHIER = 'Test cashier'

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function request(baseUrl: string, path: string, options: TestRequestOptions = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: testHeaders(options),
  })
}

function invoiceRow(invoiceId: string, orderId: string, orderNumber = 10482): Record<string, unknown> {
  return {
    id: invoiceId,
    order_id: orderId,
    order_number: orderNumber,
    invoice_number: 1,
    currency: 'EGP',
    subtotal: '20.00',
    discount: '0.00',
    tax: '0.00',
    total: '20.00',
    status: 'draft',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    items: [{ id: '00000000-0000-4000-8000-000000000402', description: 'CBC', quantity: 1, unitPrice: '20.00', lineTotal: '20.00' }],
    payments: [],
  }
}

test('invoice totals are calculated server-side and list filters by status', async () => {
  const invoice = await mockRepository.createInvoice('AY-10482', [
    { description: 'CBC', quantity: 2, unitPrice: 10 },
    { description: 'Vitamin D', quantity: 1, unitPrice: 40 },
  ], 5, 2.5)
  assert.equal(invoice.subtotal, 60)
  assert.equal(invoice.discount, 5)
  assert.equal(invoice.tax, 2.5)
  assert.equal(invoice.total, 57.5)
  assert.equal(invoice.items[0].lineTotal, 20)

  const drafts = await mockRepository.listInvoices('draft')
  assert.ok(drafts.some((candidate) => candidate.id === invoice.id))
  assert.deepEqual((await mockRepository.listInvoices('paid')).filter((candidate) => candidate.id === invoice.id), [])
})

test('payments transition an invoice from partial to paid', async () => {
  const invoice = await mockRepository.createInvoice('AY-10481', [{ description: 'Lipid profile', quantity: 1, unitPrice: 100 }])
  const partial = await mockRepository.recordPayment(invoice.id, 40, 'cash', 'CASH-001', CASHIER)
  assert.equal(partial.status, 'partially_paid')
  assert.equal(partial.payments[0].reference, 'CASH-001')
  assert.equal(partial.payments[0].receivedBy, CASHIER)
  const paid = await mockRepository.recordPayment(invoice.id, 60, 'card', undefined, CASHIER)
  assert.equal(paid.status, 'paid')
  assert.equal(paid.payments.reduce((sum, payment) => sum + payment.amount, 0), 100)
})

test('overpayment, void payment, and invalid method return repository errors', async () => {
  const invoice = await mockRepository.createInvoice('AY-10480', [{ description: 'Urinalysis', quantity: 1, unitPrice: 25 }])
  await assert.rejects(async () => mockRepository.recordPayment(invoice.id, 26, 'cash', undefined, CASHIER), RepositoryConflictError)
  await assert.rejects(async () => mockRepository.recordPayment(invoice.id, 1, 'crypto' as never, undefined, CASHIER), /method is invalid/)

  const client = {
    query: async (sql: string) => {
      if (sql.startsWith('SELECT status, total')) return { rows: [{ status: 'void', total: '25.00' }] }
      return { rows: [] }
    },
    release: () => undefined,
  }
  const fakePool = { connect: async () => client } as unknown as Pool
  const postgresRepository = createPostgresRepository('postgres://unused', fakePool)
  await assert.rejects(async () => postgresRepository.recordPayment('00000000-0000-4000-8000-000000000401', 1, 'cash', undefined, CASHIER), RepositoryConflictError)
})

test('missing order and invoice ids return repository not-found errors', async () => {
  await assert.rejects(
    async () => mockRepository.createInvoice('AY-99999', [{ description: 'Missing order', quantity: 1, unitPrice: 1 }]),
    RepositoryNotFoundError,
  )
  await assert.rejects(async () => mockRepository.recordPayment('missing-invoice', 1, 'cash', undefined, CASHIER), RepositoryNotFoundError)
})

test('billing HTTP endpoints create, list, and record payments', async () => {
  const testServer = await startTestServer()
  try {
    const createResponse = await request(testServer.baseUrl, '/api/billing/invoices', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'AY-10479', items: [{ description: 'Calcium', quantity: 2, unitPrice: 30 }] }),
    })
    const invoice = await createResponse.json() as Record<string, unknown>
    assert.equal(createResponse.status, 201)
    assert.equal(invoice.orderId, 'AY-10479')
    assert.equal(invoice.total, 60)

    const listResponse = await request(testServer.baseUrl, '/api/billing/invoices?status=draft')
    assert.equal(listResponse.status, 200)
    assert.ok((await listResponse.json() as Array<Record<string, unknown>>).some((candidate) => candidate.id === invoice.id))

    const paymentResponse = await request(testServer.baseUrl, `/api/billing/invoices/${invoice.id as string}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: 60, method: 'bank_transfer', reference: 'TR-001' }),
    })
    const paid = await paymentResponse.json() as { status: string; payments: Array<{ receivedBy: string }> }
    assert.equal(paymentResponse.status, 201)
    assert.equal(paid.status, 'paid')
    assert.equal(paid.payments[0].receivedBy, 'Test admin')
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('billing HTTP rejects invalid payment methods without stack traces', async () => {
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/billing/invoices', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'AY-10482', items: [{ description: 'CBC', quantity: 1, unitPrice: 20 }] }),
    })
    const invoice = await response.json() as { id: string }
    const paymentResponse = await request(testServer.baseUrl, `/api/billing/invoices/${invoice.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: 1, method: 'crypto' }),
    })
    const body = await paymentResponse.json() as Record<string, unknown>
    assert.equal(paymentResponse.status, 400)
    assert.equal(body.error, 'Bad Request')
    assert.equal('stack' in body, false)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('billing routes require authentication and a finance role', async () => {
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/billing/invoices', { token: null })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })

    const forbidden = await request(testServer.baseUrl, '/api/billing/invoices', { token: TEST_TOKENS.lab_technician })
    assert.equal(forbidden.status, 403)
    assert.deepEqual(await forbidden.json(), { error: 'Forbidden', message: 'Your role does not allow this action.' })

    const accountant = await request(testServer.baseUrl, '/api/billing/invoices', { token: TEST_TOKENS.accountant })
    assert.equal(accountant.status, 200)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('postgres payments reject a blank actor without inserting a payment', async () => {
  const queries: string[] = []
  const client = {
    query: async (sql: string) => {
      queries.push(sql)
      if (sql.startsWith('SELECT status, total')) return { rows: [{ status: 'draft', total: '25.00' }] }
      if (sql.startsWith('SELECT COALESCE')) return { rows: [{ paid: '0' }] }
      return { rows: [] }
    },
    release: () => undefined,
  }
  const fakePool = { connect: async () => client } as unknown as Pool
  const postgresRepository = createPostgresRepository('postgres://unused', fakePool)
  await assert.rejects(
    async () => postgresRepository.recordPayment('00000000-0000-4000-8000-000000000401', 1, 'cash', undefined, ' '),
    RepositoryInputError,
  )
  assert.ok(queries.every((sql) => !sql.includes('INSERT INTO payments')))
})

test('postgres invoice creation resolves public AY order numbers before UUID inserts', async () => {
  const internalOrderId = '00000000-0000-4000-8000-000000000301'
  const invoiceId = '00000000-0000-4000-8000-000000000302'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('order_number')) return { rows: [{ id: internalOrderId }] }
      if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: invoiceId }] }
      return { rows: [] }
    },
    release: () => undefined,
  }
  const fakePool = {
    connect: async () => client,
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return { rows: [invoiceRow(invoiceId, internalOrderId)] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  const invoice = await repository.createInvoice('AY-10482', [{ description: 'CBC', quantity: 1, unitPrice: 20 }])
  assert.equal(invoice.orderId, 'AY-10482')
  assert.match(queries[1].sql, /order_number/)
  assert.deepEqual(queries[1].params, ['10482'])
})

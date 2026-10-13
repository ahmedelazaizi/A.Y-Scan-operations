import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from './app.js'
import { mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { RepositoryInputError } from './storage/repository.js'

const PATIENT_ID = '00000000-0000-4000-8000-000000000001'
const CLAIM_ID = '00000000-0000-4000-8000-000000000901'

type TestServer = { server: Server; baseUrl: string }
type RequestOptions = { method?: string; body?: string; token?: string }

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
  const headers: Record<string, string> = {}
  if (options.body) headers['content-type'] = 'application/json'
  if (options.token) headers.authorization = `Bearer ${options.token}`
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })
}

function policyInput(memberNumber: string): Record<string, unknown> {
  return {
    patientId: PATIENT_ID,
    payerName: 'A.Y Test Payer',
    memberNumber,
    planName: 'Standard',
    coveragePercent: 80,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
  }
}

test('insurance policies validate input and filter by patient', async () => {
  await assert.rejects(
    async () => mockRepository.createInsurancePolicy(PATIENT_ID, 'Invalid Payer', 'INVALID-1', 'Standard', 101, '2026-01-01'),
    RepositoryInputError,
  )
  const policy = await mockRepository.createInsurancePolicy(PATIENT_ID, 'A.Y List Payer', 'LIST-001', 'Standard', 75, '2026-01-01')
  const policies = await mockRepository.listInsurancePolicies(PATIENT_ID)
  assert.ok(policies.some((candidate) => candidate.id === policy.id && candidate.coveragePercent === 75 && candidate.validTo === null))
  assert.deepEqual(await mockRepository.listInsurancePolicies('00000000-0000-4000-8000-000000000099'), [])
})

test('insurance claims follow the safe workflow and return client errors', async () => {
  const policy = await mockRepository.createInsurancePolicy(PATIENT_ID, 'A.Y Claims Payer', 'CLAIM-001', 'Standard', 80, '2026-01-01')
  const testServer = await startTestServer()
  try {
    const createdResponse = await request(testServer.baseUrl, '/api/insurance/claims', {
      method: 'POST',
      body: JSON.stringify({ policyId: policy.id, orderId: 'AY-10482', amount: 125.5 }),
    })
    const created = await createdResponse.json() as Record<string, unknown>
    assert.equal(createdResponse.status, 201)
    assert.match(created.claimNumber as string, /^CLM-\d+$/)
    assert.equal(created.orderId, 'AY-10482')

    for (const status of ['submitted', 'approved', 'paid']) {
      const response = await request(testServer.baseUrl, `/api/insurance/claims/${created.id as string}/transition`, {
        method: 'POST', body: JSON.stringify({ status }),
      })
      assert.equal(response.status, 200)
      assert.equal((await response.json() as Record<string, unknown>).status, status)
    }

    const invalidTransition = await request(testServer.baseUrl, `/api/insurance/claims/${created.id as string}/transition`, {
      method: 'POST', body: JSON.stringify({ status: 'submitted' }),
    })
    assert.equal(invalidTransition.status, 409)

    const missingClaim = await request(testServer.baseUrl, '/api/insurance/claims/00000000-0000-4000-8000-000000000999/transition', {
      method: 'POST', body: JSON.stringify({ status: 'submitted' }),
    })
    assert.equal(missingClaim.status, 404)

    const invalidAmount = await request(testServer.baseUrl, '/api/insurance/claims', {
      method: 'POST', body: JSON.stringify({ policyId: policy.id, amount: -1 }),
    })
    assert.equal(invalidAmount.status, 400)
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('AUTH_REQUIRED protects insurance routes', async () => {
  const previousAuthRequired = process.env.AUTH_REQUIRED
  process.env.AUTH_REQUIRED = 'true'
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/insurance/policies')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  } finally {
    await stopTestServer(testServer.server)
    if (previousAuthRequired === undefined) delete process.env.AUTH_REQUIRED
    else process.env.AUTH_REQUIRED = previousAuthRequired
  }
})

test('postgres claims map identity and AY order numbers to public values', async () => {
  const policyId = '00000000-0000-4000-8000-000000000902'
  const internalOrderId = '00000000-0000-4000-8000-000000000903'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const row = {
    id: CLAIM_ID, claim_number: 42, policy_id: policyId, order_id: internalOrderId, order_number: 10482,
    amount: '125.50', status: 'draft', submitted_at: null, response_code: null, notes: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM insurance_policies')) return { rows: [{ id: policyId }] }
      if (sql.includes('FROM orders WHERE order_number')) return { rows: [{ id: internalOrderId }] }
      if (sql.includes('INSERT INTO insurance_claims')) return { rows: [{ id: CLAIM_ID }] }
      return { rows: [row] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  const claim = await repository.createInsuranceClaim(policyId, 'AY-10482', 125.5)
  assert.equal(claim.claimNumber, 'CLM-42')
  assert.equal(claim.orderId, 'AY-10482')
  assert.deepEqual(queries[1].params, ['10482'])
  assert.deepEqual(queries[2].params, [policyId, internalOrderId, 125.5])
})

test('insurance policy HTTP input validates and lists by patient', async () => {
  const testServer = await startTestServer()
  try {
    const createdResponse = await request(testServer.baseUrl, '/api/insurance/policies', {
      method: 'POST', body: JSON.stringify(policyInput('HTTP-001')),
    })
    assert.equal(createdResponse.status, 201)
    const policy = await createdResponse.json() as Record<string, unknown>
    const listed = await request(testServer.baseUrl, `/api/insurance/policies?patientId=${PATIENT_ID}`)
    const policies = await listed.json() as Array<Record<string, unknown>>
    assert.equal(listed.status, 200)
    assert.ok(policies.some((candidate) => candidate.id === policy.id))
  } finally {
    await stopTestServer(testServer.server)
  }
})

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from './app.js'
import { mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'

const PATIENT_ID = '00000000-0000-4000-8000-000000000001'

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

function studyBody(): string {
  return JSON.stringify({ patientId: PATIENT_ID, modality: 'ct', bodyPart: 'chest', priority: 'urgent', scheduledAt: '2026-02-01T10:00:00.000Z', referringProvider: 'Dr. Test' })
}

async function createStudy(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await request(baseUrl, '/api/radiology/studies', { method: 'POST', body: studyBody() })
  assert.equal(response.status, 201)
  return await response.json() as Record<string, unknown>
}

test('radiology studies create and list with public accession numbers', async () => {
  const testServer = await startTestServer()
  try {
    const created = await createStudy(testServer.baseUrl)
    assert.match(created.id as string, /^[0-9a-f-]{36}$/i)
    assert.match(created.accessionNumber as string, /^RAD-\d+$/)
    assert.equal(created.status, 'scheduled')
    assert.equal(created.patientId, PATIENT_ID)

    const response = await request(testServer.baseUrl, '/api/radiology/studies?status=scheduled')
    const studies = await response.json() as Array<Record<string, unknown>>
    assert.equal(response.status, 200)
    assert.ok(studies.some((study) => study.id === created.id && study.accessionNumber === created.accessionNumber))
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('radiology studies enforce scheduled to verified transitions and report requirements', async () => {
  const testServer = await startTestServer()
  try {
    const created = await createStudy(testServer.baseUrl)
    const id = created.id as string

    const startedResponse = await request(testServer.baseUrl, `/api/radiology/studies/${id}/start`, { method: 'POST' })
    assert.equal(startedResponse.status, 200)
    assert.equal((await startedResponse.json() as Record<string, unknown>).status, 'in_progress')

    const repeatedStart = await request(testServer.baseUrl, `/api/radiology/studies/${id}/start`, { method: 'POST' })
    assert.equal(repeatedStart.status, 409)

    const missingReport = await request(testServer.baseUrl, `/api/radiology/studies/${id}/report`, {
      method: 'POST', body: JSON.stringify({ reportText: '', impression: '' }),
    })
    assert.equal(missingReport.status, 400)

    const earlyVerify = await request(testServer.baseUrl, `/api/radiology/studies/${id}/verify`, { method: 'POST' })
    assert.equal(earlyVerify.status, 409)

    const reportedResponse = await request(testServer.baseUrl, `/api/radiology/studies/${id}/report`, {
      method: 'POST', body: JSON.stringify({ reportText: 'No acute finding.', impression: 'Normal CT study.' }),
    })
    assert.equal(reportedResponse.status, 200)
    assert.equal((await reportedResponse.json() as Record<string, unknown>).status, 'reported')

    const verifiedResponse = await request(testServer.baseUrl, `/api/radiology/studies/${id}/verify`, { method: 'POST' })
    const verified = await verifiedResponse.json() as Record<string, unknown>
    assert.equal(verifiedResponse.status, 200)
    assert.equal(verified.status, 'verified')
    assert.equal(verified.verifiedBy, 'system')
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('missing radiology studies return 404 and invalid status returns 400', async () => {
  const testServer = await startTestServer()
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

test('AUTH_REQUIRED protects radiology routes', async () => {
  const previousAuthRequired = process.env.AUTH_REQUIRED
  process.env.AUTH_REQUIRED = 'true'
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/radiology/studies')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  } finally {
    await stopTestServer(testServer.server)
    if (previousAuthRequired === undefined) delete process.env.AUTH_REQUIRED
    else process.env.AUTH_REQUIRED = previousAuthRequired
  }
})

test('postgres radiology creation maps generated accession to RAD public id', async () => {
  const patientId = '00000000-0000-4000-8000-000000000101'
  const studyId = '00000000-0000-4000-8000-000000000102'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const row = {
    id: studyId, accession_number: '42', patient_id: patientId, modality: 'mri', body_part: 'brain', priority: 'stat', status: 'scheduled',
    scheduled_at: null, performed_at: null, report_text: null, impression: null, referring_provider: null, verified_by: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
  const fakePool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return queries.length === 1 ? { rows: [{ id: patientId }] } : { rows: [row] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)

  const study = await repository.createRadiologyStudy(patientId, 'mri', 'brain', 'stat')
  assert.equal(study.accessionNumber, 'RAD-42')
  assert.match(queries[1].sql, /INSERT INTO radiology_studies/)
  assert.deepEqual(queries[1].params, [patientId, 'mri', 'brain', 'stat', null, null])
})

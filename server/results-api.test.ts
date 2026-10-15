import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createMemoryRepository } from './domain.js'
import { createMemoryPhase1Store } from './phase1.js'
import { createTestApp, TEST_TOKENS, testHeaders } from './test-support.js'

async function withApi(run: (base: string) => Promise<void>, repository = createMemoryRepository(), phase1 = createMemoryPhase1Store()) {
  const server = createServer((await createTestApp(repository, phase1)).handler)
  server.listen(0); await once(server, 'listening')
  const address = server.address() as { port: number }
  try { await run(`http://127.0.0.1:${address.port}`) } finally { server.close() }
}

async function setup() {
  const repository = createMemoryRepository()
  const phase1 = createMemoryPhase1Store()
  const patient = await repository.createPatient({ fullName: 'API patient', dateOfBirth: '1990-01-01', sex: 'female' })
  const catalog = await repository.createCatalogTest({ code: 'API_TEST', name: 'API test', specimenType: 'blood', price: 10, isActive: true })
  const order = await repository.createReceptionOrder({ patientId: patient.id, testIds: [catalog.id], actor: 'Reception' })
  const specimen = order.specimens[0]
  await repository.collectSpecimenWithPaymentOverride(specimen.barcode)
  await repository.receiveSpecimen(specimen.barcode)
  return { repository, phase1, order, itemId: specimen.orderItemId! }
}

async function call(base: string, path: string, method = 'GET', body?: unknown, token: string | null = TEST_TOKENS.admin) {
  return fetch(`${base}${path}`, { method, headers: testHeaders({ token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

async function addNumericRange(state: Awaited<ReturnType<typeof setup>>) {
  const catalogId = (await state.repository.listCatalog()).find((item) => item.code === 'API_TEST')!.id
  const parameter = await state.phase1.createParameter({ catalogId, code: 'P', nameAr: 'Parameter', nameEn: 'Parameter', sortOrder: 1, resultType: 'numeric', unit: 'u/L', specimen: 'blood', tube: null })
  const proposed = await state.phase1.createRange({ parameterId: parameter.id, resultType: 'numeric', sex: 'all', ageFromYears: 0, ageToYears: null, low: 10, high: 20, criticalLow: 5, criticalHigh: 25, normalText: null, textValue: null, specimen: 'blood', tube: null, note: null, sourceMetadata: {} }, 'proposer')
  await state.phase1.approveRange(proposed.id, 'consultant')
  return { parameter, range: proposed }
}

test('result worklist authorization and no-approved-range result flags are server-derived', async () => {
  const state = await setup()
  await withApi(async (base) => {
    const denied = await call(base, '/api/results/worklist', 'GET', undefined, TEST_TOKENS.accountant)
    assert.equal(denied.status, 403)
    const entered = await call(base, '/api/results', 'POST', { orderItemId: state.itemId, value: '12', flag: 'normal', unit: 'forged', referenceRange: 'forged' })
    assert.equal(entered.status, 201)
    const result = await entered.json() as { flag: string; unit: string | null; referenceRange: string | null }
    assert.equal(result.flag, 'not_applicable')
    assert.equal(result.unit, null)
    assert.equal(result.referenceRange, null)
    const worklist = await call(base, '/api/results/worklist')
    assert.equal(worklist.status, 200)
  }, state.repository, state.phase1)
})

test('worklist includes result history beyond the first 500 repository rows', async () => {
  const state = await setup()
  for (let index = 0; index < 501; index++) {
    await state.repository.enterResult(state.itemId, String(index), undefined, undefined, 'not_applicable', 'Seeder', `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
  }
  await withApi(async (base) => {
    const response = await call(base, '/api/results/worklist')
    assert.equal(response.status, 200)
    const rows = await response.json() as Array<{ results: unknown[] }>
    assert.equal(rows[0].results.length, 501)
  }, state.repository, state.phase1)
})

test('an unlisted work item is rejected without persisting a result', async () => {
  const state = await setup()
  await withApi(async (base) => {
    const before = await state.repository.listResults()
    const response = await call(base, '/api/results', 'POST', { orderItemId: '00000000-0000-4000-8000-000000000999', value: '12' })
    assert.equal(response.status, 409)
    assert.deepEqual(await state.repository.listResults(), before)
  }, state.repository, state.phase1)
})

test('result entry derives unit and low flag from the selected approved range', async () => {
  const state = await setup()
  const { parameter } = await addNumericRange(state)
  await withApi(async (base) => {
    const response = await call(base, '/api/results', 'POST', { orderItemId: state.itemId, parameterId: parameter.id, value: '9' })
    assert.equal(response.status, 201)
    const result = await response.json() as { flag: string; unit: string; referenceRange: string }
    assert.equal(result.flag, 'low')
    assert.equal(result.unit, 'u/L')
    assert.equal(result.referenceRange, '10–20')
  }, state.repository, state.phase1)
})

test('report issue is role-gated and incomplete reports cannot be released', async () => {
  const state = await setup()
  await withApi(async (base) => {
    assert.equal((await call(base, `/api/lab-reports/${state.order.id}/issue`, 'POST', {}, TEST_TOKENS.lab_technician)).status, 403)
    const incomplete = await call(base, `/api/lab-reports/${state.order.id}/issue`, 'POST', {})
    assert.equal(incomplete.status, 400)
  }, state.repository, state.phase1)
})

test('a partially received order cannot issue a report', async () => {
  const repository = createMemoryRepository()
  const phase1 = createMemoryPhase1Store()
  const patient = await repository.createPatient({ fullName: 'Two specimens', dateOfBirth: '1980-01-01', sex: 'male' })
  const first = await repository.createCatalogTest({ code: 'PART_A', name: 'First', specimenType: 'blood', price: 10, isActive: true })
  const second = await repository.createCatalogTest({ code: 'PART_B', name: 'Second', specimenType: 'urine', price: 10, isActive: true })
  const order = await repository.createReceptionOrder({ patientId: patient.id, testIds: [first.id, second.id], actor: 'Reception' })
  await repository.collectSpecimenWithPaymentOverride(order.specimens[0].barcode)
  await repository.receiveSpecimen(order.specimens[0].barcode)
  await withApi(async (base) => {
    const response = await call(base, `/api/lab-reports/${order.id}/issue`, 'POST', {}, TEST_TOKENS.branch_manager)
    assert.equal(response.status, 400)
    assert.deepEqual(await repository.listReportReleases(order.id), [])
  }, repository, phase1)
})

test('issued report preserves the reference range snapshot attached to the result', async () => {
  const state = await setup()
  const { parameter, range } = await addNumericRange(state)
  await withApi(async (base) => {
    const entry = await call(base, '/api/results', 'POST', { orderItemId: state.itemId, parameterId: parameter.id, value: '15' })
    const entered = await entry.json() as { id: string }
    await call(base, `/api/results/${entered.id}/review`, 'POST')
    await call(base, `/api/results/${entered.id}/review`, 'POST', {}, TEST_TOKENS.lab_consultant)
    const newer = await state.phase1.updateRange(range.id, { high: 30 }, 'proposer')
    await state.phase1.approveRange(newer.id, 'consultant')
    const issued = await call(base, `/api/lab-reports/${state.order.id}/issue`, 'POST', {}, TEST_TOKENS.branch_manager)
    assert.equal(issued.status, 201)
    const release = await issued.json() as { contentSnapshot: { items: Array<{ approvedRange: { version: number } }> } }
    assert.equal(release.contentSnapshot.items[0].approvedRange.version, range.version)
  }, state.repository, state.phase1)
})

test('complete fallback result can be issued, fetched by version, and publicly verified without PHI', async () => {
  const state = await setup()
  await withApi(async (base) => {
    const enteredResponse = await call(base, '/api/results', 'POST', { orderItemId: state.itemId, value: 'qualitative' })
    assert.equal(enteredResponse.status, 201)
    const entered = await enteredResponse.json() as { id: string }
    assert.equal((await call(base, `/api/results/${entered.id}/review`, 'POST')).status, 200)
    assert.equal((await call(base, `/api/results/${entered.id}/review`, 'POST')).status, 409)
    assert.equal((await call(base, `/api/results/${entered.id}/review`, 'POST', {}, TEST_TOKENS.lab_consultant)).status, 200)
    const issue = await call(base, `/api/lab-reports/${state.order.id}/issue`, 'POST', {}, TEST_TOKENS.branch_manager)
    assert.equal(issue.status, 201)
    const release = await issue.json() as { id: string; version: number; verificationToken: string }
    assert.equal(release.version, 1)
    const releases = await call(base, `/api/lab-reports/${state.order.id}`, 'GET', undefined, TEST_TOKENS.lab_technician)
    assert.equal((await releases.json() as unknown[]).length, 1)
    const fetched = await call(base, `/api/lab-report-releases/${release.id}`, 'GET', undefined, TEST_TOKENS.lab_consultant)
    assert.equal((await fetched.json() as { id: string }).id, release.id)
    const verified = await call(base, `/api/report-verification/${release.verificationToken}`, 'GET', undefined, null)
    assert.equal(verified.status, 200)
    const publicData = await verified.json() as Record<string, unknown>
    assert.equal(JSON.stringify(publicData).includes('API patient'), false)
    assert.equal(JSON.stringify(publicData).includes('qualitative'), false)
  }, state.repository, state.phase1)
})

test('different authenticated reviewer approves after submission; public verification hides clinical data', async () => {
  const state = await setup()
  const entered = await state.repository.enterResult(state.itemId, '12', undefined, undefined, 'not_applicable', 'Test admin', '00000000-0000-4000-8000-000000000099')
  await state.repository.reviewResult(entered.id, 'Submitter', entered.enteredById!)
  assert.throws(() => state.repository.reviewResult(entered.id, 'Same identity', entered.enteredById!))
  const approved = await state.repository.reviewResult(entered.id, 'Reviewer', '00000000-0000-4000-8000-000000000098')
  assert.equal(approved.status, 'approved')
  const release = await state.repository.releaseReport(state.order.id, '00000000-0000-4000-8000-000000000097', { patient: 'private', result: 'secret' }, { nameEn: 'Lab' })
  await withApi(async (base) => {
    const response = await call(base, `/api/report-verification/${release.verificationToken}`, 'GET', undefined, null)
    assert.equal(response.status, 200)
    const body = await response.json() as Record<string, unknown>
    assert.equal(JSON.stringify(body).includes('private'), false)
    assert.equal(JSON.stringify(body).includes('secret'), false)
  }, state.repository, state.phase1)
})

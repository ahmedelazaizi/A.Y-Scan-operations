import assert from 'node:assert/strict'
import test from 'node:test'
import { createMemoryPhase1Store } from './phase1.js'
import { capabilitiesFor, hasCapability } from './permissions.js'
import { startTestServer, TEST_TOKENS, testHeaders } from './test-support.js'

async function withServer(callback: (baseUrl: string) => Promise<void>): Promise<void> {
  const { server, baseUrl } = await startTestServer()
  try { await callback(baseUrl) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}

test('phase1 settings and practitioner API require auth and record writes', async () => {
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/phase1/settings`)
    assert.equal(unauthenticated.status, 401)
    const settings = await fetch(`${baseUrl}/api/phase1/settings`, { headers: testHeaders() })
    assert.equal(settings.status, 200)
    const practitioner = await fetch(`${baseUrl}/api/phase1/practitioners`, { method: 'POST', headers: testHeaders({ token: TEST_TOKENS.receptionist, body: '{}' }), body: JSON.stringify({ nameAr: 'طبيب اختبار', commissionType: 'fixed', commissionAmountPiastres: 1250 }) })
    assert.equal(practitioner.status, 403)
    const forbiddenPrice = await fetch(`${baseUrl}/api/phase1/catalog/00000000-0000-4000-8000-000000000101/price`, { method: 'PATCH', headers: testHeaders({ token: TEST_TOKENS.receptionist, body: '{}' }), body: JSON.stringify({ pricePiastres: 1200 }) })
    assert.equal(forbiddenPrice.status, 403)
  })
})

test('child reference ranges are proposed and consultant-only approval stays enforced through the API', async () => {
  await withServer(async (baseUrl) => {
    const catalogId = '00000000-0000-4000-8000-000000000102'
    const parameterResponse = await fetch(`${baseUrl}/api/phase1/parameters`, { method: 'POST', headers: testHeaders({ token: TEST_TOKENS.branch_manager, body: '{}' }), body: JSON.stringify({ catalogId, code: 'P1', nameAr: 'معامل اختبار', nameEn: 'Test parameter', sortOrder: 1, resultType: 'numeric', unit: 'mg/dL', specimen: 'دم', tube: 'EDTA' }) })
    assert.equal(parameterResponse.status, 201)
    const parameter = await parameterResponse.json() as { id: string }
    const rangeResponse = await fetch(`${baseUrl}/api/phase1/ranges`, { method: 'POST', headers: testHeaders({ token: TEST_TOKENS.branch_manager, body: '{}' }), body: JSON.stringify({ parameterId: parameter.id, resultType: 'numeric', sex: 'all', ageFromYears: 5, ageToYears: 12, low: 1, high: 2, criticalLow: null, criticalHigh: null, normalText: null, textValue: null, specimen: 'دم', tube: 'EDTA', note: null }) })
    assert.equal(rangeResponse.status, 201)
    const range = await rangeResponse.json() as { id: string; status: string; ageFromYears: number; ageToYears: number | null }
    assert.equal(range.status, 'proposed')
    assert.equal(range.ageFromYears, 5)
    assert.equal(range.ageToYears, 12)
    const adminApproval = await fetch(`${baseUrl}/api/phase1/ranges/${range.id}/approve`, { method: 'POST', headers: testHeaders() })
    assert.equal(adminApproval.status, 403)
    const consultantApproval = await fetch(`${baseUrl}/api/phase1/ranges/${range.id}/approve`, { method: 'POST', headers: testHeaders({ token: TEST_TOKENS.lab_consultant }) })
    assert.equal(consultantApproval.status, 200)
    assert.equal((await consultantApproval.json() as { status: string }).status, 'approved')
  })
})

test('admin cannot approve ranges while consultant capability is explicit', () => {
  assert.equal(hasCapability('admin', 'ranges.approve'), false)
  assert.equal(hasCapability('lab_consultant', 'ranges.approve'), true)
  assert.ok(!capabilitiesFor('admin').includes('ranges.approve'))
  assert.ok(capabilitiesFor('lab_consultant').includes('ranges.approve'))
})

test('memory phase1 range edits create proposed versions without replacing the prior row', async () => {
  const store = createMemoryPhase1Store()
  const first = await store.getSettings()
  assert.equal(first.currencyCode, 'EGP')
  const rangeInput = { parameterId: 'parameter-1', resultType: 'numeric' as const, sex: 'all' as const, ageFromYears: 18, ageToYears: null, low: 1, high: 2, criticalLow: null, criticalHigh: null, normalText: null, textValue: null, specimen: 'دم', tube: 'EDTA', note: null, sourceMetadata: { source: 'test' } }
  const created = await store.createRange(rangeInput, 'actor')
  assert.equal(created.version, 1)
  const updated = await store.updateRange(created.id, { high: 3 }, 'actor')
  assert.equal(updated.version, 2)
  assert.equal(updated.status, 'proposed')
})

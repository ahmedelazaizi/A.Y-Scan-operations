import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateResultRange } from './results.js'
import type { ReferenceRange } from './phase1.js'
import { createMemoryRepository } from './domain.js'
import { RepositoryConflictError } from './storage/repository.js'

function makeRange(overrides: Partial<ReferenceRange> = {}): ReferenceRange {
  return {
    id: 'range-1', parameterId: 'parameter-1', parameterCode: 'P', parameterNameAr: 'Parameter', parameterNameEn: 'Parameter',
    catalogId: 'catalog-1', catalogCode: 'C', catalogNameAr: 'Catalog', catalogNameEn: 'Catalog', version: 2,
    resultType: 'numeric', sex: 'all', ageFromYears: 0, ageToYears: null, low: 10, high: 20,
    criticalLow: 5, criticalHigh: 25, normalText: null, textValue: null, specimen: null, tube: null, note: null,
    status: 'approved', proposedBy: null, approvedBy: 'user-2', approvedAt: '2025-01-01T00:00:00.000Z', sourceMetadata: {},
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const subject = { dateOfBirth: '1990-06-15', sex: 'female', orderDate: '2025-06-14' }

test('approved matching chooses exact sex and narrow age range and snapshots its version', () => {
  const general = makeRange({ id: 'general', sex: 'all', ageFromYears: 18 })
  const exact = makeRange({ id: 'exact', sex: 'female', ageFromYears: 30, ageToYears: 40, version: 7 })
  const evaluation = evaluateResultRange('15', subject, [exact, general])
  assert.equal(evaluation.selectedRange?.id, 'exact')
  assert.equal(evaluation.snapshot?.version, 7)
  assert.equal(evaluation.flag, 'normal')
})

test('critical limits take precedence over low and high limits', () => {
  const range = makeRange({ low: 10, high: 20, criticalLow: 10, criticalHigh: 20 })
  assert.equal(evaluateResultRange('10', subject, [range]).flag, 'critical')
  assert.equal(evaluateResultRange('20', subject, [range]).flag, 'critical')
})

test('noncritical values below and above range get low or high flags', () => {
  const range = makeRange()
  assert.equal(evaluateResultRange('9.99', subject, [range]).flag, 'low')
  assert.equal(evaluateResultRange('20.01', subject, [range]).flag, 'high')
})

test('proposed, stopped, missing-demographic, and unmatched-age ranges are explicit no-range states', () => {
  const cases = [
    { ranges: [makeRange({ status: 'proposed' })], person: subject },
    { ranges: [makeRange({ status: 'stopped' })], person: subject },
    { ranges: [makeRange()], person: { ...subject, dateOfBirth: undefined } },
    { ranges: [makeRange({ sex: 'female', ageFromYears: 40 })], person: subject },
  ]
  for (const scenario of cases) {
    const evaluation = evaluateResultRange('15', scenario.person, scenario.ranges)
    assert.equal(evaluation.rangeStatus, 'no_approved_range')
    assert.equal(evaluation.selectedRange, null)
    assert.equal(evaluation.flag, 'not_applicable')
  }
})

test('numeric parsing is strict and qualitative or text results are not numerically flagged', () => {
  const numeric = makeRange()
  assert.equal(evaluateResultRange('1,000', subject, [numeric]).flag, 'not_applicable')
  assert.equal(evaluateResultRange('Positive', subject, [makeRange({ resultType: 'qualitative', low: null, high: null, criticalLow: null, criticalHigh: null })]).flag, 'not_applicable')
  assert.equal(evaluateResultRange('Free text', subject, [makeRange({ resultType: 'text', low: null, high: null, criticalLow: null, criticalHigh: null })]).flag, 'not_applicable')
})

async function createReceivedResultRepository(enteredById: string | null = '00000000-0000-4000-8000-000000000011') {
  const repository = createMemoryRepository()
  const patient = await repository.createPatient({ fullName: 'Result patient', dateOfBirth: '1990-01-01', sex: 'female' })
  const catalog = await repository.createCatalogTest({ code: 'RESULT_TEST', name: 'Result test', specimenType: 'blood', price: 100, isActive: true })
  const order = await repository.createReceptionOrder({ patientId: patient.id, testIds: [catalog.id], actor: 'Reception' })
  const specimen = order.specimens[0]
  await repository.collectSpecimenWithPaymentOverride(specimen.barcode)
  await repository.receiveSpecimen(specimen.barcode)
  const result = await repository.enterResult(specimen.orderItemId!, '12', 'unit', '10-20', 'normal', 'Shared display name', enteredById ?? undefined)
  return { repository, order, result }
}

test('received specimens accept results and approval requires a different user identity', async () => {
  const { repository, result } = await createReceivedResultRepository()
  assert.equal(result.status, 'draft')
  assert.equal((await repository.reviewResult(result.id, 'Shared display name', result.enteredById!)).status, 'in_review')
  assert.throws(() => repository.reviewResult(result.id, 'Different display name', result.enteredById!), RepositoryConflictError)
  assert.throws(() => repository.reviewResult(result.id, 'Reviewer without identity'), RepositoryConflictError)
  const approved = await repository.reviewResult(result.id, 'Shared display name', '00000000-0000-4000-8000-000000000012')
  assert.equal(approved.status, 'approved')
})

test('approval rejects results without an entering user identity but still permits submission', async () => {
  const { repository, result } = await createReceivedResultRepository(null)
  assert.equal((await repository.reviewResult(result.id, 'Submitter', '00000000-0000-4000-8000-000000000021')).status, 'in_review')
  assert.throws(() => repository.reviewResult(result.id, 'Reviewer', '00000000-0000-4000-8000-000000000022'), RepositoryConflictError)
})

test('amendments create one linked new version without replacing the prior result', async () => {
  const { repository, result } = await createReceivedResultRepository()
  await repository.reviewResult(result.id, 'Reviewer', '00000000-0000-4000-8000-000000000012')
  const approved = await repository.reviewResult(result.id, 'Reviewer', '00000000-0000-4000-8000-000000000012')
  const amended = await repository.amendResult(approved.id, '13', 'unit', '10-20', 'normal', 'Corrected transcription', 'Editor', '00000000-0000-4000-8000-000000000013')
  assert.equal(amended.version, approved.version + 1)
  assert.equal(amended.supersedesResultId, approved.id)
  assert.equal(amended.status, 'draft')
  assert.equal((await repository.listResults()).find((candidate) => candidate.id === approved.id)?.resultValue, '12')
  assert.throws(() => repository.amendResult(approved.id, '14', 'unit', '10-20', 'normal', 'Duplicate branch', 'Editor', '00000000-0000-4000-8000-000000000013'), RepositoryConflictError)
})

test('release snapshots are retrievable by version and public verification excludes patient and result data', async () => {
  const { repository, order, result } = await createReceivedResultRepository()
  await repository.reviewResult(result.id, 'Reviewer', '00000000-0000-4000-8000-000000000012')
  await repository.reviewResult(result.id, 'Reviewer', '00000000-0000-4000-8000-000000000012')
  const released = await repository.releaseReport(order.id, '00000000-0000-4000-8000-000000000014', {
    patientName: 'Private patient', results: ['private result'],
  }, { nameAr: 'مختبر', nameEn: 'Laboratory', licenseNumber: 'LIC-1' })
  const storedResult = (await repository.listResults()).find((candidate) => candidate.id === result.id)
  assert.equal(storedResult?.status, 'released')
  assert.equal(storedResult?.releasedSnapshotId, released.id)
  assert.deepEqual(await repository.getReportRelease(released.id), released)
  const second = await repository.releaseReport(order.id, '00000000-0000-4000-8000-000000000014', {}, { nameEn: 'Laboratory' })
  assert.deepEqual((await repository.listReportReleases(order.id)).map((entry) => entry.version), [2, 1])
  assert.equal((await repository.getReportRelease(second.id))?.version, 2)
  const verification = await repository.getPublicReportVerification(released.verificationToken)
  assert.deepEqual(verification, { authentic: true, version: 1, issuedAt: released.releasedAt, labIdentity: { nameAr: 'مختبر', nameEn: 'Laboratory', licenseNumber: 'LIC-1' } })
  assert.equal(JSON.stringify(verification).includes('Private patient'), false)
  assert.equal(JSON.stringify(verification).includes('private result'), false)
})

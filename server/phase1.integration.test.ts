import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { Pool } from 'pg'
import { runMigrations } from './migrations.js'
import { createStores } from './storage/factory.js'

const adminUrl = process.env.TEST_DATABASE_URL
const PASSWORD = 'Phase1-pass-123'
function databaseUrlFor(name: string): string { const url = new URL(adminUrl as string); url.pathname = `/${name}`; return url.toString() }

test('phase1 PostgreSQL seed is idempotent, uses piastres, and protects consultant approval', { skip: adminUrl ? false : 'TEST_DATABASE_URL is not set' }, async () => {
  const databaseName = `ayscan_p1_${randomBytes(4).toString('hex')}`
  const admin = new Pool({ connectionString: adminUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${databaseName}`)
  const databaseUrl = databaseUrlFor(databaseName)
  const migrationPool = new Pool({ connectionString: databaseUrl, max: 1 })
  const stores = createStores(databaseUrl, { timeZone: 'Africa/Cairo' })
  try {
    await runMigrations(migrationPool, undefined, () => {})
    const administrator = await stores.auth.bootstrapAdmin({ AUTH_ADMIN_USERNAME: 'p1-admin', AUTH_ADMIN_PASSWORD: PASSWORD })
    assert.equal(administrator, 'created')
    const adminUser = (await stores.auth.listUsers()).find((user) => user.username === 'p1-admin')
    if (!adminUser) throw new Error('Phase 1 admin was not created.')
    const consultant = await stores.auth.createUser({ username: 'p1-consultant', displayName: 'استشاري Phase 1', role: 'lab_consultant', password: PASSWORD })
    const first = await stores.phase1Importer.run(adminUser.id)
    const second = await stores.phase1Importer.run(adminUser.id)
    assert.equal(first.priceRowsSeen, 681)
    assert.equal(first.reviewRows, 235)
    assert.equal(first.rangeRowsSeen, 126)
    assert.equal(second.priceRowsInserted, 0)
    assert.equal(second.rangeRowsInserted, 0)
    const counts = await migrationPool.query<{ prices: string; ranges: string }>('SELECT (SELECT count(*) FROM test_catalog WHERE contract_price_piastres IS NOT NULL) prices, (SELECT count(*) FROM reference_ranges) ranges')
    assert.deepEqual(counts.rows[0], { prices: '701', ranges: '126' })
    const price = await migrationPool.query<{ contract_price_piastres: string; price_piastres: string; requires_review: boolean; is_active: boolean }>("SELECT contract_price_piastres,price_piastres,requires_review,is_active FROM test_catalog WHERE code='LAB-001'")
    assert.deepEqual(price.rows[0], { contract_price_piastres: '3900', price_piastres: '3900', requires_review: false, is_active: true })
    const patient = await stores.repository.createPatient({ fullName: 'Phase 1 test patient' })
    const order = await stores.repository.createOrder({ patientId: patient.id, testIds: [String((await migrationPool.query<{ id: string }>("SELECT id FROM test_catalog WHERE code='LAB-001'")).rows[0].id)] })
    const oldInvoice = await stores.repository.createInvoice(order.id, [{ description: 'LAB-001', quantity: 1, unitPrice: 39 }])
    const catalogItem = (await stores.phase1.listCatalogItems()).find((item) => item.code === 'LAB-001')
    if (!catalogItem) throw new Error('Seeded catalog item was not found.')
    await stores.phase1.updateCatalogPrice(catalogItem.id, 4100, adminUser.id)
    const invoiceAfterPriceChange = (await stores.repository.listInvoices()).find((invoice) => invoice.id === oldInvoice.id)
    assert.equal(invoiceAfterPriceChange?.total, oldInvoice.total)
    const reviewed = await migrationPool.query<{ requires_review: boolean; is_active: boolean }>("SELECT requires_review,is_active FROM test_catalog WHERE code='LAB-021'")
    assert.deepEqual(reviewed.rows[0], { requires_review: true, is_active: false })
    const range = await migrationPool.query<{ id: string }>('SELECT id FROM reference_ranges ORDER BY created_at LIMIT 1')
    await assert.rejects(async () => { await stores.phase1.approveRange(range.rows[0].id, adminUser.id) }, /Only an active lab consultant/)
    const approved = await stores.phase1.approveRange(range.rows[0].id, consultant.id)
    assert.equal(approved.status, 'approved')
    const revised = await stores.phase1.updateRange(approved.id, { note: 'نسخة مقترحة' }, consultant.id)
    assert.equal(revised.status, 'proposed')
    assert.equal(revised.version, approved.version + 1)
    const oldRange = (await stores.phase1.listRanges()).find((candidate) => candidate.id === approved.id)
    assert.equal(oldRange?.status, 'approved')
    const createdRange = await stores.phase1.createRange({
      parameterId: approved.parameterId,
      resultType: approved.resultType,
      sex: approved.sex,
      ageFromYears: 0,
      ageToYears: 17,
      low: approved.low,
      high: approved.high,
      criticalLow: approved.criticalLow,
      criticalHigh: approved.criticalHigh,
      normalText: approved.normalText,
      textValue: approved.textValue,
      specimen: approved.specimen,
      tube: approved.tube,
      note: approved.note,
      sourceMetadata: { source: 'phase1-integration-test' },
    }, adminUser.id)
    assert.equal(createdRange.status, 'proposed')
    assert.equal(createdRange.proposedBy, adminUser.id)
    assert.deepEqual(createdRange.sourceMetadata, { source: 'phase1-integration-test' })
  } finally {
    await stores.close()
    await migrationPool.end()
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
    await admin.end()
  }
})

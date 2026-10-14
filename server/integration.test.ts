import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { Pool } from 'pg'
import { createApp } from './app.js'
import { runMigrations } from './migrations.js'
import { createStores } from './storage/factory.js'

const adminUrl = process.env.TEST_DATABASE_URL
const PASSWORD = 'Integration-pass-1'

function databaseUrlFor(name: string): string {
  const url = new URL(adminUrl as string)
  url.pathname = `/${name}`
  return url.toString()
}

test('full clinic workflow against a freshly migrated PostgreSQL database', { skip: adminUrl ? false : 'TEST_DATABASE_URL is not set' }, async () => {
  const databaseName = `ayscan_it_${randomBytes(4).toString('hex')}`
  const admin = new Pool({ connectionString: adminUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${databaseName}`)
  const databaseUrl = databaseUrlFor(databaseName)
  const migrationPool = new Pool({ connectionString: databaseUrl, max: 1 })
  const stores = createStores(databaseUrl, { timeZone: 'Africa/Cairo' })
  const server = createServer(createApp({ repository: stores.repository, auth: stores.auth, phase1: stores.phase1, phase1Importer: stores.phase1Importer }))
  try {
    const first = await runMigrations(migrationPool, undefined, () => {})
    assert.ok(first.applied.length >= 11)
    assert.deepEqual((await runMigrations(migrationPool, undefined, () => {})).applied, [])

    assert.equal(await stores.auth.bootstrapAdmin({ AUTH_ADMIN_USERNAME: 'owner@clinic.test', AUTH_ADMIN_PASSWORD: PASSWORD }), 'created')
    server.listen(0)
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`

    let token = ''
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const payload = response.status === 204 ? null : await response.json() as Record<string, unknown>
      return { status: response.status, payload }
    }

    const login = await call('POST', '/api/auth/login', { username: 'owner@clinic.test', password: PASSWORD })
    assert.equal(login.status, 200)
    token = String(login.payload?.token)

    const seedImport = await call('POST', '/api/phase1/import', {})
    assert.equal(seedImport.status, 200, `POST /api/phase1/import failed: ${JSON.stringify(seedImport.payload)}`)
    assert.equal(seedImport.payload?.priceRowsSeen, 681)
    assert.equal(seedImport.payload?.rangeRowsSeen, 126)

    const seeded = await call('GET', '/api/phase1/catalog')
    assert.ok((seeded.payload as unknown as unknown[]).length >= 20)
    const inactiveCbc = (seeded.payload as unknown as Array<Record<string, unknown>>).find((item) => item.code === 'CBC')
    assert.equal(inactiveCbc?.isActive, false)
    const activated = await call('PATCH', `/api/catalog/${String(inactiveCbc?.id)}`, { isActive: true }).then(async (response) => { assert.equal(response.status, 200); const repriced = await call('PATCH', `/api/phase1/catalog/${String(inactiveCbc?.id)}/price`, { pricePiastres: 15000 }); assert.equal(repriced.status, 200); return response })
    assert.equal(activated.status, 200)
    const activeCatalog = await call('GET', '/api/phase1/catalog')
    const cbc = (activeCatalog.payload as unknown as Array<Record<string, unknown>>).find((item) => item.code === 'CBC')
    assert.equal(cbc?.isActive, true)

    const patient = await call('POST', '/api/patients', { fullName: 'مريض تكامل', phone: '01000000000', sex: 'female' })
    assert.equal(patient.status, 201)
    const search = await call('GET', '/api/patients?q=تكامل')
    assert.equal((search.payload as unknown as unknown[]).length, 1)

    const order = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [String(cbc?.id)], priority: 'urgent', discountPiastres: 10 })
    assert.equal(order.status, 201, `POST /api/orders failed: ${JSON.stringify({ payload: order.payload, patientId: patient.payload?.id, testId: cbc?.id })}`)
    const orderPayload = order.payload as Record<string, unknown> & { invoice: { id: string; total: number; status: string }; specimens: Array<{ barcode: string }> }
    assert.equal(orderPayload.tests, 'صورة دم كاملة (CBC)')
    const orderId = String(orderPayload.id)
    assert.equal(orderPayload.invoice.status, 'issued')
    assert.equal(orderPayload.invoice.total, 149.9)
    assert.equal(orderPayload.specimens.length, 1)
    const firstOrderAudit = await migrationPool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM audit_events ae JOIN orders o ON o.id = ae.entity_id WHERE o.order_number = $1 AND ae.action = 'order.created'`, [orderId.slice(3)])
    assert.equal(firstOrderAudit.rows[0].count, '1')

    const specimen = await call('POST', `/api/specimens/${orderPayload.specimens[0].barcode}/collect`)
    assert.equal(specimen.status, 200)

    const itemRow = await migrationPool.query<{ id: string }>('SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_number = $1', [orderId.slice(3)])
    const result = await call('POST', '/api/results', { orderItemId: itemRow.rows[0].id, value: '13.2', unit: 'g/dL', flag: 'normal' })
    assert.equal(result.status, 201)
    assert.equal(result.payload?.enteredBy, 'مدير النظام')
    await call('POST', `/api/results/${String(result.payload?.id)}/review`)
    const approved = await call('POST', `/api/results/${String(result.payload?.id)}/review`)
    assert.equal(approved.payload?.status, 'approved')

    const invoiceId = orderPayload.invoice.id
    for (const amount of [49.97, 49.97, 49.96]) {
      assert.equal((await call('POST', `/api/billing/invoices/${invoiceId}/payments`, { amount, method: 'cash' })).status, 201)
    }
    const invoices = await call('GET', '/api/billing/invoices?status=paid&limit=10')
    assert.equal((invoices.payload as unknown as unknown[]).length, 1)
    assert.equal((await call('POST', `/api/billing/invoices/${invoiceId}/payments`, { amount: 0.01, method: 'cash' })).status, 409)

    const dashboard = await call('GET', '/api/dashboard')
    const metrics = dashboard.payload?.metrics as Array<Record<string, unknown>>
    assert.equal(metrics[0].value, '1')
    assert.equal(metrics[2].value, '1')
    assert.equal(metrics[3].value, '149.90')

    const report = await call('GET', '/api/reports/operations')
    assert.equal(report.status, 200)
    const audit = await call('GET', '/api/audit-events?limit=100')
    assert.ok((audit.payload as unknown as Array<Record<string, unknown>>).some((event) => event.action === 'payment.recorded'))

    const practitionerResponse = await call('POST', '/api/phase1/practitioners', { nameAr: 'طبيب استقبال تكامل', nameEn: 'Reception Doctor', specialty: 'باطنة', phone: null, commissionType: 'fixed', commissionPercent: null, commissionAmountPiastres: 1500, isActive: true })
    assert.equal(practitionerResponse.status, 201)
    const practitionerId = String(practitionerResponse.payload?.id)
    const bundleResponse = await call('POST', '/api/phase1/bundles', { code: `ITB_${randomBytes(3).toString('hex').toUpperCase()}`, nameAr: 'باقة استقبال تكامل', nameEn: 'Reception Integration Bundle', pricePiastres: 18000, isActive: true, items: [{ catalogId: String(cbc?.id), quantity: 1 }] })
    assert.equal(bundleResponse.status, 201)
    const bundleId = String(bundleResponse.payload?.id)
    const receptionOrder = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [], bundleIds: [bundleId], practitionerId, fasting: true, diagnosis: 'تكامل الاستقبال', discountPiastres: 1000, insuranceCoveragePiastres: 5000, insuranceCompany: 'شركة يدوية للاختبار', initialPaymentPiastres: 4000, paymentMethod: 'card', paymentReference: 'IT-PAY-1' })
    assert.equal(receptionOrder.status, 201)
    const receptionPayload = receptionOrder.payload as Record<string, unknown> & { invoice: { id: string; status: string; payments: unknown[] }; commission: { amountPiastres: number }; specimens: unknown[] }
    assert.equal(receptionPayload.status, 'awaiting_sample')
    assert.equal(receptionPayload.subtotalPiastres, 18000)
    assert.equal(receptionPayload.invoice.status, 'partially_paid')
    assert.equal(receptionPayload.invoice.payments.length, 2)
    assert.equal(receptionPayload.commission.amountPiastres, 1500)
    assert.equal(receptionPayload.specimens.length, 1)
    const receptionId = String(receptionPayload.id)
    const receptionStored = await migrationPool.query<{ order_count: string; item_count: string; specimen_count: string; commission_count: string; insurance_amount: string }>(`SELECT
      (SELECT COUNT(*) FROM orders WHERE order_number = $1) AS order_count,
      (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_number = $1) AS item_count,
      (SELECT COUNT(*) FROM specimens s JOIN orders o ON o.id = s.order_id WHERE o.order_number = $1) AS specimen_count,
      (SELECT COUNT(*) FROM practitioner_commissions pc JOIN orders o ON o.id = pc.order_id WHERE o.order_number = $1) AS commission_count,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1 AND p.method = 'insurance') AS insurance_amount,
      (SELECT COUNT(*) FROM audit_events ae JOIN orders o ON o.id = ae.entity_id WHERE o.order_number = $1 AND ae.action = 'order.created' AND ae.entity_type = 'order') AS order_audit_count`, [receptionId.slice(3)])
    assert.deepEqual(receptionStored.rows[0], { order_count: '1', item_count: '1', specimen_count: '1', commission_count: '1', insurance_amount: '50.00', order_audit_count: '1' })
    const receptionList = await call('GET', '/api/reception/orders?limit=100')
    assert.ok((receptionList.payload as unknown as Array<Record<string, unknown>>).some((item) => item.id === receptionId))
    const collectRemaining = await call('POST', `/api/billing/invoices/${receptionPayload.invoice.id}/payments`, { amount: 80, method: 'cash' })
    assert.equal(collectRemaining.status, 201)
    const paidReceptionList = await call('GET', '/api/reception/orders?limit=100')
    const paidReception = (paidReceptionList.payload as unknown as Array<Record<string, unknown>>).find((item) => item.id === receptionId)
    assert.equal((paidReception?.invoice as { status?: string } | undefined)?.status, 'paid')

    await migrationPool.query(`CREATE FUNCTION it_fail_invoice_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected invoice failure'; END $$`)
    await migrationPool.query('CREATE TRIGGER it_fail_invoice_item_trigger BEFORE INSERT ON invoice_items FOR EACH ROW EXECUTE FUNCTION it_fail_invoice_item()')
    const artifactCounts = `SELECT
      (SELECT COUNT(*) FROM orders o WHERE o.patient_id = $1) AS orders,
      (SELECT COUNT(*) FROM invoices i JOIN orders o ON o.id = i.order_id WHERE o.patient_id = $1) AS invoices,
      (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.patient_id = $1) AS items,
      (SELECT COUNT(*) FROM specimens s JOIN orders o ON o.id = s.order_id WHERE o.patient_id = $1) AS specimens,
      (SELECT COUNT(*) FROM practitioner_commissions pc JOIN orders o ON o.id = pc.order_id WHERE o.patient_id = $1) AS commissions,
      (SELECT COUNT(*) FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN orders o ON o.id = i.order_id WHERE o.patient_id = $1) AS payments`
    const beforeFailedCreate = await migrationPool.query(artifactCounts, [patient.payload?.id])
    const failedReception = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [String(cbc?.id)] })
    assert.equal(failedReception.status, 500)
    const afterFailedCreate = await migrationPool.query(artifactCounts, [patient.payload?.id])
    assert.deepEqual(afterFailedCreate.rows[0], beforeFailedCreate.rows[0])
    await migrationPool.query('DROP TRIGGER it_fail_invoice_item_trigger ON invoice_items')
    await migrationPool.query('DROP FUNCTION it_fail_invoice_item()')
  } finally {
    server.closeAllConnections()
    server.close()
    await stores.close()
    await migrationPool.end()
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
    await admin.end()
  }
})

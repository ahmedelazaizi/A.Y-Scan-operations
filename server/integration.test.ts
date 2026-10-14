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

    const specimenBarcode = orderPayload.specimens[0].barcode
    const blockedCollection = await call('POST', `/api/specimens/${specimenBarcode}/collect`)
    assert.equal(blockedCollection.status, 409)
    for (const amount of [49.97, 49.97, 49.96]) {
      assert.equal((await call('POST', `/api/billing/invoices/${orderPayload.invoice.id}/payments`, { amount, method: 'cash' })).status, 201)
    }
    const specimen = await call('POST', `/api/specimens/${specimenBarcode}/collect`)
    assert.equal(specimen.status, 200)
    assert.equal((await call('POST', `/api/specimens/${specimenBarcode}/receive`)).status, 200)

    const itemRow = await migrationPool.query<{ id: string }>('SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_number = $1', [orderId.slice(3)])
    const result = await call('POST', '/api/results', { orderItemId: itemRow.rows[0].id, value: '13.2', unit: 'g/dL', flag: 'normal' })
    assert.equal(result.status, 201)
    assert.equal(result.payload?.enteredBy, 'مدير النظام')
    const firstReview = await call('POST', `/api/results/${String(result.payload?.id)}/review`)
    assert.equal(firstReview.payload?.status, 'in_review')
    await stores.auth.createUser({ username: 'consultant@clinic.test', displayName: 'استشاري المختبر', role: 'lab_consultant', password: PASSWORD }, { mustChangePassword: false })
    const consultantLogin = await call('POST', '/api/auth/login', { username: 'consultant@clinic.test', password: PASSWORD })
    assert.equal(consultantLogin.status, 200)
    token = String(consultantLogin.payload?.token)
    const approved = await call('POST', `/api/results/${String(result.payload?.id)}/review`)
    assert.equal(approved.status, 200, `POST /api/results/:id/review failed: ${JSON.stringify(approved.payload)}`)
    assert.equal(approved.payload?.status, 'approved')
    token = String(login.payload?.token)

    const invoiceId = orderPayload.invoice.id
    const invoices = await call('GET', '/api/billing/invoices?status=paid&limit=10')
    assert.equal((invoices.payload as unknown as unknown[]).length, 1)
    assert.equal((await call('POST', `/api/billing/invoices/${invoiceId}/payments`, { amount: 0.01, method: 'cash' })).status, 409)

    const dashboard = await call('GET', '/api/dashboard')
    const metrics = dashboard.payload?.metrics as Array<Record<string, unknown>>
    assert.equal(metrics[0].value, '1')
    assert.equal(metrics[2].value, '1')
    assert.equal(metrics[3].value, '149.90')

    const radiologyCatalog = await migrationPool.query<{ id: string; is_active: boolean; name: string }>("SELECT id, is_active, name FROM test_catalog WHERE code = 'RAD-045'")
    assert.equal(radiologyCatalog.rows.length, 1)
    const radiologyService = radiologyCatalog.rows[0]
    if (!radiologyService.is_active) {
      const activatedRadiology = await call('PATCH', `/api/catalog/${radiologyService.id}`, { isActive: true })
      assert.equal(activatedRadiology.status, 200)
    }
    const radiologyFee = await migrationPool.query<{ id: string; name: string }>("SELECT id, name FROM test_catalog WHERE code = 'RAD-300'")
    assert.equal(radiologyFee.rows.length, 1)
    const radiologyOrderResponse = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [radiologyService.id, radiologyFee.rows[0].id], priority: 'urgent' })
    assert.equal(radiologyOrderResponse.status, 201, `POST /api/orders with radiology items failed: ${JSON.stringify(radiologyOrderResponse.payload)}`)
    const radiologyOrder = radiologyOrderResponse.payload as Record<string, unknown> & { id: string; invoice: { id: string; invoiceNumber: string; status: string; total: number } }
    const radiologyStoredOrder = await migrationPool.query<{ id: string }>('SELECT id FROM orders WHERE order_number = $1', [radiologyOrder.id.slice(3)])
    const radiologyInternalOrderId = radiologyStoredOrder.rows[0].id
    assert.equal(radiologyOrder.invoice.status, 'issued')
    const invoiceLines = await migrationPool.query<{ description: string }>('SELECT description FROM invoice_items WHERE invoice_id = $1 ORDER BY item_index', [radiologyOrder.invoice.id])
    assert.deepEqual(invoiceLines.rows.map((line) => line.description).sort(), [radiologyService.name, radiologyFee.rows[0].name].sort())

    const radiologyItemsResponse = await call('GET', '/api/radiology/order-items')
    assert.equal(radiologyItemsResponse.status, 200)
    const radiologyItems = radiologyItemsResponse.payload as unknown as Array<Record<string, unknown>>
    const radiologyOrderItems = await migrationPool.query<{ id: string; code: string }>(`SELECT oi.id, tc.code FROM order_items oi JOIN test_catalog tc ON tc.id = oi.test_catalog_id WHERE oi.order_id = $1`, [radiologyInternalOrderId])
    const serviceOrderItemId = radiologyOrderItems.rows.find((item) => item.code === 'RAD-045')?.id
    const feeOrderItemId = radiologyOrderItems.rows.find((item) => item.code === 'RAD-300')?.id
    assert.ok(serviceOrderItemId && feeOrderItemId)
    const schedulableItem = radiologyItems.find((item) => item.orderItemId === serviceOrderItemId)
    assert.ok(schedulableItem)
    assert.equal(schedulableItem.catalogCode, 'RAD-045')
    assert.equal(schedulableItem.orderId, radiologyInternalOrderId)
    assert.equal(schedulableItem.publicOrderId, radiologyOrder.id)
    assert.equal(schedulableItem.patientId, patient.payload?.id)
    assert.equal(schedulableItem.patientName, 'مريض تكامل')
    assert.equal(schedulableItem.catalogName, radiologyService.name)
    assert.equal(schedulableItem.invoiceNumber, radiologyOrder.invoice.invoiceNumber)
    assert.equal(schedulableItem.invoiceStatus, radiologyOrder.invoice.status)
    assert.ok(!radiologyItems.some((item) => item.orderItemId === feeOrderItemId || item.catalogCode === 'RAD-300'))

    const studyInput = { orderItemId: serviceOrderItemId, modality: 'ct', bodyPart: 'chest', priority: 'urgent', scheduledAt: '2026-02-01T10:00:00.000Z', referringProvider: 'Integration radiologist' }
    const rejectedFeeStudy = await call('POST', '/api/radiology/studies', { ...studyInput, orderItemId: feeOrderItemId })
    assert.equal(rejectedFeeStudy.status, 400)
    const scheduledStudyResponse = await call('POST', '/api/radiology/studies', studyInput)
    assert.equal(scheduledStudyResponse.status, 201, `POST /api/radiology/studies failed: ${JSON.stringify(scheduledStudyResponse.payload)}`)
    const scheduledStudy = scheduledStudyResponse.payload as Record<string, unknown> & { id: string }
    assert.equal(scheduledStudy.status, 'scheduled')
    assert.equal(scheduledStudy.orderItemId, serviceOrderItemId)
    assert.equal(scheduledStudy.orderId, radiologyInternalOrderId)
    assert.equal(scheduledStudy.patientId, patient.payload?.id)
    assert.equal(scheduledStudy.invoiceNumber, schedulableItem.invoiceNumber)
    assert.equal(scheduledStudy.invoiceStatus, radiologyOrder.invoice.status)
    assert.ok(String(scheduledStudy.accessionNumber).startsWith('RAD-'))

    const startedStudyResponse = await call('POST', `/api/radiology/studies/${scheduledStudy.id}/start`)
    assert.equal(startedStudyResponse.status, 200)
    const startedStudy = startedStudyResponse.payload as Record<string, unknown>
    assert.equal(startedStudy.status, 'in_progress')
    const reportedStudyResponse = await call('POST', `/api/radiology/studies/${scheduledStudy.id}/report`, { reportText: 'No acute finding.', impression: 'Normal radiology study.' })
    assert.equal(reportedStudyResponse.status, 200)
    const reportedStudy = reportedStudyResponse.payload as Record<string, unknown>
    assert.equal(reportedStudy.status, 'reported')
    assert.equal(reportedStudy.reportText, 'No acute finding.')
    const verifiedStudyResponse = await call('POST', `/api/radiology/studies/${scheduledStudy.id}/verify`)
    assert.equal(verifiedStudyResponse.status, 200)
    const verifiedStudy = verifiedStudyResponse.payload as Record<string, unknown>
    assert.equal(verifiedStudy.status, 'verified')
    for (const study of [startedStudy, reportedStudy, verifiedStudy]) {
      assert.equal(study.orderItemId, serviceOrderItemId)
      assert.equal(study.orderId, radiologyInternalOrderId)
      assert.equal(study.patientId, patient.payload?.id)
      assert.equal(study.invoiceNumber, schedulableItem.invoiceNumber)
      assert.equal(study.invoiceStatus, radiologyOrder.invoice.status)
      assert.equal(study.accessionNumber, scheduledStudy.accessionNumber)
    }
    assert.ok(verifiedStudy.verifiedBy)
    const radiologyAudit = await call('GET', '/api/audit-events?limit=100')
    assert.ok((radiologyAudit.payload as unknown as Array<Record<string, unknown>>).some((event) => event.action === 'radiology.created' && (event.metadata as Record<string, unknown>)?.orderItemId === serviceOrderItemId))

    const report = await call('GET', '/api/reports/operations')
    assert.equal(report.status, 200)
    const audit = await call('GET', '/api/audit-events?limit=100')
    assert.ok((audit.payload as unknown as Array<Record<string, unknown>>).some((event) => event.action === 'payment.recorded'))

    const multiInvoiceOrderResponse = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [String(cbc?.id)] })
    assert.equal(multiInvoiceOrderResponse.status, 201)
    const multiInvoiceOrder = multiInvoiceOrderResponse.payload as { id: string; invoice: { id: string; total: number }; specimens: Array<{ barcode: string }> }
    const additionalInvoiceResponse = await call('POST', '/api/billing/invoices', { orderId: multiInvoiceOrder.id, items: [{ description: 'Additional order charge', quantity: 1, unitPrice: 10 }] })
    assert.equal(additionalInvoiceResponse.status, 201)
    const additionalInvoice = additionalInvoiceResponse.payload as { id: string }
    const multiInvoiceBarcode = multiInvoiceOrder.specimens[0].barcode
    const specimensForMultiInvoiceOrder = await call('GET', '/api/specimens?limit=100')
    const matchingBarcodeRows = (specimensForMultiInvoiceOrder.payload as unknown as Array<{ barcode: string }>).filter((item) => item.barcode === multiInvoiceBarcode)
    assert.equal(matchingBarcodeRows.length, 1)
    assert.equal((await call('POST', `/api/billing/invoices/${multiInvoiceOrder.invoice.id}/payments`, { amount: multiInvoiceOrder.invoice.total, method: 'cash' })).status, 201)
    assert.equal((await call('POST', `/api/specimens/${multiInvoiceBarcode}/collect`)).status, 409)
    assert.equal((await call('POST', `/api/billing/invoices/${additionalInvoice.id}/payments`, { amount: 10, method: 'cash' })).status, 201)
    assert.equal((await call('POST', `/api/specimens/${multiInvoiceBarcode}/collect`)).status, 200)

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
    const receptionBarcode = (receptionPayload.specimens as Array<{ barcode: string }>)[0].barcode
    assert.equal((await call('POST', `/api/specimens/${receptionBarcode}/collect`)).status, 409)
    const collectRemaining = await call('POST', `/api/billing/invoices/${receptionPayload.invoice.id}/payments`, { amount: 80, method: 'cash' })
    assert.equal(collectRemaining.status, 201)
    assert.equal((await call('POST', `/api/specimens/${receptionBarcode}/collect`)).status, 200)
    assert.equal((await call('POST', `/api/specimens/${receptionBarcode}/receive`)).status, 200)
    const paidReceptionList = await call('GET', '/api/reception/orders?limit=100')
    const paidReception = (paidReceptionList.payload as unknown as Array<Record<string, unknown>>).find((item) => item.id === receptionId)
    assert.equal((paidReception?.invoice as { status?: string } | undefined)?.status, 'paid')
    const insuredOrder = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [], bundleIds: [bundleId], insuranceCoveragePiastres: 18000, insuranceCompany: 'تأمين كامل للاختبار', initialPaymentPiastres: 0 })
    assert.equal(insuredOrder.status, 201)
    const insured = insuredOrder.payload as { specimens: Array<{ barcode: string }>; invoice: { status: string } }
    assert.equal(insured.invoice.status, 'paid')
    assert.equal((await call('POST', `/api/specimens/${insured.specimens[0].barcode}/collect`)).status, 200)

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

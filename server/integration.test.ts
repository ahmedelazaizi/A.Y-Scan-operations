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
  const server = createServer(createApp({ repository: stores.repository, auth: stores.auth }))
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

    const seeded = await call('GET', '/api/catalog')
    assert.ok((seeded.payload as unknown as unknown[]).length >= 20)
    const cbc = (seeded.payload as unknown as Array<Record<string, unknown>>).find((item) => item.code === 'CBC')
    assert.equal(cbc?.isActive, false)
    const activated = await call('PATCH', `/api/catalog/${String(cbc?.id)}`, { price: 150, isActive: true })
    assert.equal(activated.status, 200)

    const patient = await call('POST', '/api/patients', { fullName: 'مريض تكامل', phone: '01000000000', sex: 'female' })
    assert.equal(patient.status, 201)
    const search = await call('GET', '/api/patients?q=تكامل')
    assert.equal((search.payload as unknown as unknown[]).length, 1)

    const order = await call('POST', '/api/orders', { patientId: patient.payload?.id, testIds: [cbc?.id], priority: 'urgent' })
    assert.equal(order.status, 201)
    assert.equal(order.payload?.tests, 'صورة دم كاملة (CBC)')
    const orderId = String(order.payload?.id)

    const specimen = await call('POST', '/api/specimens', { orderId, specimenType: 'دم', barcode: 'IT-0001' })
    assert.equal(specimen.status, 201)
    assert.equal((await call('POST', '/api/specimens/IT-0001/collect')).status, 200)

    const itemRow = await migrationPool.query<{ id: string }>('SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_number = $1', [orderId.slice(3)])
    const result = await call('POST', '/api/results', { orderItemId: itemRow.rows[0].id, value: '13.2', unit: 'g/dL', flag: 'normal' })
    assert.equal(result.status, 201)
    assert.equal(result.payload?.enteredBy, 'مدير النظام')
    await call('POST', `/api/results/${String(result.payload?.id)}/review`)
    const approved = await call('POST', `/api/results/${String(result.payload?.id)}/review`)
    assert.equal(approved.payload?.status, 'approved')

    const invoice = await call('POST', '/api/billing/invoices', { orderId, items: [{ description: 'CBC', quantity: 1, unitPrice: 150 }], discount: 0.1, tax: 0 })
    assert.equal(invoice.status, 201)
    assert.equal(invoice.payload?.total, 149.9)
    for (const amount of [49.97, 49.97, 49.96]) {
      assert.equal((await call('POST', `/api/billing/invoices/${String(invoice.payload?.id)}/payments`, { amount, method: 'cash' })).status, 201)
    }
    const invoices = await call('GET', '/api/billing/invoices?status=paid&limit=10')
    assert.equal((invoices.payload as unknown as unknown[]).length, 1)
    assert.equal((await call('POST', `/api/billing/invoices/${String(invoice.payload?.id)}/payments`, { amount: 0.01, method: 'cash' })).status, 409)

    const dashboard = await call('GET', '/api/dashboard')
    const metrics = dashboard.payload?.metrics as Array<Record<string, unknown>>
    assert.equal(metrics[0].value, '1')
    assert.equal(metrics[2].value, '1')
    assert.equal(metrics[3].value, '149.90')

    const report = await call('GET', '/api/reports/operations')
    assert.equal(report.status, 200)
    const audit = await call('GET', '/api/audit-events?limit=100')
    assert.ok((audit.payload as unknown as Array<Record<string, unknown>>).some((event) => event.action === 'payment.recorded'))
  } finally {
    server.closeAllConnections()
    server.close()
    await stores.close()
    await migrationPool.end()
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
    await admin.end()
  }
})

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from './app.js'
import { createMemoryUserStore } from './auth/memory-user-store.js'
import { createAuthService } from './auth/service.js'
import { loadServerConfig } from './config.js'
import { startEmbeddedPostgres } from './embedded-postgres.js'
import { mockRepository } from './domain.js'

async function withFreshApp(callback: (baseUrl: string) => Promise<void>): Promise<void> {
  const auth = createAuthService(createMemoryUserStore())
  const server = createServer(createApp({ repository: mockRepository, auth }))
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const post = (baseUrl: string, body: unknown) => fetch(`${baseUrl}/api/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('first-run setup creates the first admin once, then closes', async () => {
  await withFreshApp(async (baseUrl) => {
    assert.deepEqual(await (await fetch(`${baseUrl}/api/setup/status`)).json(), { needsSetup: true })
    assert.equal((await post(baseUrl, { email: 'owner@clinic.test', displayName: 'Owner', password: 'weak' })).status, 400)
    assert.equal((await post(baseUrl, { email: 'owner@clinic.test' })).status, 400)

    const created = await post(baseUrl, { email: 'Owner@Clinic.test', displayName: 'د. أحمد', password: 'Strong-pass-123' })
    assert.equal(created.status, 201)
    assert.equal(((await created.json()) as { user: { role: string; email: string } }).user.role, 'admin')
    assert.deepEqual(await (await fetch(`${baseUrl}/api/setup/status`)).json(), { needsSetup: false })
    assert.equal((await post(baseUrl, { email: 'second@clinic.test', displayName: 'Second', password: 'Strong-pass-123' })).status, 409)

    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@clinic.test', password: 'Strong-pass-123' }) })
    assert.equal(login.status, 200)
  })
})

test('server config accepts the bundled-database layout without DATABASE_URL', () => {
  const config = loadServerConfig({ NODE_ENV: 'production', EMBEDDED_PG: 'true', PG_BIN_DIR: '/opt/pg/bin', PG_DATA_DIR: '/var/ayscan/pgdata', PG_PORT: '55555' })
  assert.deepEqual(config.embeddedPostgres, { binDir: path.resolve('/opt/pg/bin'), dataDir: path.resolve('/var/ayscan/pgdata'), port: 55555 })
  assert.throws(() => loadServerConfig({ EMBEDDED_PG: 'true' }))
  assert.equal(loadServerConfig({ DATABASE_URL: 'postgresql://x', EMBEDDED_PG: 'false' }).embeddedPostgres, null)
})

// Needs a PostgreSQL `bin` directory and a non-root OS user (PostgreSQL refuses to run as root):
//   su postgres -c "EMBEDDED_PG_TEST_BIN=/usr/lib/postgresql/16/bin npx tsx --test server/setup.test.ts"
const binDir = process.env.EMBEDDED_PG_TEST_BIN
test('embedded PostgreSQL initializes, restarts with the same credentials, and stops', { skip: binDir ? false : 'EMBEDDED_PG_TEST_BIN is not set' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ayscan-embedded-'))
  const dataDir = path.join(root, 'pgdata')
  try {
    const first = await startEmbeddedPostgres({ binDir: binDir as string, dataDir, port: 55891 })
    assert.match(first.url, /^postgresql:\/\/ayscan:[0-9a-f]{48}@127\.0\.0\.1:55891\/ayscan$/)
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: first.url, max: 1 })
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS smoke (id int)')
      await pool.query('INSERT INTO smoke VALUES (1)')
    } finally {
      await pool.end()
    }
    await first.stop()

    const second = await startEmbeddedPostgres({ binDir: binDir as string, dataDir, port: 55891 })
    assert.equal(second.url, first.url)
    const again = new Pool({ connectionString: second.url, max: 1 })
    try {
      assert.equal((await again.query('SELECT count(*)::int AS n FROM smoke')).rows[0].n, 1)
    } finally {
      await again.end()
    }
    await second.stop()
    const credentials = JSON.parse(await readFile(path.join(root, 'pg-credentials.json'), 'utf8')) as { password: string }
    assert.equal(credentials.password.length, 48)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

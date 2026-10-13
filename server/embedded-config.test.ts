import assert from 'node:assert/strict'
import { once } from 'node:events'
import net from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadServerConfig } from './config.js'
import { startEmbeddedPostgres } from './embedded-postgres.js'

test('server config accepts the bundled-database layout without DATABASE_URL', () => {
  const config = loadServerConfig({ NODE_ENV: 'production', EMBEDDED_PG: 'true', PG_BIN_DIR: '/opt/pg/bin', PG_DATA_DIR: '/var/ayscan/pgdata', PG_PORT: '55555' })
  assert.deepEqual(config.embeddedPostgres, { binDir: path.resolve('/opt/pg/bin'), dataDir: path.resolve('/var/ayscan/pgdata'), port: 55555 })
  assert.throws(() => loadServerConfig({ EMBEDDED_PG: 'true' }))
  assert.equal(loadServerConfig({ DATABASE_URL: 'postgresql://x', EMBEDDED_PG: 'false' }).embeddedPostgres, null)
})

// Needs a PostgreSQL `bin` directory and a non-root OS user (PostgreSQL refuses to run as root):
//   su postgres -c "EMBEDDED_PG_TEST_BIN=/usr/lib/postgresql/16/bin npx tsx --test server/embedded-config.test.ts"
const binDir = process.env.EMBEDDED_PG_TEST_BIN
test('embedded PostgreSQL initializes, restarts with the same credentials, and stops', { skip: binDir ? false : 'EMBEDDED_PG_TEST_BIN is not set' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ayscan-embedded-'))
  const dataDir = path.join(root, 'pgdata')
  try {
    // Another program already owns the preferred port: the database must move to a free one instead of failing.
    const blocker = net.createServer()
    await new Promise<void>((resolve) => blocker.listen({ port: 55891, host: '127.0.0.1' }, resolve))
    let first
    try {
      first = await startEmbeddedPostgres({ binDir: binDir as string, dataDir, port: 55891 })
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }
    assert.match(first.url, /^postgresql:\/\/ayscan:[0-9a-f]{48}@127\.0\.0\.1:\d+\/ayscan$/)
    assert.doesNotMatch(first.url, /:55891\//)
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
    // After a restart the preferred port is free again, so the database returns to it; the credentials stay the same.
    assert.equal(new URL(second.url).password, new URL(first.url).password)
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

test('relative configuration paths resolve from the app folder, not the working directory', async () => {
  const { findAppRoot } = await import('./config.js')
  const appRoot = findAppRoot()
  const original = process.cwd()
  process.chdir(tmpdir())
  try {
    const config = loadServerConfig({ NODE_ENV: 'production', EMBEDDED_PG: 'true', PG_BIN_DIR: 'runtime/pgsql/bin', WEB_ROOT: 'dist' })
    assert.equal(config.webRoot, path.join(appRoot, 'dist'))
    assert.equal(config.embeddedPostgres?.binDir, path.join(appRoot, 'runtime', 'pgsql', 'bin'))
    assert.equal(config.embeddedPostgres?.dataDir, path.join(appRoot, 'data', 'pgdata'))
    assert.equal(loadServerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x' }).webRoot, path.join(appRoot, 'dist'))
  } finally {
    process.chdir(original)
  }
})

test('a missing web app is explained in the browser instead of a bare JSON error', async () => {
  const { createServer } = await import('node:http')
  const { createApp } = await import('./app.js')
  const { createMemoryUserStore } = await import('./auth/memory-user-store.js')
  const { createAuthService } = await import('./auth/service.js')
  const { mockRepository } = await import('./domain.js')
  const empty = await mkdtemp(path.join(tmpdir(), 'ayscan-noweb-'))
  const full = await mkdtemp(path.join(tmpdir(), 'ayscan-web-'))
  await writeFile(path.join(full, 'index.html'), '<html>ok</html>')
  const auth = createAuthService(createMemoryUserStore())
  const serve = async (webRoot: string, accept: string): Promise<{ status: number; type: string; body: string }> => {
    const server = createServer(createApp({ repository: mockRepository, auth, webRoot }))
    server.listen(0)
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address !== 'object') throw new Error('no port')
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`, { headers: { accept } })
      return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() }
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
  try {
    const missing = await serve(empty, 'text/html')
    assert.equal(missing.status, 503)
    assert.match(missing.type, /text\/html/)
    assert.match(missing.body, /index\.html/)
    const api = await serve(empty, 'application/json')
    assert.equal(api.status, 404)
    const ok = await serve(full, 'text/html')
    assert.equal(ok.status, 200)
    assert.equal(ok.body, '<html>ok</html>')
  } finally {
    await rm(empty, { recursive: true, force: true })
    await rm(full, { recursive: true, force: true })
  }
})

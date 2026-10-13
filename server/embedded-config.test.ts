import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

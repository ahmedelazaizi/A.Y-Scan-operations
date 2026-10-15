import { Pool } from 'pg'
import { loadServerConfig, ConfigError } from './config.js'
import { startEmbeddedPostgres } from './embedded-postgres.js'
import { runMigrations } from './migrations.js'
import { createStores } from './storage/factory.js'

/**
 * Prepares the database from the environment (.env) so the first launch is instant. Run by the Windows installer.
 * Existing PostgreSQL (DATABASE_URL): connects, creates the database when it is missing, applies migrations.
 * Bundled PostgreSQL (EMBEDDED_PG): creates the cluster, starts it, applies migrations, stops it again.
 * Either way the default admin account is created. Exit code 0 = ready, 1 = failed (message on stderr).
 */
type ExternalConfig = { host: string; port: number; database: string; user: string; password: string }

function describe(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return `Cannot reach the PostgreSQL server (${message}). Check the host name, the port, and that the server is running.`
  if (code === '28P01' || code === '28000') return 'PostgreSQL rejected the user name or password.'
  if (code === '3D000') return 'The database does not exist and creating it was not requested.'
  if (code === '42501') return `The database user does not have enough privileges (${message}).`
  return message
}

function parseExternalConfig(databaseUrl: string): ExternalConfig {
  const url = new URL(databaseUrl)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!url.hostname || !database) throw new Error('DATABASE_URL must include a host and a database name.')
  return { host: url.hostname, port: Number(url.port || 5432), database, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
}

function urlFor(config: ExternalConfig, database: string): string {
  return `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(database)}`
}

async function ensureExternalDatabase(config: ExternalConfig): Promise<void> {
  const target = new Pool({ connectionString: urlFor(config, config.database), max: 1, connectionTimeoutMillis: 8000 })
  try {
    await target.query('SELECT 1')
    return
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') throw error
  } finally {
    await target.end()
  }
  console.log(`Creating the database "${config.database}"...`)
  const admin = new Pool({ connectionString: urlFor(config, 'postgres'), max: 1, connectionTimeoutMillis: 8000 })
  try {
    await admin.query(`CREATE DATABASE "${config.database.replace(/"/g, '""')}" ENCODING 'UTF8'`)
  } finally {
    await admin.end()
  }
}

async function migrate(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 8000 })
  try {
    const report = await runMigrations(pool)
    console.log(`Database tables are ready (${report.applied.length} applied, ${report.alreadyApplied} already present).`)
  } finally {
    await pool.end()
  }
}

async function createDefaultAdmin(databaseUrl: string, timeZone: string): Promise<void> {
  const stores = createStores(databaseUrl, { timeZone })
  try {
    const outcome = await stores.auth.bootstrapAdmin(process.env, { useDefaults: true })
    if (outcome !== 'skipped') console.log('Default admin account created (admin / admin123).')
  } finally {
    await stores.close()
  }
}

try {
  const config = loadServerConfig()
  if (config.databaseUrl) {
    const external = parseExternalConfig(config.databaseUrl)
    console.log(`Connecting to PostgreSQL at ${external.host}:${external.port}...`)
    await ensureExternalDatabase(external)
    await migrate(config.databaseUrl)
    await createDefaultAdmin(config.databaseUrl, config.timeZone)
    console.log('The database is ready.')
  } else if (config.embeddedPostgres) {
    console.log('Preparing the local database. The first time takes about a minute...')
    const database = await startEmbeddedPostgres({ ...config.embeddedPostgres, log: (message) => console.log(message) })
    try {
      await migrate(database.url)
      await createDefaultAdmin(database.url, config.timeZone)
    } finally {
      await database.stop()
    }
    console.log('The local database is ready.')
  } else {
    throw new Error('No database is configured (set DATABASE_URL or EMBEDDED_PG).')
  }
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : describe(error))
  process.exitCode = 1
}

import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { Pool } from 'pg'
import { createApp } from './app.js'
import { ConfigError, loadServerConfig } from './config.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './embedded-postgres.js'
import { runMigrations } from './migrations.js'
import { createStores } from './storage/factory.js'
import { createPostgresPhase1SeedImporter } from './phase1-seed.js'

const REQUEST_TIMEOUT_MS = 30_000
const SHUTDOWN_GRACE_MS = 10_000
const SESSION_PRUNE_INTERVAL_MS = 60 * 60 * 1000

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

let config
try {
  config = loadServerConfig()
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`)
    process.exit(1)
  }
  throw error
}

let embeddedPostgres: EmbeddedPostgres | null = null
let databaseUrl = config.databaseUrl
if (config.embeddedPostgres) {
  try {
    embeddedPostgres = await startEmbeddedPostgres({ ...config.embeddedPostgres, log: (message) => console.log(message) })
    databaseUrl = embeddedPostgres.url
  } catch (error) {
    console.error(`Could not start the local database: ${describeError(error)}`)
    process.exit(1)
  }
}

if (databaseUrl && config.migrateOnStart) {
  const migrationPool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await runMigrations(migrationPool)
    const seedReport = await createPostgresPhase1SeedImporter(migrationPool).run(null)
    console.log(`Phase 1 seed import: ${seedReport.priceRowsInserted} new prices, ${seedReport.priceRowsExisting} existing prices, ${seedReport.rangeRowsInserted} new ranges, ${seedReport.reviewRows} review rows.`)
  } catch (error) {
    console.error(`Database migration failed: ${describeError(error)}`)
    await embeddedPostgres?.stop()
    process.exit(1)
  } finally {
    await migrationPool.end()
  }
}

if (config.webRoot && !existsSync(path.join(config.webRoot, 'index.html'))) {
  console.error(`WARNING: the web app was not found at ${config.webRoot} (index.html is missing). The server will answer API requests only.`)
}

const stores = createStores(databaseUrl, { timeZone: config.timeZone })
try {
  const bootstrap = await stores.auth.bootstrapAdmin(process.env, { useDefaults: true })
  if (bootstrap === 'created') console.log('Created the first admin account from AUTH_ADMIN_USERNAME.')
  if (bootstrap === 'created-default') console.log('Created the default admin account (username: admin, password: admin123). Change this password after the first sign-in.')
} catch (error) {
  console.error(`Could not create the first admin account: ${describeError(error)}`)
  await stores.close()
  await embeddedPostgres?.stop()
  process.exit(1)
}
const server = createServer(createApp({ repository: stores.repository, auth: stores.auth, phase1: stores.phase1, phase1Importer: stores.phase1Importer, webRoot: config.webRoot ?? undefined }))
const sessionPruner = setInterval(() => {
  stores.auth.pruneSessions().catch((error: unknown) => console.error('Session cleanup failed:', describeError(error)))
}, SESSION_PRUNE_INTERVAL_MS)
sessionPruner.unref()
server.requestTimeout = REQUEST_TIMEOUT_MS
server.headersTimeout = REQUEST_TIMEOUT_MS

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', describeError(reason))
})

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received; shutting down A.Y Scan API.`)
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS)
  forceExit.unref()
  server.close()
  server.closeIdleConnections()
  clearInterval(sessionPruner)
  try {
    await stores.close()
  } catch (error) {
    console.error('Failed to close the repository cleanly:', describeError(error))
  }
  try {
    await embeddedPostgres?.stop()
  } catch (error) {
    console.error('Failed to stop the local database cleanly:', describeError(error))
  }
  process.exit(0)
}
process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })

server.on('error', (error) => {
  console.error(`A.Y Scan API failed to start: ${describeError(error)}`)
  void (embeddedPostgres?.stop() ?? Promise.resolve()).finally(() => process.exit(1))
})

server.listen(config.port, config.host, () => {
  const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host
  console.log(`A.Y Scan is running: http://${displayHost}:${config.port} (web app: ${config.webRoot ?? 'none, API only'})`)
})

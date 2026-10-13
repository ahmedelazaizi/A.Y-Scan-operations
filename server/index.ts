import { createServer } from 'node:http'
import { createApp } from './app.js'
import { ConfigError, loadServerConfig } from './config.js'
import { createRepository } from './storage/factory.js'

const REQUEST_TIMEOUT_MS = 30_000
const SHUTDOWN_GRACE_MS = 10_000

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

const repository = createRepository(config.databaseUrl)
const server = createServer(createApp(repository))
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
  try {
    await repository.close?.()
  } catch (error) {
    console.error('Failed to close the repository cleanly:', describeError(error))
  }
  process.exit(0)
}
process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })

server.on('error', (error) => {
  console.error(`A.Y Scan API failed to start: ${describeError(error)}`)
  process.exit(1)
})

server.listen(config.port, config.host, () => {
  console.log(`A.Y Scan API listening on http://${config.host}:${config.port}`)
})

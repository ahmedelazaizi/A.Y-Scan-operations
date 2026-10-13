import path from 'node:path'

export type ServerConfig = {
  port: number
  host: string
  databaseUrl: string | null
  /** Bundled PostgreSQL managed by this process (the Windows installer layout). Replaces DATABASE_URL. */
  embeddedPostgres: { binDir: string; dataDir: string; port: number } | null
  allowInMemoryStore: boolean
  migrateOnStart: boolean
  webRoot: string | null
  /** IANA zone that defines "today" for dashboards and report date ranges. */
  timeZone: string
  isProduction: boolean
}

export class ConfigError extends Error {}

function parseTimeZone(value: string | undefined): string {
  const timeZone = value?.trim() || 'Africa/Cairo'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
  } catch {
    throw new ConfigError(`APP_TIMEZONE is not a valid IANA time zone: ${timeZone}`)
  }
  if (!/^[A-Za-z0-9_+\-/]+$/.test(timeZone)) throw new ConfigError('APP_TIMEZONE contains unsupported characters.')
  return timeZone
}

function parseEmbeddedPostgres(environment: NodeJS.ProcessEnv): ServerConfig['embeddedPostgres'] {
  if (environment.EMBEDDED_PG?.trim().toLowerCase() !== 'true') return null
  const binDir = environment.PG_BIN_DIR?.trim()
  if (!binDir) throw new ConfigError('PG_BIN_DIR is required when EMBEDDED_PG=true.')
  const port = Number.parseInt(environment.PG_PORT ?? '55432', 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('PG_PORT must be an integer between 1 and 65535.')
  return { binDir: path.resolve(binDir), dataDir: path.resolve(environment.PG_DATA_DIR?.trim() || path.join('data', 'pgdata')), port }
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '3001', 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('PORT must be an integer between 1 and 65535.')
  return port
}

/** Reads and validates process configuration once at startup; fails fast instead of running half-configured. */
export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = environment.NODE_ENV === 'production'
  const databaseUrl = environment.DATABASE_URL?.trim() || null
  const allowInMemoryStore = environment.ALLOW_IN_MEMORY_STORE?.trim().toLowerCase() === 'true'
  const embeddedPostgres = parseEmbeddedPostgres(environment)
  if (!databaseUrl && !embeddedPostgres && (isProduction || !allowInMemoryStore)) {
    throw new ConfigError('DATABASE_URL is required. Set ALLOW_IN_MEMORY_STORE=true only for throwaway development runs.')
  }
  return {
    port: parsePort(environment.PORT),
    host: environment.HOST?.trim() || '127.0.0.1',
    databaseUrl,
    embeddedPostgres,
    allowInMemoryStore,
    migrateOnStart: environment.MIGRATE_ON_START?.trim().toLowerCase() !== 'false',
    webRoot: environment.WEB_ROOT?.trim() || (isProduction ? path.resolve(process.cwd(), 'dist') : null),
    timeZone: parseTimeZone(environment.APP_TIMEZONE),
    isProduction,
  }
}

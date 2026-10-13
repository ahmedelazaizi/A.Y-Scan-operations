export type ServerConfig = {
  port: number
  host: string
  databaseUrl: string | null
  allowInMemoryStore: boolean
  isProduction: boolean
}

export class ConfigError extends Error {}

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
  if (!databaseUrl && (isProduction || !allowInMemoryStore)) {
    throw new ConfigError('DATABASE_URL is required. Set ALLOW_IN_MEMORY_STORE=true only for throwaway development runs.')
  }
  return {
    port: parsePort(environment.PORT),
    host: environment.HOST?.trim() || '127.0.0.1',
    databaseUrl,
    allowInMemoryStore,
    isProduction,
  }
}

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'

export type EmbeddedPostgresOptions = {
  /** Directory containing initdb, pg_ctl (the `bin` folder of a PostgreSQL distribution). */
  binDir: string
  dataDir: string
  port: number
  database?: string
  user?: string
  log?: (message: string) => void
}

export type EmbeddedPostgres = {
  /** Connection URL for the application (loopback only, password authentication). */
  url: string
  /** Stops PostgreSQL if this process started it; a server that was already running is left alone. */
  stop(): Promise<void>
}

type Credentials = { user: string; password: string; database: string; port: number }

const DEFAULT_DATABASE = 'ayscan'
const DEFAULT_USER = 'ayscan'
const START_TIMEOUT_SECONDS = 90

function executable(binDir: string, name: string): string {
  return path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name)
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env: environment, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, code: 0 })
        return
      }
      const code = typeof error.code === 'number' ? error.code : -1
      if (code === -1 || (error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`Could not run ${path.basename(command)}: ${error.message}`))
        return
      }
      resolve({ stdout: `${stdout}${stderr}`, code })
    })
  })
}

async function runChecked(command: string, args: string[], failure: string): Promise<string> {
  const result = await run(command, args)
  if (result.code !== 0) throw new Error(`${failure} (exit ${result.code}): ${result.stdout.trim().slice(0, 600)}`)
  return result.stdout
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function credentialsPath(dataDir: string): string {
  return path.join(path.dirname(dataDir), 'pg-credentials.json')
}

async function readCredentials(dataDir: string): Promise<Credentials | null> {
  try {
    const parsed = JSON.parse(await readFile(credentialsPath(dataDir), 'utf8')) as Partial<Credentials>
    if (typeof parsed.user === 'string' && typeof parsed.password === 'string' && typeof parsed.database === 'string' && typeof parsed.port === 'number') {
      return { user: parsed.user, password: parsed.password, database: parsed.database, port: parsed.port }
    }
  } catch {
    // Missing or unreadable: handled by the caller.
  }
  return null
}

function connectionUrl(credentials: Credentials, database = credentials.database): string {
  return `postgresql://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@127.0.0.1:${credentials.port}/${database}`
}

async function initializeCluster(options: EmbeddedPostgresOptions, credentials: Credentials): Promise<void> {
  const parent = path.dirname(options.dataDir)
  await mkdir(parent, { recursive: true })
  const passwordFile = path.join(parent, `.pwfile-${randomBytes(4).toString('hex')}`)
  await writeFile(passwordFile, credentials.password, { mode: 0o600 })
  try {
    await runChecked(executable(options.binDir, 'initdb'), [
      '-D', options.dataDir, '-U', credentials.user, '-A', 'scram-sha-256', `--pwfile=${passwordFile}`,
      '-E', 'UTF8', '--locale=C', '--no-instructions',
    ], 'Creating the database cluster failed')
  } finally {
    await rm(passwordFile, { force: true })
  }
  // Credentials are saved only after initdb succeeded, so a failed first run is simply retried.
  await writeFile(credentialsPath(options.dataDir), JSON.stringify(credentials, null, 2), { mode: 0o600 })
}

async function isRunning(options: EmbeddedPostgresOptions): Promise<boolean> {
  return (await run(executable(options.binDir, 'pg_ctl'), ['status', '-D', options.dataDir])).code === 0
}

async function ensureDatabase(credentials: Credentials): Promise<void> {
  const pool = new Pool({ connectionString: connectionUrl(credentials, 'postgres'), max: 1 })
  try {
    const found = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [credentials.database])
    if (found.rowCount === 0) await pool.query(`CREATE DATABASE "${credentials.database.replace(/"/g, '')}" ENCODING 'UTF8' TEMPLATE template0`)
  } finally {
    await pool.end()
  }
}

/**
 * Starts (and on first run creates) the PostgreSQL cluster bundled with the installer.
 * It listens on 127.0.0.1 only and requires a generated password stored beside the data directory.
 */
export async function startEmbeddedPostgres(options: EmbeddedPostgresOptions): Promise<EmbeddedPostgres> {
  const log = options.log ?? (() => {})
  const dataDir = path.resolve(options.dataDir)
  const resolved: EmbeddedPostgresOptions = { ...options, dataDir }
  const clusterExists = await exists(path.join(dataDir, 'PG_VERSION'))
  let credentials = await readCredentials(dataDir)

  if (!clusterExists) {
    credentials = {
      user: options.user ?? DEFAULT_USER,
      password: randomBytes(24).toString('hex'),
      database: options.database ?? DEFAULT_DATABASE,
      port: options.port,
    }
    log('Creating the local database for the first time...')
    await initializeCluster(resolved, credentials)
  } else if (!credentials) {
    throw new Error(`The database folder exists but its credentials file is missing (${credentialsPath(dataDir)}). Restore it from a backup or move the data folder aside.`)
  }
  const effective: Credentials = { ...credentials, port: options.port }

  let startedByUs = false
  if (!(await isRunning(resolved))) {
    log('Starting the local database...')
    const logFile = path.join(path.dirname(dataDir), 'postgres.log')
    await runChecked(executable(options.binDir, 'pg_ctl'), [
      'start', '-D', dataDir, '-w', '-t', String(START_TIMEOUT_SECONDS), '-l', logFile,
      '-o', `-p ${options.port} -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c max_connections=60`,
    ], `Starting PostgreSQL failed (see ${logFile})`)
    startedByUs = true
  }
  await ensureDatabase(effective)

  return {
    url: connectionUrl(effective),
    stop: async () => {
      if (!startedByUs) return
      startedByUs = false
      await run(executable(options.binDir, 'pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'])
    },
  }
}

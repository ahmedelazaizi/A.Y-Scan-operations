import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'

const MIGRATION_FILE_PATTERN = /^(\d{3,})_[a-z0-9_]+\.sql$/
// Arbitrary constant shared by every A.Y Scan process so two runners never interleave.
const MIGRATION_LOCK_KEY = 4_420_917_301

export type MigrationFile = { version: string; name: string; sql: string; checksum: string }
export type MigrationReport = { applied: string[]; alreadyApplied: number }

export function defaultMigrationsDirectory(): string {
  return process.env.MIGRATIONS_DIR?.trim() || path.resolve(process.cwd(), 'db', 'migrations')
}

export async function loadMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
  const files: MigrationFile[] = []
  for (const name of names) {
    const match = MIGRATION_FILE_PATTERN.exec(name)
    if (!match) throw new Error(`Migration file name is invalid: ${name} (expected NNN_snake_case.sql).`)
    const sql = await readFile(path.join(directory, name), 'utf8')
    files.push({ version: match[1], name, sql, checksum: createHash('sha256').update(sql).digest('hex') })
  }
  const versions = new Set(files.map((file) => file.version))
  if (versions.size !== files.length) throw new Error('Two migration files share the same version number.')
  return files
}

/**
 * Applies pending migrations in order, each in its own transaction, recording them in schema_migrations.
 * Databases created by the old per-file scripts are adopted safely because every historical migration is idempotent.
 */
export async function runMigrations(pool: Pool, directory = defaultMigrationsDirectory(), log: (message: string) => void = console.log): Promise<MigrationReport> {
  const files = await loadMigrationFiles(directory)
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
    const existing = await client.query<{ version: string; checksum: string; name: string }>('SELECT version, checksum, name FROM schema_migrations')
    const applied = new Map(existing.rows.map((row) => [row.version, row]))
    const report: MigrationReport = { applied: [], alreadyApplied: 0 }
    for (const file of files) {
      const previous = applied.get(file.version)
      if (previous) {
        if (previous.checksum !== file.checksum) {
          throw new Error(`Migration ${file.name} was changed after it was applied. Add a new migration instead of editing an applied one.`)
        }
        report.alreadyApplied += 1
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(file.sql)
        await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [file.version, file.name, file.checksum])
        await client.query('COMMIT')
      } catch (error) {
        try { await client.query('ROLLBACK') } catch { /* keep the migration error */ }
        throw new Error(`Migration ${file.name} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
      report.applied.push(file.name)
      log(`Applied ${file.name}`)
    }
    return report
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]) } catch { /* the session ends anyway */ }
    client.release()
  }
}

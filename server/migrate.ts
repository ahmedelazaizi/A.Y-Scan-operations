import { Pool } from 'pg'
import { runMigrations } from './migrations.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 })
try {
  const report = await runMigrations(pool)
  console.log(`Database is up to date (${report.applied.length} applied now, ${report.alreadyApplied} already applied).`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await pool.end()
}

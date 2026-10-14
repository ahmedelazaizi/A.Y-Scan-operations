import { Pool } from 'pg'
import { runMigrations } from './migrations.js'
import { createPostgresPhase1SeedImporter } from './phase1-seed.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 })
try {
  const report = await runMigrations(pool)
  const seed = await createPostgresPhase1SeedImporter(pool).run(null)
  console.log(`Database is up to date (${report.applied.length} applied now, ${report.alreadyApplied} already applied).`)
  console.log(`Phase 1 seed import: ${seed.priceRowsInserted} new prices, ${seed.priceRowsExisting} existing prices, ${seed.rangeRowsInserted} new ranges, ${seed.reviewRows} review rows.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await pool.end()
}

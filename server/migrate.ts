import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for db:migrate.')
}

const migration = await readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8')
const pool = new Pool({ connectionString: databaseUrl })
try {
  await pool.query(migration)
  console.log('Applied db/migrations/001_initial.sql')
} finally {
  await pool.end()
}

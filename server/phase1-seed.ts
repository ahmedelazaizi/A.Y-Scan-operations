import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Pool, PoolClient } from 'pg'
import type { Phase1SeedReport } from './phase1.js'

export type Phase1SeedImporter = { run(importedBy: string | null): Promise<Phase1SeedReport> }

export function createMemoryPhase1SeedImporter(): Phase1SeedImporter {
  return { run: async () => ({ priceRowsSeen: 0, priceRowsInserted: 0, priceRowsExisting: 0, reviewRows: 0, rangeRowsSeen: 0, rangeRowsInserted: 0, importedAt: new Date().toISOString() }) }
}

type PriceSeedItem = { code: string; kind: 'lab' | 'radiology'; sectionEn: string | null; sectionAr: string | null; nameEn: string | null; nameAr: string | null; contractPrice: number; isNew: boolean; sourceRow: number }
type PriceSeed = { source: string; currency: string; items: PriceSeedItem[]; review?: Array<{ row: number; code: string; reason: string }> }
type RangeSeedRow = { serviceCode: string; serviceNameEn: string; serviceNameAr: string; parameterCode: string; parameterNameEn: string; parameterNameAr: string; sortOrder: number; resultType: 'numeric' | 'qualitative' | 'text'; unit: string | null; sex: 'all' | 'male' | 'female'; ageFromYears: number; ageToYears: number | null; low: number | null; high: number | null; criticalLow: number | null; criticalHigh: number | null; normalText: string | null; specimen: string | null; tube: string | null; note: string | null; status: string }
type RangeSeed = { rows: RangeSeedRow[] }

function defaultSeedDirectory(): string { return path.resolve(process.cwd(), 'db', 'seed') }
function toPiastres(egp: number): number { if (!Number.isInteger(egp) || egp < 0) throw new Error(`Seed contract price is not an integer EGP amount: ${egp}`); return egp * 100 }
function reviewKey(row: { code: string; row: number }): string { return `${row.code}:${row.row}` }
function reviewSet(seed: PriceSeed): Set<string> { return new Set((seed.review ?? []).map(reviewKey)) }
function priceMetadata(seed: PriceSeed, item: PriceSeedItem, reviewRequired: boolean): string { return JSON.stringify({ source: seed.source, currency: seed.currency, sourceRow: item.sourceRow, reviewRequired, conversion: 'EGP × 100 = integer piastres' }) }
function rangeMetadata(row: RangeSeedRow): string { return JSON.stringify({ source: 'reference-ranges-proposed.json', serviceCode: row.serviceCode, sourceStatus: row.status, scope: 'adult_only' }) }

async function readSeedFiles(seedDirectory: string): Promise<{ prices: PriceSeed; ranges: RangeSeed }> {
  const [priceText, rangeText] = await Promise.all([
    readFile(path.join(seedDirectory, 'price-list-2023.json'), 'utf8'),
    readFile(path.join(seedDirectory, 'reference-ranges-proposed.json'), 'utf8'),
  ])
  return { prices: JSON.parse(priceText) as PriceSeed, ranges: JSON.parse(rangeText) as RangeSeed }
}

async function upsertPrice(client: PoolClient, seed: PriceSeed, item: PriceSeedItem, requiresReview: boolean): Promise<boolean> {
  const contractPricePiastres = toPiastres(item.contractPrice)
  const metadata = priceMetadata(seed, item, requiresReview)
  const inserted = await client.query(
    `INSERT INTO test_catalog (code, kind, section_en, section_ar, name, name_en, specimen_type, contract_price_piastres, price_piastres, contract_price, price, is_active, source_metadata, requires_review)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8, $9, $10, $11::jsonb, $12)
     ON CONFLICT (code) DO NOTHING RETURNING id`,
    [item.code, item.kind, item.sectionEn, item.sectionAr, item.nameAr || item.nameEn || item.code, item.nameEn, 'غير محدد', contractPricePiastres, item.contractPrice, !requiresReview, metadata, requiresReview],
  )
  if (inserted.rows[0]) return true
  await client.query(
    `UPDATE test_catalog
     SET kind = COALESCE(kind, $2), section_en = COALESCE(section_en, $3), section_ar = COALESCE(section_ar, $4),
         name_en = COALESCE(name_en, $5), contract_price_piastres = COALESCE(contract_price_piastres, $6),
         price_piastres = COALESCE(price_piastres, $6), contract_price = COALESCE(contract_price, $6), source_metadata = source_metadata || $7::jsonb,
         requires_review = requires_review OR $8, is_active = CASE WHEN $8 THEN false ELSE is_active END, updated_at = now()
     WHERE code = $1`,
    [item.code, item.kind, item.sectionEn, item.sectionAr, item.nameEn, contractPricePiastres, metadata, requiresReview],
  )
  return false
}

async function findOrCreateParameter(client: PoolClient, row: RangeSeedRow): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT p.id FROM test_parameters p JOIN test_catalog c ON c.id = p.test_catalog_id WHERE c.code = $1 AND p.code = $2`,
    [row.serviceCode, row.parameterCode],
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO test_parameters (test_catalog_id, code, name_ar, name_en, sort_order, result_type, unit, specimen, tube)
     SELECT id, $2, $3, $4, $5, $6, $7, $8, $9 FROM test_catalog WHERE code = $1 RETURNING id`,
    [row.serviceCode, row.parameterCode, row.parameterNameAr, row.parameterNameEn, row.sortOrder, row.resultType, row.unit, row.specimen, row.tube],
  )
  if (!inserted.rows[0]) throw new Error(`Reference range service was not found: ${row.serviceCode}`)
  return inserted.rows[0].id
}

async function insertRange(client: PoolClient, row: RangeSeedRow, importedBy: string | null): Promise<boolean> {
  const parameterId = await findOrCreateParameter(client, row)
  const inserted = await client.query(
    `INSERT INTO reference_ranges (parameter_id, result_type, sex, age_from_years, age_to_years, low, high, critical_low, critical_high, normal_text, specimen, tube, note, status, proposed_by, source_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'proposed', $14, $15::jsonb)
     ON CONFLICT DO NOTHING RETURNING id`,
    [parameterId, row.resultType, row.sex, row.ageFromYears, row.ageToYears, row.low, row.high, row.criticalLow, row.criticalHigh, row.normalText, row.specimen, row.tube, row.note, importedBy, rangeMetadata(row)],
  )
  return Boolean(inserted.rows[0])
}

async function runSeedImport(pool: Pool, seedDirectory: string, importedBy: string | null): Promise<Phase1SeedReport> {
  const { prices, ranges } = await readSeedFiles(seedDirectory)
  if (prices.currency !== 'EGP') throw new Error('Only the EGP contract seed is supported.')
  const reviews = reviewSet(prices)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let insertedPrices = 0
    for (const item of prices.items) insertedPrices += Number(await upsertPrice(client, prices, item, reviews.has(reviewKey({ code: item.code, row: item.sourceRow }))))
    let insertedRanges = 0
    for (const row of ranges.rows) insertedRanges += Number(await insertRange(client, row, importedBy))
    const importedAt = new Date().toISOString()
    await client.query(
      `INSERT INTO phase1_seed_imports (source, price_rows_seen, price_rows_inserted, price_rows_existing, review_rows, range_rows_seen, range_rows_inserted, imported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['price-list-2023.json + reference-ranges-proposed.json', prices.items.length, insertedPrices, prices.items.length - insertedPrices, prices.review?.length ?? 0, ranges.rows.length, insertedRanges, importedBy],
    )
    await client.query('COMMIT')
    return { priceRowsSeen: prices.items.length, priceRowsInserted: insertedPrices, priceRowsExisting: prices.items.length - insertedPrices, reviewRows: prices.review?.length ?? 0, rangeRowsSeen: ranges.rows.length, rangeRowsInserted: insertedRanges, importedAt }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve import error */ }
    throw error
  } finally {
    client.release()
  }
}

export function createPostgresPhase1SeedImporter(pool: Pool, seedDirectory = defaultSeedDirectory()): Phase1SeedImporter {
  return { run: (importedBy) => runSeedImport(pool, seedDirectory, importedBy) }
}

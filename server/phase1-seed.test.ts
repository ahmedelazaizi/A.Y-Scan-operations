import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolClient } from 'pg'
import { upsertPrice } from './phase1-seed.js'

type QueryCall = { text: string; values?: unknown[] }

function mockClient(inserted: boolean): { client: PoolClient; calls: QueryCall[] } {
  const calls: QueryCall[] = []
  const client = {
    query: async (text: string, values?: unknown[]) => {
      calls.push({ text, values })
      return { rows: inserted && calls.length === 1 ? [{ id: 'catalog-id' }] : [] }
    },
  } as unknown as PoolClient
  return { client, calls }
}

const seed = { source: 'test', currency: 'EGP', items: [] }
function item(code: string, isFee?: boolean) {
  return { code, kind: 'radiology' as const, isFee, sectionEn: null, sectionAr: null, nameEn: code, nameAr: code, contractPrice: 400, isNew: false, sourceRow: 1 }
}

test('seed importer marks explicit fee lines and never downgrades existing fee markers', async () => {
  const inserted = mockClient(true)
  assert.equal(await upsertPrice(inserted.client, seed, item('RAD-300', true), false), true)
  assert.match(inserted.calls[0].text, /is_fee\)/)
  assert.equal(inserted.calls[0].values?.at(-1), true)

  const existing = mockClient(false)
  assert.equal(await upsertPrice(existing.client, seed, item('RAD-300', true), false), false)
  assert.match(existing.calls[1].text, /is_fee = is_fee OR \$9/)
  assert.equal(existing.calls[1].values?.at(-1), true)
})

test('ordinary catalog items remain radiology services by default', async () => {
  const inserted = mockClient(true)
  await upsertPrice(inserted.client, seed, item('RAD-310'), false)
  assert.equal(inserted.calls[0].values?.[1], 'radiology')
  assert.equal(inserted.calls[0].values?.at(-1), false)
})

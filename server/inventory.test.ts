import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import type { Pool } from 'pg'
import { createApp } from './app.js'
import { mockRepository } from './domain.js'
import { createPostgresRepository } from './storage/postgres-repository.js'
import { RepositoryConflictError, RepositoryInputError } from './storage/repository.js'

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(createApp(mockRepository))
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function request(baseUrl: string, path: string, options: { method?: string; body?: string } = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  })
}

function itemRow(id: string, sku: string, quantity = '0.000'): Record<string, unknown> {
  return {
    id, sku, name: 'EDTA Tube', category: 'Consumables', unit: 'box', reorder_level: '10.000', quantity,
    is_active: true, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function movementRow(itemId: string, type = 'receipt'): Record<string, unknown> {
  return {
    id: '00000000-0000-4000-8000-000000000602', item_id: itemId, type, quantity: '5.000',
    adjustment_direction: null, reason: 'Opening stock', reference: 'GRN-1', created_by: 'system',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

test('memory inventory supports create, list, receipt, issue, and insufficient stock protection', async () => {
  const sku = 'INV-MEMORY-001'
  const item = await mockRepository.createInventoryItem(sku, 'Memory tubes', 'Consumables', 'box', 2)
  assert.equal(item.quantity, 0)
  assert.deepEqual((await mockRepository.listInventoryItems(true)).find((candidate) => candidate.id === item.id), item)

  const receipt = await mockRepository.recordInventoryMovement(item.id, 'receipt', 10, 'Opening stock', 'GRN-1')
  assert.equal(receipt.item.quantity, 10)
  assert.equal(receipt.movement.type, 'receipt')

  const issue = await mockRepository.recordInventoryMovement(item.id, 'issue', 3, 'Used for tests')
  assert.equal(issue.item.quantity, 7)
  await assert.rejects(
    async () => mockRepository.recordInventoryMovement(item.id, 'issue', 8, 'Too much'),
    RepositoryConflictError,
  )
})

test('memory inventory requires explicit adjustment direction and rejects duplicate SKU', async () => {
  const sku = 'INV-MEMORY-002'
  const item = await mockRepository.createInventoryItem(sku, 'Adjustment item', 'Consumables', 'piece', 0)
  await assert.rejects(
    async () => mockRepository.createInventoryItem(sku, 'Duplicate', 'Consumables', 'piece', 0),
    RepositoryConflictError,
  )
  await assert.rejects(
    async () => mockRepository.recordInventoryMovement(item.id, 'adjustment', 1, 'Ambiguous adjustment'),
    RepositoryInputError,
  )
  const adjustment = await mockRepository.recordInventoryMovement(item.id, 'adjustment', 4, 'Count correction', undefined, 'increase')
  assert.equal(adjustment.item.quantity, 4)
  const decrease = await mockRepository.recordInventoryMovement(item.id, 'adjustment', 1, 'Damaged stock', undefined, 'decrease')
  assert.equal(decrease.item.quantity, 3)
})

test('inventory HTTP endpoints create, list, and record movements', async () => {
  const testServer = await startTestServer()
  try {
    const createResponse = await request(testServer.baseUrl, '/api/inventory/items', {
      method: 'POST', body: JSON.stringify({ sku: 'INV-HTTP-001', name: 'HTTP item', category: 'Kits', unit: 'kit', reorderLevel: 1 }),
    })
    const created = await createResponse.json() as { id: string; quantity: number }
    assert.equal(createResponse.status, 201)
    assert.equal(created.quantity, 0)

    const movementResponse = await request(testServer.baseUrl, `/api/inventory/items/${created.id}/movements`, {
      method: 'POST', body: JSON.stringify({ type: 'receipt', quantity: 5, reason: 'Delivery', reference: 'PO-1' }),
    })
    const movement = await movementResponse.json() as { item: { quantity: number }; movement: { reference: string } }
    assert.equal(movementResponse.status, 201)
    assert.equal(movement.item.quantity, 5)
    assert.equal(movement.movement.reference, 'PO-1')

    const listResponse = await request(testServer.baseUrl, '/api/inventory/items?activeOnly=true')
    assert.equal(listResponse.status, 200)
    assert.ok((await listResponse.json() as Array<{ id: string }>).some((candidate) => candidate.id === created.id))
  } finally {
    await stopTestServer(testServer.server)
  }
})

test('AUTH_REQUIRED protects inventory routes', async () => {
  const previous = process.env.AUTH_REQUIRED
  process.env.AUTH_REQUIRED = 'true'
  const testServer = await startTestServer()
  try {
    const response = await request(testServer.baseUrl, '/api/inventory/items')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized', message: 'Authentication required.' })
  } finally {
    await stopTestServer(testServer.server)
    if (previous === undefined) delete process.env.AUTH_REQUIRED
    else process.env.AUTH_REQUIRED = previous
  }
})

test('postgres inventory mapping uses parameterized SQL and maps numeric values', async () => {
  const itemId = '00000000-0000-4000-8000-000000000601'
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const item = itemRow(itemId, 'INV-PG-001', '5.000')
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.startsWith('SELECT')) return { rows: [itemRow(itemId, 'INV-PG-001', '0.000')] }
      if (sql.startsWith('UPDATE')) return { rows: [item] }
      if (sql.startsWith('INSERT INTO inventory_movements')) return { rows: [movementRow(itemId)] }
      return { rows: [] }
    },
    release: () => undefined,
  }
  const fakePool = {
    connect: async () => client,
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return { rows: [item] }
    },
  } as unknown as Pool
  const repository = createPostgresRepository('postgres://unused', fakePool)
  const result = await repository.recordInventoryMovement(itemId, 'receipt', 5, 'Opening stock', 'GRN-1')
  assert.equal(result.item.quantity, 5)
  assert.equal(result.movement.quantity, 5)
  assert.ok(queries.some((query) => query.sql.includes('FOR UPDATE')))
  assert.ok(queries.every((query) => !query.sql.includes('INV-PG-001')))
})

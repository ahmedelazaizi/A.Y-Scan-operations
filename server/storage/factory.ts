import { Pool } from 'pg'
import { createMemoryUserStore } from '../auth/memory-user-store.js'
import { createPostgresUserStore } from '../auth/postgres-user-store.js'
import { createAuthService, type AuthService } from '../auth/service.js'
import { mockRepository } from '../domain.js'
import type { OrderRepository } from './repository.js'
import { createPostgresRepository } from './postgres-repository.js'

export type Stores = {
  repository: OrderRepository
  auth: AuthService
  close(): Promise<void>
}

export function createStores(databaseUrl: string | null, options: { sessionTtlMs?: number } = {}): Stores {
  if (!databaseUrl) {
    console.warn('Using in-memory stores (ALLOW_IN_MEMORY_STORE=true). Data will be lost on restart.')
    return { repository: mockRepository, auth: createAuthService(createMemoryUserStore(), options), close: async () => {} }
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 10 })
  // An idle client losing its connection must not crash the process; the pool replaces it on next checkout.
  pool.on('error', (error) => console.error('PostgreSQL idle client error:', error.message))
  return {
    repository: createPostgresRepository(databaseUrl, pool),
    auth: createAuthService(createPostgresUserStore(pool), options),
    close: () => pool.end(),
  }
}

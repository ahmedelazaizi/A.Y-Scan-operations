import { Pool } from 'pg'
import { createMemoryUserStore } from '../auth/memory-user-store.js'
import { createPostgresUserStore } from '../auth/postgres-user-store.js'
import { createAuthService, type AuthService } from '../auth/service.js'
import { mockRepository } from '../domain.js'
import { createMemoryPhase1SeedImporter, createPostgresPhase1SeedImporter, type Phase1SeedImporter } from '../phase1-seed.js'
import { createMemoryPhase1Store, type Phase1Store } from '../phase1.js'
import type { OrderRepository } from './repository.js'
import { createPostgresRepository } from './postgres-repository.js'
import { createPostgresPhase1Store } from './postgres-phase1.js'
import { createMemoryTrialLicenseStore, createPostgresTrialLicenseStore, createTrialLicenseService } from '../trial-license.js'

export type Stores = {
  repository: OrderRepository
  auth: AuthService
  phase1: Phase1Store
  phase1Importer: Phase1SeedImporter
  trialLicense: ReturnType<typeof createTrialLicenseService>
  close(): Promise<void>
}

export function createStores(databaseUrl: string | null, options: { sessionTtlMs?: number; timeZone?: string; trial?: boolean; publicKey?: string } = {}): Stores {
  if (!databaseUrl) {
    console.warn('Using in-memory stores (ALLOW_IN_MEMORY_STORE=true). Data will be lost on restart.')
    return { repository: mockRepository, auth: createAuthService(createMemoryUserStore(), { sessionTtlMs: options.sessionTtlMs }), phase1: createMemoryPhase1Store(), phase1Importer: createMemoryPhase1SeedImporter(), trialLicense: createTrialLicenseService({ store: createMemoryTrialLicenseStore(), trial: options.trial ?? false, publicKey: options.publicKey }), close: async () => {} }
  }
  // Every session uses the clinic's zone so date_trunc('day', now()) and report date ranges mean local days.
  const pool = new Pool({ connectionString: databaseUrl, max: 10, options: `-c timezone=${options.timeZone ?? 'Africa/Cairo'}` })
  // An idle client losing its connection must not crash the process; the pool replaces it on next checkout.
  pool.on('error', (error) => console.error('PostgreSQL idle client error:', error.message))
  return {
    repository: createPostgresRepository(databaseUrl, pool),
    auth: createAuthService(createPostgresUserStore(pool), { sessionTtlMs: options.sessionTtlMs }),
    phase1: createPostgresPhase1Store(pool),
    phase1Importer: createPostgresPhase1SeedImporter(pool),
    trialLicense: createTrialLicenseService({ store: createPostgresTrialLicenseStore(pool), trial: options.trial ?? false, publicKey: options.publicKey }),
    close: () => pool.end(),
  }
}

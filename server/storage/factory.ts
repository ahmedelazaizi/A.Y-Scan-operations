import { mockRepository } from '../domain.js'
import type { OrderRepository } from './repository.js'
import { createPostgresRepository } from './postgres-repository.js'

export function createRepository(databaseUrl: string | null): OrderRepository {
  if (databaseUrl) return createPostgresRepository(databaseUrl)
  console.warn('Using the in-memory repository (ALLOW_IN_MEMORY_STORE=true). Data will be lost on restart.')
  return mockRepository
}

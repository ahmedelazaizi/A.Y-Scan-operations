import { mockRepository } from '../domain.js'
import type { OrderRepository } from './repository.js'
import { createPostgresRepository } from './postgres-repository.js'

export function createRepositoryFromEnvironment(databaseUrl = process.env.DATABASE_URL): OrderRepository {
  if (databaseUrl) return createPostgresRepository(databaseUrl)
  console.warn('DATABASE_URL is not configured; using in-memory repository. Data will not persist.')
  return mockRepository
}

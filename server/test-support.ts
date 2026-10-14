import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { createApp } from './app.js'
import { createMemoryUserStore } from './auth/memory-user-store.js'
import { createAuthService, type AuthService } from './auth/service.js'
import { ROLES, type Role } from './auth/types.js'
import { mockRepository } from './domain.js'
import type { OrderRepository } from './storage/repository.js'
import { createMemoryPhase1Store, type Phase1Store } from './phase1.js'

/** Deterministic bearer tokens, one per role, valid for every app built by createTestApp. */
export const TEST_TOKENS: Record<Role, string> = Object.fromEntries(ROLES.map((role) => [role, `test-token-${role}`])) as Record<Role, string>
export const TEST_ADMIN_TOKEN = TEST_TOKENS.admin
export const TEST_PASSWORD = 'Test-password-123'
const FAR_FUTURE = new Date('2999-01-01T00:00:00.000Z')

export type TestApp = { handler: ReturnType<typeof createApp>; auth: AuthService }

/** Builds the real app over an in-memory user store seeded with one active user per role (user@<role>.test). */
export async function createTestApp(repository: OrderRepository = mockRepository, phase1: Phase1Store = createMemoryPhase1Store()): Promise<TestApp> {
  const store = createMemoryUserStore()
  const auth = createAuthService(store)
  for (const role of ROLES) {
    const user = await store.createUser({
      username: `user@${role.replace('_', '-')}.test`,
      displayName: `Test ${role}`,
      role,
      // Seeded with a precomputed-format hash only; login tests create their own users through auth.createUser.
      passwordHash: 'scrypt$16384$8$1$AAAA$AAAA',
      mustChangePassword: false,
    })
    await store.createSession(user.id, createHash('sha256').update(TEST_TOKENS[role]).digest(), FAR_FUTURE)
  }
  return { handler: createApp({ repository, auth, phase1 }), auth }
}

export async function startTestServer(repository: OrderRepository = mockRepository): Promise<{ server: Server; baseUrl: string; auth: AuthService }> {
  const app = await createTestApp(repository)
  const server = createServer(app.handler)
  server.listen(0)
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address !== 'object') throw new Error('Test server did not bind to a port.')
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, auth: app.auth }
}

export type TestRequestOptions = {
  method?: string
  body?: string
  /** Defaults to the admin token; pass null to send no Authorization header. */
  token?: string | null
}

export function testHeaders(options: TestRequestOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const token = options.token === undefined ? TEST_ADMIN_TOKEN : options.token
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

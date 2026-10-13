import { createHash, randomBytes } from 'node:crypto'
import { getDummyPasswordHash, hashPassword, passwordPolicyError, verifyPassword } from './passwords.js'
import { LoginThrottle } from './rate-limit.js'
import {
  isRole,
  toAccount,
  toAuthenticatedUser,
  UserConflictError,
  UserNotFoundError,
  type AuthenticatedUser,
  type Role,
  type UserAccount,
  type UserStore,
  type UserUpdate,
} from './types.js'

export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const TOKEN_BYTES = 32
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type LoginResult =
  | { status: 'success'; user: AuthenticatedUser; token: string; expiresAt: string }
  | { status: 'invalid' }
  | { status: 'throttled'; retryAfterSeconds: number }

/** Raised for input the caller must fix; the message is safe to show to the user. */
export class AuthInputError extends Error {}
/** Raised when the request is understood but violates an account invariant. */
export class AuthConflictError extends Error {}
/** Raised when the current password supplied for a change is wrong. */
export class AuthCredentialError extends Error {}

export type NewUserInput = { email: string; displayName: string; role: Role; password: string }

export type AuthService = ReturnType<typeof createAuthService>

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function validateEmail(value: string): string {
  const email = normalizeEmail(value)
  if (email.length < 3 || email.length > 320 || !EMAIL_PATTERN.test(email)) throw new AuthInputError('email is invalid.')
  return email
}

function validateDisplayName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 200) throw new AuthInputError('displayName must be 1-200 characters.')
  return name
}

function assertPasswordPolicy(password: string): void {
  const error = passwordPolicyError(password)
  if (error) throw new AuthInputError(error)
}

export function createAuthService(store: UserStore, options: { sessionTtlMs?: number; throttle?: LoginThrottle; now?: () => number } = {}) {
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
  const throttle = options.throttle ?? new LoginThrottle()
  const now = options.now ?? Date.now

  async function issueSession(user: AuthenticatedUser): Promise<{ token: string; expiresAt: string }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    const expiresAt = new Date(now() + sessionTtlMs)
    await store.createSession(user.id, hashToken(token), expiresAt)
    return { token, expiresAt: expiresAt.toISOString() }
  }

  async function createUser(input: NewUserInput, options: { mustChangePassword?: boolean } = {}): Promise<UserAccount> {
    const email = validateEmail(input.email)
    const displayName = validateDisplayName(input.displayName)
    if (!isRole(input.role)) throw new AuthInputError('role is invalid.')
    assertPasswordPolicy(input.password)
    return store.createUser({
      email,
      displayName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      mustChangePassword: options.mustChangePassword ?? true,
    })
  }

  /** Demoting or deactivating the last active admin would lock everyone out of user management. */
  async function assertKeepsAnAdmin(target: UserAccount, update: UserUpdate): Promise<void> {
    const losesAdmin = target.role === 'admin' && target.isActive
      && ((update.role !== undefined && update.role !== 'admin') || update.isActive === false)
    if (losesAdmin && (await store.countActiveAdmins()) <= 1) {
      throw new AuthConflictError('At least one active admin account must remain.')
    }
  }

  return {
    issueSession,

    async login(email: string, password: string, clientAddress: string): Promise<LoginResult> {
      const normalized = normalizeEmail(email)
      const retryAfterMs = throttle.retryAfterMs(normalized, clientAddress)
      if (retryAfterMs > 0) return { status: 'throttled', retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }

      const user = await store.findUserByEmail(normalized)
      // Always run one scrypt verification so response time does not reveal whether the account exists.
      const passwordMatches = await verifyPassword(password, user?.passwordHash ?? await getDummyPasswordHash())
      if (!user || !user.isActive || !passwordMatches) {
        throttle.recordFailure(normalized, clientAddress)
        return { status: 'invalid' }
      }
      throttle.recordSuccess(normalized)
      await store.recordLogin(user.id)
      const authenticated = toAuthenticatedUser(user)
      return { status: 'success', user: authenticated, ...await issueSession(authenticated) }
    },

    async authenticate(token: string): Promise<AuthenticatedUser | null> {
      if (!token || token.length > 200) return null
      const user = await store.findActiveSession(hashToken(token))
      return user ? toAuthenticatedUser(user) : null
    },

    async logout(token: string): Promise<void> {
      await store.revokeSession(hashToken(token))
    },

    async changeOwnPassword(user: AuthenticatedUser, currentToken: string, currentPassword: string, newPassword: string): Promise<void> {
      const stored = await store.findUserById(user.id)
      if (!stored) throw new UserNotFoundError('User was not found.')
      if (!(await verifyPassword(currentPassword, stored.passwordHash))) throw new AuthCredentialError('Current password is incorrect.')
      assertPasswordPolicy(newPassword)
      if (currentPassword === newPassword) throw new AuthInputError('New password must differ from the current password.')
      await store.setPassword(user.id, await hashPassword(newPassword), false)
      // Other devices signed in with the old password are signed out.
      await store.revokeUserSessions(user.id, hashToken(currentToken))
    },

    listUsers: (): Promise<UserAccount[]> => store.listUsers(),

    createUser,

    async updateUser(actor: AuthenticatedUser, id: string, update: UserUpdate): Promise<UserAccount> {
      const target = await store.findUserById(id)
      if (!target) throw new UserNotFoundError('User was not found.')
      if (update.role !== undefined && !isRole(update.role)) throw new AuthInputError('role is invalid.')
      const normalized: UserUpdate = { ...update, ...(update.displayName !== undefined ? { displayName: validateDisplayName(update.displayName) } : {}) }
      if (actor.id === id && (normalized.isActive === false || (normalized.role !== undefined && normalized.role !== target.role))) {
        throw new AuthConflictError('You cannot deactivate your own account or change your own role.')
      }
      await assertKeepsAnAdmin(toAccount(target), normalized)
      const updated = await store.updateUser(id, normalized)
      if (normalized.isActive === false || (normalized.role !== undefined && normalized.role !== target.role)) {
        await store.revokeUserSessions(id)
      }
      return updated
    },

    async resetPassword(id: string, newPassword: string): Promise<void> {
      assertPasswordPolicy(newPassword)
      if (!(await store.findUserById(id))) throw new UserNotFoundError('User was not found.')
      await store.setPassword(id, await hashPassword(newPassword), true)
      await store.revokeUserSessions(id)
    },

    /**
     * Creates the first admin from AUTH_ADMIN_* variables when no account exists yet.
     * It never touches an existing installation, so the variables can be removed after first start.
     */
    async bootstrapAdmin(environment: NodeJS.ProcessEnv = process.env): Promise<'created' | 'skipped'> {
      const email = environment.AUTH_ADMIN_EMAIL?.trim()
      const password = environment.AUTH_ADMIN_PASSWORD ?? ''
      if (!email || !password || (await store.countUsers()) > 0) return 'skipped'
      try {
        await createUser(
          { email, password, role: 'admin', displayName: environment.AUTH_ADMIN_DISPLAY_NAME?.trim() || 'مدير النظام' },
          { mustChangePassword: false },
        )
      } catch (error) {
        if (error instanceof UserConflictError) return 'skipped'
        throw error
      }
      return 'created'
    },

    pruneSessions: (): Promise<number> => store.deleteExpiredSessions(),
  }
}

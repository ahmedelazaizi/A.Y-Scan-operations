import { randomUUID } from 'node:crypto'
import { UserConflictError, UserNotFoundError, toAccount, type StoredUser, type UserAccount, type UserStore } from './types.js'

type MemorySession = { userId: string; expiresAt: number; revoked: boolean }

/** In-memory store for tests and throwaway development runs. */
export function createMemoryUserStore(now: () => number = Date.now): UserStore {
  const users = new Map<string, StoredUser>()
  const sessions = new Map<string, MemorySession>()
  const key = (tokenHash: Buffer) => tokenHash.toString('hex')

  function requireUser(id: string): StoredUser {
    const user = users.get(id)
    if (!user) throw new UserNotFoundError('User was not found.')
    return user
  }

  return {
    async countUsers() { return users.size },
    async countActiveAdmins() { return [...users.values()].filter((user) => user.isActive && user.role === 'admin').length },
    async findUserByUsername(username) {
      const normalized = username.trim().toLowerCase()
      return [...users.values()].find((user) => user.username === normalized) ?? null
    },
    async findUserById(id) { return users.get(id) ?? null },
    async listUsers(): Promise<UserAccount[]> {
      return [...users.values()].sort((left, right) => left.username.localeCompare(right.username)).map(toAccount)
    },
    async createUser(input) {
      const username = input.username.trim().toLowerCase()
      if ([...users.values()].some((user) => user.username === username)) throw new UserConflictError('Username is already taken.')
      const user: StoredUser = {
        id: randomUUID(),
        username,
        displayName: input.displayName,
        role: input.role,
        passwordHash: input.passwordHash,
        mustChangePassword: input.mustChangePassword,
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(now()).toISOString(),
      }
      users.set(user.id, user)
      return toAccount(user)
    },
    async updateUser(id, update) {
      const user = requireUser(id)
      if (update.displayName !== undefined) user.displayName = update.displayName
      if (update.role !== undefined) user.role = update.role
      if (update.isActive !== undefined) user.isActive = update.isActive
      return toAccount(user)
    },
    async setPassword(id, passwordHash, mustChangePassword) {
      const user = requireUser(id)
      user.passwordHash = passwordHash
      user.mustChangePassword = mustChangePassword
    },
    async recordLogin(id) { requireUser(id).lastLoginAt = new Date(now()).toISOString() },
    async createSession(userId, tokenHash, expiresAt) {
      sessions.set(key(tokenHash), { userId, expiresAt: expiresAt.getTime(), revoked: false })
    },
    async findActiveSession(tokenHash) {
      const session = sessions.get(key(tokenHash))
      if (!session || session.revoked || session.expiresAt <= now()) return null
      const user = users.get(session.userId)
      return user?.isActive ? user : null
    },
    async revokeSession(tokenHash) {
      const session = sessions.get(key(tokenHash))
      if (session) session.revoked = true
    },
    async revokeUserSessions(userId, exceptTokenHash) {
      const keep = exceptTokenHash ? key(exceptTokenHash) : null
      for (const [sessionKey, session] of sessions) {
        if (session.userId === userId && sessionKey !== keep) session.revoked = true
      }
    },
    async deleteExpiredSessions() {
      let removed = 0
      for (const [sessionKey, session] of sessions) {
        if (session.revoked || session.expiresAt <= now()) {
          sessions.delete(sessionKey)
          removed += 1
        }
      }
      return removed
    },
  }
}

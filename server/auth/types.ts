export const ROLES = ['admin', 'branch_manager', 'receptionist', 'lab_technician', 'radiologist', 'accountant', 'lab_consultant'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export type AuthenticatedUser = {
  id: string
  username: string
  displayName: string
  role: Role
  mustChangePassword: boolean
}

export type UserAccount = AuthenticatedUser & {
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type StoredUser = UserAccount & { passwordHash: string }

export type NewUserRecord = {
  username: string
  displayName: string
  role: Role
  passwordHash: string
  mustChangePassword: boolean
}

export type UserUpdate = { displayName?: string; role?: Role; isActive?: boolean }

export class UserConflictError extends Error {}
export class UserNotFoundError extends Error {}

/** Persistence for accounts and server-side sessions. Session tokens are only ever stored as SHA-256 hashes. */
export type UserStore = {
  countUsers(): Promise<number>
  countActiveAdmins(): Promise<number>
  findUserByUsername(username: string): Promise<StoredUser | null>
  findUserById(id: string): Promise<StoredUser | null>
  listUsers(): Promise<UserAccount[]>
  createUser(input: NewUserRecord): Promise<UserAccount>
  updateUser(id: string, update: UserUpdate): Promise<UserAccount>
  setPassword(id: string, passwordHash: string, mustChangePassword: boolean): Promise<void>
  recordLogin(id: string): Promise<void>
  createSession(userId: string, tokenHash: Buffer, expiresAt: Date): Promise<void>
  /** Returns the session's user only when the session is unexpired, unrevoked and the user is active. */
  findActiveSession(tokenHash: Buffer): Promise<StoredUser | null>
  revokeSession(tokenHash: Buffer): Promise<void>
  revokeUserSessions(userId: string, exceptTokenHash?: Buffer): Promise<void>
  deleteExpiredSessions(): Promise<number>
}

export function toAccount(user: StoredUser): UserAccount {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}

export function toAuthenticatedUser(user: UserAccount): AuthenticatedUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, mustChangePassword: user.mustChangePassword }
}

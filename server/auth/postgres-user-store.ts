import type { Pool } from 'pg'
import { isRole, UserConflictError, UserNotFoundError, toAccount, type StoredUser, type UserStore } from './types.js'

const USER_COLUMNS = 'id, username, display_name, role, password_hash, is_active, must_change_password, last_login_at, created_at'
const QUALIFIED_USER_COLUMNS = USER_COLUMNS.split(', ').map((column) => `u.${column}`).join(', ')

function formatUser(row: Record<string, unknown>): StoredUser {
  const role = row.role
  if (!isRole(role)) throw new Error('Stored user has an unknown role.')
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role,
    passwordHash: String(row.password_hash),
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function isInvalidUuid(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '22P02'
}

export function createPostgresUserStore(pool: Pool): UserStore {
  async function findOne(whereClause: string, value: unknown): Promise<StoredUser | null> {
    try {
      const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE ${whereClause}`, [value])
      return result.rows[0] ? formatUser(result.rows[0]) : null
    } catch (error) {
      if (isInvalidUuid(error)) return null
      throw error
    }
  }

  async function updateReturning(id: string, sql: string, parameters: unknown[]): Promise<StoredUser> {
    try {
      const result = await pool.query(`${sql} RETURNING ${USER_COLUMNS}`, [id, ...parameters])
      if (!result.rows[0]) throw new UserNotFoundError('User was not found.')
      return formatUser(result.rows[0])
    } catch (error) {
      if (isInvalidUuid(error)) throw new UserNotFoundError('User was not found.')
      throw error
    }
  }

  return {
    async countUsers() {
      const result = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM users')
      return Number(result.rows[0]?.count ?? 0)
    },
    async countActiveAdmins() {
      const result = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active")
      return Number(result.rows[0]?.count ?? 0)
    },
    findUserByUsername: (username) => findOne('lower(username) = lower($1)', username.trim()),
    findUserById: (id) => findOne('id = $1', id),
    async listUsers() {
      const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users ORDER BY lower(username)`)
      return result.rows.map((row) => toAccount(formatUser(row)))
    },
    async createUser(input) {
      try {
        const result = await pool.query(
          `INSERT INTO users (username, display_name, role, password_hash, must_change_password)
           VALUES (lower($1), $2, $3, $4, $5)
           RETURNING ${USER_COLUMNS}`,
          [input.username.trim(), input.displayName, input.role, input.passwordHash, input.mustChangePassword],
        )
        return toAccount(formatUser(result.rows[0]))
      } catch (error) {
        if (isUniqueViolation(error)) throw new UserConflictError('Username is already taken.')
        throw error
      }
    },
    async updateUser(id, update) {
      const user = await updateReturning(
        id,
        `UPDATE users
         SET display_name = COALESCE($2, display_name),
             role = COALESCE($3, role),
             is_active = COALESCE($4, is_active),
             updated_at = now()
         WHERE id = $1`,
        [update.displayName ?? null, update.role ?? null, update.isActive ?? null],
      )
      return toAccount(user)
    },
    async setPassword(id, passwordHash, mustChangePassword) {
      await updateReturning(id, 'UPDATE users SET password_hash = $2, must_change_password = $3, updated_at = now() WHERE id = $1', [passwordHash, mustChangePassword])
    },
    async recordLogin(id) {
      await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id])
    },
    async createSession(userId, tokenHash, expiresAt) {
      await pool.query('INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, tokenHash, expiresAt])
    },
    async findActiveSession(tokenHash) {
      const result = await pool.query(
        `SELECT ${QUALIFIED_USER_COLUMNS}
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`,
        [tokenHash],
      )
      return result.rows[0] ? formatUser(result.rows[0]) : null
    },
    async revokeSession(tokenHash) {
      await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash])
    },
    async revokeUserSessions(userId, exceptTokenHash) {
      await pool.query(
        `UPDATE auth_sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL AND ($2::bytea IS NULL OR token_hash <> $2)`,
        [userId, exceptTokenHash ?? null],
      )
    },
    async deleteExpiredSessions() {
      const result = await pool.query("DELETE FROM auth_sessions WHERE expires_at < now() - INTERVAL '1 day' OR revoked_at < now() - INTERVAL '1 day'")
      return result.rowCount ?? 0
    },
  }
}

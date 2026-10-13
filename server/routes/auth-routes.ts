import type { AuthService } from '../auth/service.js'
import { isRole, type UserUpdate } from '../auth/types.js'
import { capabilitiesFor } from '../permissions.js'
import { publicRoute, requires, route, signedIn, ValidationError, type Route } from '../router.js'
import { isRecord, isUuid } from '../validation.js'

function readString(value: unknown, field: string, maximum = 320): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ValidationError(`${field} is required.`)
  return value
}

function parseUserUpdate(value: unknown): UserUpdate {
  if (!isRecord(value)) throw new ValidationError('Body must be an object.')
  const update: UserUpdate = {}
  if (value.displayName !== undefined) update.displayName = readString(value.displayName, 'displayName', 200)
  if (value.role !== undefined) {
    if (!isRole(value.role)) throw new ValidationError('role is invalid.')
    update.role = value.role
  }
  if (value.isActive !== undefined) {
    if (typeof value.isActive !== 'boolean') throw new ValidationError('isActive must be a boolean.')
    update.isActive = value.isActive
  }
  if (Object.keys(update).length === 0) throw new ValidationError('Nothing to update.')
  return update
}

function requireUserId(id: string): string {
  if (!isUuid(id)) throw new ValidationError('id must be a valid UUID.')
  return id
}

export function authRoutes(auth: AuthService): Route[] {
  return [
    publicRoute('POST', '/api/auth/login', async (context) => {
      const body = await context.body()
      if (!isRecord(body) || typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 200) {
        throw new ValidationError('username and password are required.')
      }
      const result = await auth.login(body.username, body.password, context.clientAddress)
      if (result.status === 'throttled') {
        context.response.setHeader('Retry-After', String(result.retryAfterSeconds))
        context.json(429, { error: 'Too Many Requests', message: 'Too many failed sign-in attempts. Try again later.', retryAfterSeconds: result.retryAfterSeconds })
        return
      }
      if (result.status === 'invalid') {
        await context.audit({ action: 'auth.login_failed', entityType: 'user', metadata: { authResult: 'invalid' } })
        context.json(401, { error: 'Unauthorized', message: 'Invalid credentials.' })
        return
      }
      await context.audit({ action: 'auth.login_success', entityType: 'user', entityId: result.user.id, metadata: { authResult: 'success', role: result.user.role } }, result.user.id)
      context.json(200, { user: result.user, token: result.token, expiresAt: result.expiresAt, capabilities: capabilitiesFor(result.user.role) })
    }),

    route('GET', '/api/auth/me', signedIn({ allowPendingPasswordChange: true }), (context) => {
      context.json(200, { user: context.user, capabilities: capabilitiesFor(context.user.role) })
    }),

    route('POST', '/api/auth/logout', signedIn({ allowPendingPasswordChange: true }), async (context) => {
      await auth.logout(context.token)
      await context.audit({ action: 'auth.logout', entityType: 'user', entityId: context.user.id })
      context.response.statusCode = 204
      context.response.end()
    }),

    route('POST', '/api/auth/password', signedIn({ allowPendingPasswordChange: true }), async (context) => {
      const body = await context.body()
      if (!isRecord(body)) throw new ValidationError('currentPassword and newPassword are required.')
      const currentPassword = readString(body.currentPassword, 'currentPassword', 200)
      const newPassword = readString(body.newPassword, 'newPassword', 200)
      await auth.changeOwnPassword(context.user, context.token, currentPassword, newPassword)
      await context.audit({ action: 'auth.password_changed', entityType: 'user', entityId: context.user.id })
      context.json(200, { user: { ...context.user, mustChangePassword: false } })
    }),

    route('GET', '/api/users', requires('users.manage'), async (context) => {
      context.json(200, await auth.listUsers())
    }),

    route('POST', '/api/users', requires('users.manage'), async (context) => {
      const body = await context.body()
      if (!isRecord(body)) throw new ValidationError('username, displayName, role, and password are required.')
      if (!isRole(body.role)) throw new ValidationError('role is invalid.')
      const user = await auth.createUser({
        username: readString(body.username, 'username'),
        displayName: readString(body.displayName, 'displayName', 200),
        role: body.role,
        password: readString(body.password, 'password', 200),
      })
      await context.audit({ action: 'user.created', entityType: 'user', entityId: user.id, metadata: { role: user.role } })
      context.json(201, user)
    }),

    route('PATCH', '/api/users/:id', requires('users.manage'), async (context) => {
      const id = requireUserId(context.params.id)
      const user = await auth.updateUser(context.user, id, parseUserUpdate(await context.body()))
      await context.audit({ action: 'user.updated', entityType: 'user', entityId: user.id, metadata: { role: user.role, status: user.isActive ? 'active' : 'inactive' } })
      context.json(200, user)
    }),

    route('POST', '/api/users/:id/reset-password', requires('users.manage'), async (context) => {
      const id = requireUserId(context.params.id)
      const body = await context.body()
      if (!isRecord(body)) throw new ValidationError('password is required.')
      await auth.resetPassword(id, readString(body.password, 'password', 200))
      await context.audit({ action: 'user.password_reset', entityType: 'user', entityId: id })
      context.response.statusCode = 204
      context.response.end()
    }),
  ]
}

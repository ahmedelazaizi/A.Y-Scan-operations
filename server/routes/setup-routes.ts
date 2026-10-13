import type { AuthService } from '../auth/service.js'
import { publicRoute, ValidationError, type Route } from '../router.js'
import { isRecord } from '../validation.js'

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function readString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ValidationError(`${field} is required.`)
  return value
}

/**
 * First-run setup. The first administrator is created from the browser of the machine that runs the server,
 * so the installer never has to handle a password. It is only available while no account exists.
 */
export function setupRoutes(auth: AuthService): Route[] {
  return [
    publicRoute('GET', '/api/setup/status', async (context) => {
      context.json(200, { needsSetup: !(await auth.hasUsers()) })
    }),

    publicRoute('POST', '/api/setup', async (context) => {
      if (!LOOPBACK_ADDRESSES.has(context.clientAddress)) {
        context.json(403, { error: 'Forbidden', message: 'First-time setup must be done from the computer that runs A.Y Scan.' })
        return
      }
      const body = await context.body()
      if (!isRecord(body)) throw new ValidationError('email, displayName, and password are required.')
      const user = await auth.setupFirstAdmin({
        email: readString(body.email, 'email', 320),
        displayName: readString(body.displayName, 'displayName', 200),
        password: readString(body.password, 'password', 200),
      })
      await context.audit({ action: 'setup.admin_created', entityType: 'user', entityId: user.id, metadata: { role: user.role } }, user.id)
      context.json(201, { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } })
    }),
  ]
}

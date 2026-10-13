import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from './http.js'

export const ROLES = ['admin', 'branch_manager', 'receptionist', 'lab_technician', 'radiologist', 'accountant'] as const
export type Role = (typeof ROLES)[number]

export type AuthenticatedUser = {
  id: string
  email: string
  displayName: string
  role: Role
}

type LoginResult =
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'success'; user: AuthenticatedUser; token: string; expiresAt: string }

type BootstrapConfig = {
  email: string
  password: string
  displayName: string
  role: Role
  tokenSecret: Buffer
}

type TokenClaims = AuthenticatedUser & { exp: number; v: 1 }

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000
const PASSWORD_KEY_LENGTH = 32
const PASSWORD_SALT = randomBytes(16)
const TOKEN_VERSION = 'v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function hashForComparison(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function buffersMatch(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right)
}

function derivePasswordHash(password: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, PASSWORD_SALT, PASSWORD_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey)
    })
  })
}

function readBootstrapConfig(): BootstrapConfig | null {
  const email = normalizeEmail(process.env.AUTH_ADMIN_EMAIL ?? '')
  const password = process.env.AUTH_ADMIN_PASSWORD ?? ''
  const tokenSecretValue = process.env.AUTH_TOKEN_SECRET?.trim() ?? ''
  const configuredRole = process.env.AUTH_ADMIN_ROLE?.trim() || 'admin'
  const displayName = process.env.AUTH_ADMIN_DISPLAY_NAME?.trim() || email
  if (!email || !password || !tokenSecretValue || !isRole(configuredRole)) return null
  return { email, password, displayName, role: configuredRole, tokenSecret: Buffer.from(tokenSecretValue, 'utf8') }
}

function createUserProfile(config: BootstrapConfig): AuthenticatedUser {
  const id = `bootstrap-${createHash('sha256').update(config.email).digest('hex').slice(0, 24)}`
  return { id, email: config.email, displayName: config.displayName, role: config.role }
}

function signToken(payloadSegment: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(payloadSegment).digest('base64url')
}

function encodeTokenClaims(claims: TokenClaims): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
}

function decodeTokenClaims(encodedClaims: string): TokenClaims | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'))
    if (!isRecord(parsed) || parsed.v !== 1 || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string' || typeof parsed.displayName !== 'string' || !isRole(parsed.role)) return null
    return { v: 1, exp: parsed.exp, id: parsed.id, email: parsed.email, displayName: parsed.displayName, role: parsed.role }
  } catch {
    return null
  }
}

function issueToken(user: AuthenticatedUser, secret: Buffer): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  const claims: TokenClaims = { v: 1, exp: expiresAt.getTime(), ...user }
  const encodedClaims = encodeTokenClaims(claims)
  return { token: `${TOKEN_VERSION}.${encodedClaims}.${signToken(encodedClaims, secret)}`, expiresAt: expiresAt.toISOString() }
}

function verifyToken(token: string): AuthenticatedUser | null {
  const config = readBootstrapConfig()
  if (!config) return null
  const segments = token.split('.')
  if (segments.length !== 3 || segments[0] !== TOKEN_VERSION || !segments[1] || !segments[2]) return null
  const expectedSignature = signToken(segments[1], config.tokenSecret)
  if (!buffersMatch(Buffer.from(segments[2]), Buffer.from(expectedSignature))) return null
  const claims = decodeTokenClaims(segments[1])
  return claims ? { id: claims.id, email: claims.email, displayName: claims.displayName, role: claims.role } : null
}

export function parseLoginCredentials(value: unknown): { email: string; password: string } | null {
  if (!isRecord(value) || typeof value.email !== 'string' || typeof value.password !== 'string') return null
  return { email: value.email, password: value.password }
}

export function isAuthenticationConfigured(): boolean {
  return readBootstrapConfig() !== null
}

export async function createLoginSession(email: string, password: string): Promise<LoginResult> {
  const config = readBootstrapConfig()
  if (!config) return { status: 'unavailable' }
  const [expectedPassword, suppliedPassword] = await Promise.all([
    derivePasswordHash(config.password),
    derivePasswordHash(password),
  ])
  const emailMatches = buffersMatch(hashForComparison(normalizeEmail(email)), hashForComparison(config.email))
  const passwordMatches = buffersMatch(expectedPassword, suppliedPassword)
  if (!emailMatches || !passwordMatches) return { status: 'invalid' }
  const user = createUserProfile(config)
  const session = issueToken(user, config.tokenSecret)
  return { status: 'success', user, ...session }
}

export function authenticateRequest(request: IncomingMessage): AuthenticatedUser | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length).trim()
  return token ? verifyToken(token) : null
}

export function hasRole(user: AuthenticatedUser, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(user.role)
}

export function requireRole(request: IncomingMessage, response: ServerResponse, allowedRoles: readonly Role[]): AuthenticatedUser | null {
  const user = authenticateRequest(request)
  if (!user) {
    sendUnauthorized(response)
    return null
  }
  if (!hasRole(user, allowedRoles)) {
    sendJson(response, 403, { error: 'Forbidden' })
    return null
  }
  return user
}

export function sendUnauthorized(response: ServerResponse): void {
  sendJson(response, 401, { error: 'Unauthorized', message: 'Authentication required.' })
}

export function isAuthRequired(): boolean {
  return process.env.AUTH_REQUIRED?.trim().toLowerCase() === 'true'
}

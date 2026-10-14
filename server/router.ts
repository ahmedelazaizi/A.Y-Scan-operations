import type { IncomingMessage, ServerResponse } from 'node:http'
import { AuditValidationError, type AuditEventInput } from './audit.js'
import { AuthConflictError, AuthCredentialError, AuthInputError, type AuthService } from './auth/service.js'
import { UserConflictError, UserNotFoundError, type AuthenticatedUser } from './auth/types.js'
import {
  applyCors,
  applySecurityHeaders,
  readJsonBody,
  RequestBodyError,
  sendBadRequest,
  sendInternalError,
  sendJson,
  sendMethodNotAllowed,
  sendNotFound,
  sendRequestBodyError,
} from './http.js'
import { hasCapability, type Capability } from './permissions.js'
import { ReportValidationError } from './reports.js'
import { LicenseError } from './trial-license.js'
import { RepositoryConflictError, RepositoryInputError, RepositoryNotFoundError, type OrderRepository } from './storage/repository.js'

export type HttpMethod = 'GET' | 'POST' | 'PATCH'

/** Raised by handlers for request input that fails validation; mapped to 400. */
export class ValidationError extends Error {}

export type RouteContext = {
  request: IncomingMessage
  response: ServerResponse
  params: Record<string, string>
  query: URLSearchParams
  user: AuthenticatedUser
  token: string
  clientAddress: string
  /** Parses the JSON body (size and content-type enforced). */
  body(): Promise<unknown>
  /** Records an audit event attributed to the caller (or `actorId`); failures never break the business response. */
  audit(event: Omit<AuditEventInput, 'actorId'>, actorId?: string): Promise<void>
  json(statusCode: number, payload: unknown): void
}

export type PublicRouteContext = Omit<RouteContext, 'user' | 'token'> & { user: AuthenticatedUser | null; token: string | null }

type Access =
  | { kind: 'public' }
  | { kind: 'authenticated'; allowPendingPasswordChange?: boolean }
  | { kind: 'capability'; capability: Capability }

export type Route = {
  method: HttpMethod
  path: string
  access: Access
  handler: (context: RouteContext) => Promise<void> | void
}

type CompiledRoute = Route & { segments: string[] }

export const publicAccess: Access = { kind: 'public' }
export const signedIn = (options: { allowPendingPasswordChange?: boolean } = {}): Access => ({ kind: 'authenticated', ...options })
export const requires = (capability: Capability): Access => ({ kind: 'capability', capability })

export function route(method: HttpMethod, path: string, access: Access, handler: Route['handler']): Route {
  return { method, path, access, handler }
}

/** A public route receives the same context, but user and token may be null. */
export function publicRoute(method: HttpMethod, path: string, handler: (context: PublicRouteContext) => Promise<void> | void): Route {
  return { method, path, access: publicAccess, handler: handler as Route['handler'] }
}

function splitPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

function matchRoute(route: CompiledRoute, segments: string[]): Record<string, string> | null {
  if (route.segments.length !== segments.length) return null
  const params: Record<string, string> = {}
  for (const [index, pattern] of route.segments.entries()) {
    const segment = segments[index]
    if (pattern.startsWith(':')) {
      try {
        const value = decodeURIComponent(segment)
        if (!value.trim() || value.length > 200) return null
        params[pattern.slice(1)] = value
      } catch {
        return null
      }
    } else if (pattern !== segment) {
      return null
    }
  }
  return params
}

function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof LicenseError) return sendJson(response, error.code === 'ACTIVATION_REQUIRED' ? 423 : error.code === 'QUOTA_EXHAUSTED' ? 429 : 400, { error: error.code, code: error.code, message: error.message })
  if (error instanceof RequestBodyError) return sendRequestBodyError(response, error)
  if (
    error instanceof ValidationError || error instanceof AuditValidationError || error instanceof RepositoryInputError
    || error instanceof ReportValidationError || error instanceof AuthInputError
  ) return sendBadRequest(response, error.message)
  if (error instanceof RepositoryNotFoundError || error instanceof UserNotFoundError) {
    return sendJson(response, 404, { error: 'Not Found', message: error.message })
  }
  if (error instanceof RepositoryConflictError || error instanceof UserConflictError || error instanceof AuthConflictError) {
    return sendJson(response, 409, { error: 'Conflict', message: error.message })
  }
  if (error instanceof AuthCredentialError) return sendJson(response, 403, { error: 'Forbidden', message: error.message })
  console.error('Request failed:', error instanceof Error ? error.message : 'unknown error')
  sendInternalError(response)
}

export function sendUnauthorized(response: ServerResponse): void {
  sendJson(response, 401, { error: 'Unauthorized', message: 'Authentication required.' })
}

export function createRouter(routes: Route[], dependencies: { auth: AuthService; repository: OrderRepository; trialLicense?: { withRecordEntry<T>(operation: () => Promise<T>): Promise<T> } }) {
  const recordCreationPath = (entry: Route) => (entry.method === 'POST' && /^\/api\/(orders|patients|catalog|specimens|results|billing\/invoices|billing\/invoices\/:id\/payments|radiology\/studies|inventory\/items|inventory\/items\/:id\/movements|insurance\/policies|insurance\/claims|home-visits|devices|users|phase1\/(practitioners|bundles|parameters|ranges))$/.test(entry.path)) || (entry.method === 'POST' && /^\/api\/results\/:id\/amend$/.test(entry.path)) || (entry.method === 'PATCH' && entry.path === '/api/phase1/ranges/:id')
  const compiled: CompiledRoute[] = routes.map((entry) => {
    if (!recordCreationPath(entry) || !dependencies.trialLicense) return { ...entry, segments: splitPath(entry.path) }
    return { ...entry, handler: (context) => dependencies.trialLicense!.withRecordEntry(() => Promise.resolve(entry.handler(context))), segments: splitPath(entry.path) }
  })

  async function recordAudit(actorId: string, event: Omit<AuditEventInput, 'actorId'>): Promise<void> {
    try {
      await dependencies.repository.recordAuditEvent({ ...event, actorId })
    } catch {
      console.warn('Audit event recording failed; business response preserved.')
    }
  }

  async function dispatch(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const segments = splitPath(requestUrl.pathname)
    const candidates = compiled
      .map((entry) => ({ entry, params: matchRoute(entry, segments) }))
      .filter((candidate): candidate is { entry: CompiledRoute; params: Record<string, string> } => candidate.params !== null)
    if (candidates.length === 0) return sendNotFound(response)
    const matched = candidates.find((candidate) => candidate.entry.method === request.method)
    if (!matched) return sendMethodNotAllowed(response, [...new Set(candidates.map((candidate) => candidate.entry.method))].join(', '))

    const { entry, params } = matched
    const token = bearerToken(request)
    const user = token ? await dependencies.auth.authenticate(token) : null
    if (entry.access.kind !== 'public') {
      if (!user || !token) return sendUnauthorized(response)
      const allowPending = entry.access.kind === 'authenticated' && entry.access.allowPendingPasswordChange
      if (user.mustChangePassword && !allowPending) {
        return sendJson(response, 403, { error: 'Password Change Required', message: 'Change your password before continuing.' })
      }
      if (entry.access.kind === 'capability' && !hasCapability(user.role, entry.access.capability)) {
        return sendJson(response, 403, { error: 'Forbidden', message: 'Your role does not allow this action.' })
      }
    }

    const context: PublicRouteContext = {
      request,
      response,
      params,
      query: requestUrl.searchParams,
      user,
      token,
      clientAddress: request.socket.remoteAddress ?? 'unknown',
      body: () => readJsonBody(request),
      audit: (event, actorId) => recordAudit(actorId ?? user?.id ?? 'system', event),
      json: (statusCode, payload) => sendJson(response, statusCode, payload),
    }
    await entry.handler(context as RouteContext)
  }

  return (request: IncomingMessage, response: ServerResponse): void => {
    applySecurityHeaders(response)
    applyCors(response, request.headers.origin)
    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }
    dispatch(request, response).catch((error: unknown) => sendError(response, error))
  }
}

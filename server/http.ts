import type { IncomingMessage, ServerResponse } from 'node:http'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
export const MAX_BODY_BYTES = 1024 * 1024

export class RequestBodyError extends Error {
  constructor(readonly statusCode: 400 | 413 | 415, message: string) {
    super(message)
  }
}

function allowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return new Set(configured.length > 0 ? configured : process.env.NODE_ENV === 'production' ? [] : DEVELOPMENT_ORIGINS)
}

export function applyCors(response: ServerResponse, requestOrigin: string | undefined): void {
  if (requestOrigin && allowedOrigins().has(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin)
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    response.setHeader('Vary', 'Origin')
  }
}

export function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
}

function isJsonContentType(contentType: string | undefined): boolean {
  return Boolean(contentType && /^application\/json\b/i.test(contentType.trim()))
}

export function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declaredLength = Number.parseInt(request.headers['content-length'] ?? '', 10)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      request.resume()
      reject(new RequestBodyError(413, 'Request body is too large.'))
      return
    }
    const chunks: Buffer[] = []
    let receivedBytes = 0
    let rejected = false
    request.on('data', (chunk: Buffer) => {
      if (rejected) return
      receivedBytes += chunk.length
      if (receivedBytes > MAX_BODY_BYTES) {
        rejected = true
        chunks.length = 0
        reject(new RequestBodyError(413, 'Request body is too large.'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks).toString('utf8')) })
    request.on('error', (error) => { if (!rejected) reject(error) })
  })
}

/** Reads and parses a JSON request body, enforcing content type and size limits. */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!isJsonContentType(request.headers['content-type'])) {
    request.resume()
    throw new RequestBodyError(415, 'Content-Type must be application/json.')
  }
  const body = await readBody(request)
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new RequestBodyError(400, 'Body must be valid JSON.')
  }
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  if (response.headersSent) return
  response.statusCode = statusCode
  response.setHeader('Content-Type', JSON_CONTENT_TYPE)
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

export function sendNotFound(response: ServerResponse): void {
  sendJson(response, 404, { error: 'Not Found' })
}

export function sendMethodNotAllowed(response: ServerResponse, allowed = 'GET, POST'): void {
  response.setHeader('Allow', allowed)
  sendJson(response, 405, { error: 'Method Not Allowed' })
}

export function sendBadRequest(response: ServerResponse, message: string): void {
  sendJson(response, 400, { error: 'Bad Request', message })
}

export function sendRequestBodyError(response: ServerResponse, error: RequestBodyError): void {
  const label = error.statusCode === 413 ? 'Payload Too Large' : error.statusCode === 415 ? 'Unsupported Media Type' : 'Bad Request'
  sendJson(response, error.statusCode, { error: label, message: error.message })
}

export function sendInternalError(response: ServerResponse): void {
  sendJson(response, 500, { error: 'Internal Server Error' })
}

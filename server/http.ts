import type { IncomingMessage, ServerResponse } from 'node:http'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const LOCAL_DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

export function applyCors(response: ServerResponse, requestOrigin: string | undefined): void {
  if (requestOrigin && LOCAL_DEV_ORIGINS.has(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin)
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Vary', 'Origin')
  }
}

export function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => { body += chunk })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', JSON_CONTENT_TYPE)
  response.end(JSON.stringify(payload))
}

export function sendNotFound(response: ServerResponse): void {
  sendJson(response, 404, { error: 'Not Found' })
}

export function sendMethodNotAllowed(response: ServerResponse): void {
  response.setHeader('Allow', 'GET, POST')
  sendJson(response, 405, { error: 'Method Not Allowed' })
}

export function sendBadRequest(response: ServerResponse, message: string): void {
  sendJson(response, 400, { error: 'Bad Request', message })
}

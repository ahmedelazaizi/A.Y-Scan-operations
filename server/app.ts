import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthService } from './auth/service.js'
import { applySecurityHeaders, sendInternalError } from './http.js'
import { createRouter, publicRoute, type Route } from './router.js'
import { authRoutes } from './routes/auth-routes.js'
import { labRoutes } from './routes/lab-routes.js'
import { operationsRoutes } from './routes/operations-routes.js'
import { setupRoutes } from './routes/setup-routes.js'
import { createStaticHandler } from './static.js'
import type { OrderRepository } from './storage/repository.js'

const SERVICE_NAME = 'ay-scan-api'

export type AppDependencies = {
  repository: OrderRepository
  auth: AuthService
  /** Directory of the built web app (dist). When set, non-API GET requests are served from it. */
  webRoot?: string
}

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void

function systemRoutes(repository: OrderRepository): Route[] {
  return [
    publicRoute('GET', '/api/health', (context) => context.json(200, { status: 'ok', service: SERVICE_NAME })),
    publicRoute('GET', '/api/ready', (context) => context.json(200, { status: 'ready', database: repository.databaseMode })),
  ]
}

export function createApp({ repository, auth, webRoot }: AppDependencies): RequestHandler {
  const routes = [
    ...systemRoutes(repository),
    ...authRoutes(auth),
    ...setupRoutes(auth),
    ...labRoutes(repository),
    ...operationsRoutes(repository),
  ]
  const router = createRouter(routes, { auth, repository })
  const serveStatic = webRoot ? createStaticHandler(webRoot) : null
  const handleApi: RequestHandler = (request, response) => {
    try {
      router(request, response)
    } catch (error) {
      console.error('Unhandled request error:', error instanceof Error ? error.message : 'unknown error')
      sendInternalError(response)
    }
  }
  if (!serveStatic) return handleApi
  return (request, response) => {
    applySecurityHeaders(response)
    serveStatic(request, response)
      .then((handled) => { if (!handled) handleApi(request, response) })
      .catch(() => sendInternalError(response))
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthService } from './auth/service.js'
import { applySecurityHeaders, sendInternalError } from './http.js'
import { createRouter, publicRoute, signedIn, ValidationError, type Route } from './router.js'
import { authRoutes } from './routes/auth-routes.js'
import { labRoutes } from './routes/lab-routes.js'
import { operationsRoutes } from './routes/operations-routes.js'
import { createMemoryPhase1SeedImporter } from './phase1-seed.js'
import { createMemoryPhase1Store, type Phase1Store } from './phase1.js'
import { createPhase1Routes } from './routes/phase1-routes.js'
import { createStaticHandler } from './static.js'
import type { OrderRepository } from './storage/repository.js'
import { createMemoryTrialLicenseStore, createTrialLicenseService } from './trial-license.js'

const SERVICE_NAME = 'ay-scan-api'

export type AppDependencies = {
  repository: OrderRepository
  auth: AuthService
  phase1?: Phase1Store
  phase1Importer?: ReturnType<typeof createMemoryPhase1SeedImporter>
  trialLicense?: ReturnType<typeof createTrialLicenseService>
  /** Directory of the built web app (dist). When set, non-API GET requests are served from it. */
  webRoot?: string
}

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void

function trialLicenseRoutes(license: ReturnType<typeof createTrialLicenseService>): Route[] {
  return [
    { method: 'GET', path: '/api/license/status', access: signedIn(), handler: async (context) => context.json(200, await license.getStatus()) },
    { method: 'POST', path: '/api/license/activate', access: signedIn(), handler: async (context) => {
      if (context.user.role !== 'admin') { context.json(403, { error: 'Forbidden', message: 'Only an administrator can activate this installation.' }); return }
      const body = await context.body()
      if (!body || typeof body !== 'object' || typeof (body as { activationCode?: unknown }).activationCode !== 'string') throw new ValidationError('activationCode is required.')
      const status = await license.activate((body as { activationCode: string }).activationCode)
      await context.audit({ action: 'license.activated', entityType: 'license' })
      context.json(200, status)
    } },
  ]
}

function systemRoutes(repository: OrderRepository): Route[] {
  return [
    publicRoute('GET', '/api/health', (context) => context.json(200, { status: 'ok', service: SERVICE_NAME })),
    publicRoute('GET', '/api/ready', (context) => context.json(200, { status: 'ready', database: repository.databaseMode })),
  ]
}

export function createApp({ repository, auth, phase1 = createMemoryPhase1Store(), phase1Importer = createMemoryPhase1SeedImporter(), trialLicense = createTrialLicenseService({ store: createMemoryTrialLicenseStore(), trial: false }), webRoot }: AppDependencies): RequestHandler {
  const routes = [
    ...systemRoutes(repository),
    ...trialLicenseRoutes(trialLicense),
    ...authRoutes(auth),
    ...labRoutes(repository, phase1),
    ...operationsRoutes(repository),
    ...createPhase1Routes(phase1, phase1Importer),
  ]
  const router = createRouter(routes, { auth, repository, trialLicense })
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

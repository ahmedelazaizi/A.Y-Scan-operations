import { createPublicKey, randomUUID, verify } from 'node:crypto'
import type { Pool } from 'pg'
import { readFile } from 'node:fs/promises'

export const TRIAL_LIMIT = 50
export type LicenseStatus = {
  edition: 'legacy' | 'trial'
  status: 'not_required' | 'activation_required' | 'active' | 'limit_reached'
  installationId: string
  recordLimit: number | null
  recordsUsed: number
  recordsRemaining: number | null
  canEnterData: boolean
}
type TrialState = { installationId: string; activationCode: string | null; recordsUsed: number }
export type TrialLicenseStore = {
  read(): Promise<TrialState>
  activate(installationId: string, activationCode: string): Promise<boolean>
  reserve(): Promise<boolean>
  release(): Promise<void>
}
export class LicenseError extends Error {
  constructor(public readonly code: 'ACTIVATION_REQUIRED' | 'QUOTA_EXHAUSTED' | 'INVALID_ACTIVATION' | 'ALREADY_ACTIVATED', message: string) { super(message) }
}
export function createPostgresTrialLicenseStore(pool: Pool): TrialLicenseStore {
  return {
    async read() {
      const result = await pool.query<{ installation_id: string; activation_code: string | null; records_used: number }>('SELECT installation_id, activation_code, records_used FROM trial_license_state WHERE singleton = TRUE')
      const row = result.rows[0]
      if (!row) throw new Error('Trial license state has not been initialized; apply migrations first.')
      return { installationId: row.installation_id, activationCode: row.activation_code, recordsUsed: row.records_used }
    },
    async activate(id, code) {
      const result = await pool.query('UPDATE trial_license_state SET activation_code = $2 WHERE singleton = TRUE AND installation_id = $1 AND activation_code IS NULL', [id, code])
      return result.rowCount === 1
    },
    async reserve() {
      const result = await pool.query('UPDATE trial_license_state SET records_used = records_used + 1 WHERE singleton = TRUE AND activation_code IS NOT NULL AND records_used < $1', [TRIAL_LIMIT])
      return result.rowCount === 1
    },
    async release() { await pool.query('UPDATE trial_license_state SET records_used = GREATEST(0, records_used - 1) WHERE singleton = TRUE') },
  }
}
export function createMemoryTrialLicenseStore(): TrialLicenseStore {
  const state: TrialState = { installationId: randomUUID(), activationCode: null, recordsUsed: 0 }
  return {
    read: async () => ({ ...state }),
    activate: async (id, code) => { if (state.activationCode !== null || state.installationId !== id) return false; state.activationCode = code; return true },
    reserve: async () => { if (state.activationCode === null || state.recordsUsed >= TRIAL_LIMIT) return false; state.recordsUsed++; return true },
    release: async () => { state.recordsUsed = Math.max(0, state.recordsUsed - 1) },
  }
}
export function createTrialLicenseService(options: { store: TrialLicenseStore; trial: boolean; publicKey?: string }) {
  const key = options.publicKey ? createPublicKey(options.publicKey) : null
  function activationMatches(code: string | null, installationId: string): boolean {
    if (!code || !key) return false
    try {
      const [payload, signature, extra] = code.split('.')
      if (!payload || !signature || extra) return false
      const bytes = Buffer.from(payload, 'base64url')
      if (bytes.toString('base64url') !== payload) return false
      const body = bytes.toString('utf8')
      const signatureBytes = Buffer.from(signature, 'base64url')
      if (!signatureBytes.length || signatureBytes.toString('base64url') !== signature || !verify(null, Buffer.from(body), key, signatureBytes)) return false
      const parsed = JSON.parse(body) as { version?: unknown; installationId?: unknown; edition?: unknown; recordLimit?: unknown; issuedAt?: unknown }
      return parsed.version === 1 && parsed.installationId === installationId && parsed.edition === 'trial' && parsed.recordLimit === TRIAL_LIMIT && typeof parsed.issuedAt === 'string' && Number.isFinite(Date.parse(parsed.issuedAt))
    } catch { return false }
  }
  async function getStatus(): Promise<LicenseStatus> {
    const state = await options.store.read()
    if (!options.trial) return { edition: 'legacy', status: 'not_required', installationId: state.installationId, recordLimit: null, recordsUsed: 0, recordsRemaining: null, canEnterData: true }
    const activated = activationMatches(state.activationCode, state.installationId)
    const reached = state.recordsUsed >= TRIAL_LIMIT
    return { edition: 'trial', status: !activated ? 'activation_required' : reached ? 'limit_reached' : 'active', installationId: state.installationId, recordLimit: TRIAL_LIMIT, recordsUsed: state.recordsUsed, recordsRemaining: Math.max(0, TRIAL_LIMIT - state.recordsUsed), canEnterData: activated && !reached }
  }
  return {
    getStatus,
    async activate(code: string) {
      const state = await options.store.read()
      if (!activationMatches(code, state.installationId)) throw new LicenseError('INVALID_ACTIVATION', 'Activation code is invalid.')
      if (!(await options.store.activate(state.installationId, code))) throw new LicenseError('ALREADY_ACTIVATED', 'This installation already has an activation.')
      return getStatus()
    },
    async withRecordEntry<T>(operation: () => Promise<T>): Promise<T> {
      const status = await getStatus()
      if (status.edition === 'legacy') return operation()
      if (!status.canEnterData) {
        const activationRequired = status.status === 'activation_required'
        throw new LicenseError(activationRequired ? 'ACTIVATION_REQUIRED' : 'QUOTA_EXHAUSTED', activationRequired ? 'Trial activation is required before creating records.' : 'Trial record creation limit reached.')
      }
      if (!(await options.store.reserve())) throw new LicenseError('QUOTA_EXHAUSTED', 'Trial record creation limit reached.')
      try { return await operation() } catch (error) { await options.store.release(); throw error }
    },
  }
}
export async function readTrialProfile(root = process.cwd()): Promise<{ trial: boolean; publicKey?: string }> {
  let contents: string
  try { contents = await readFile(`${root}/trial-build.json`, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { trial: false }; throw error }
  const marker = JSON.parse(contents) as { edition?: string; recordLimit?: number }
  if (marker.edition !== 'trial' || marker.recordLimit !== TRIAL_LIMIT) throw new Error('Trial build marker is invalid.')
  return { trial: true, publicKey: await readFile(`${root}/trial-public.pem`, 'utf8') }
}

import { createPublicKey, randomUUID, verify } from 'node:crypto'
import type { Pool } from 'pg'
import { readFile } from 'node:fs/promises'
import { DEVICE_ID_PATTERN, resolveDeviceIdentity } from './device-identity.js'

export const TRIAL_LIMIT = 50
export type LicenseStatus = {
  edition: 'legacy' | 'trial' | 'full'
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
  activate(activationCode: string): Promise<void>
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
    async activate(code) {
      const result = await pool.query('UPDATE trial_license_state SET activation_code = $1 WHERE singleton = TRUE', [code])
      if (result.rowCount !== 1) throw new Error('Trial license state has not been initialized; apply migrations first.')
    },
    async reserve() {
      const result = await pool.query('UPDATE trial_license_state SET records_used = records_used + 1 WHERE singleton = TRUE AND records_used < $1', [TRIAL_LIMIT])
      return result.rowCount === 1
    },
    async release() { await pool.query('UPDATE trial_license_state SET records_used = GREATEST(0, records_used - 1) WHERE singleton = TRUE') },
  }
}
export function createMemoryTrialLicenseStore(): TrialLicenseStore {
  const state: TrialState = { installationId: randomUUID(), activationCode: null, recordsUsed: 0 }
  return {
    read: async () => ({ ...state }),
    activate: async (code) => { state.activationCode = code },
    reserve: async () => { if (state.recordsUsed >= TRIAL_LIMIT) return false; state.recordsUsed++; return true },
    release: async () => { state.recordsUsed = Math.max(0, state.recordsUsed - 1) },
  }
}
export function createTrialLicenseService(options: { store: TrialLicenseStore; trial: boolean; publicKey?: string; deviceId?: string }) {
  const key = options.publicKey ? createPublicKey(options.publicKey) : null
  if (options.trial && (!options.deviceId || !DEVICE_ID_PATTERN.test(options.deviceId))) throw new Error('A hardware-derived device identity is required for trial licensing.')
  if (options.trial && key?.asymmetricKeyType !== 'ed25519') throw new Error('Trial licensing requires an Ed25519 public key.')
  function activationMatches(code: string | null): boolean {
    if (!code || !key || !options.trial) return false
    // Untrusted stored/entered tokens confer no entitlement on parse or verification failure.
    try {
      const [payload, signature, extra] = code.split('.')
      if (!payload || !signature || extra !== undefined) return false
      const bytes = Buffer.from(payload, 'base64url')
      if (bytes.toString('base64url') !== payload) return false
      const signatureBytes = Buffer.from(signature, 'base64url')
      if (!signatureBytes.length || signatureBytes.toString('base64url') !== signature || !verify(null, bytes, key, signatureBytes)) return false
      const parsed = JSON.parse(bytes.toString('utf8')) as { version?: unknown; installationId?: unknown; edition?: unknown; recordLimit?: unknown; issuedAt?: unknown } | null
      return parsed !== null && parsed.version === 2 && parsed.installationId === options.deviceId && parsed.edition === 'full' && !Object.hasOwn(parsed, 'recordLimit') && typeof parsed.issuedAt === 'string' && Number.isFinite(Date.parse(parsed.issuedAt))
    } catch { return false }
  }
  async function getStatus(): Promise<LicenseStatus> {
    const state = await options.store.read()
    if (!options.trial) return { edition: 'legacy', status: 'not_required', installationId: state.installationId, recordLimit: null, recordsUsed: 0, recordsRemaining: null, canEnterData: true }
    // The database UUID remains for legacy compatibility, never as a full-license binding.
    const installationId = options.deviceId!
    if (activationMatches(state.activationCode)) return { edition: 'full', status: 'active', installationId, recordLimit: null, recordsUsed: state.recordsUsed, recordsRemaining: null, canEnterData: true }
    const reached = state.recordsUsed >= TRIAL_LIMIT
    return { edition: 'trial', status: reached ? 'limit_reached' : 'active', installationId, recordLimit: TRIAL_LIMIT, recordsUsed: state.recordsUsed, recordsRemaining: Math.max(0, TRIAL_LIMIT - state.recordsUsed), canEnterData: !reached }
  }
  return {
    getStatus,
    async activate(code: string) {
      if (!activationMatches(code)) throw new LicenseError('INVALID_ACTIVATION', 'Activation code is invalid.')
      // Valid full codes replace old/invalid activation and can be reapplied idempotently.
      await options.store.activate(code)
      return getStatus()
    },
    async withRecordEntry<T>(operation: () => Promise<T>): Promise<T> {
      const status = await getStatus()
      if (status.edition !== 'trial') return operation()
      if (!(await options.store.reserve())) {
        // Activation may have committed while this request was waiting for its quota slot.
        if ((await getStatus()).edition === 'full') return operation()
        throw new LicenseError('QUOTA_EXHAUSTED', 'Trial record creation limit reached.')
      }
      try { return await operation() } catch (error) { await options.store.release(); throw error }
    },
  }
}
export async function readTrialProfile(root = process.cwd(), deviceIdentity = resolveDeviceIdentity): Promise<{ trial: boolean; publicKey?: string; deviceId?: string }> {
  let contents: string
  try { contents = await readFile(`${root}/trial-build.json`, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { trial: false }; throw error }
  const marker = JSON.parse(contents) as { edition?: string; recordLimit?: number }
  if (marker.edition !== 'trial' || marker.recordLimit !== TRIAL_LIMIT) throw new Error('Trial build marker is invalid.')
  return { trial: true, publicKey: await readFile(`${root}/trial-public.pem`, 'utf8'), deviceId: await deviceIdentity() }
}

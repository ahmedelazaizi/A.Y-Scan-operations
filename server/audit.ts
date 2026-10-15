import { randomUUID } from 'node:crypto'

export const AUDIT_MAX_LABEL_LENGTH = 100
export const AUDIT_MAX_METADATA_BYTES = 4096
export const AUDIT_MAX_LIST_LIMIT = 100
export const AUDIT_DEFAULT_LIST_LIMIT = 50

const AUDIT_LABEL_PATTERN = /^[a-z][a-z0-9_.:-]{0,99}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_METADATA_KEYS = new Set([
  'status', 'priority', 'modality', 'method', 'source', 'specimenType', 'resultFlag',
  'itemType', 'movementType', 'reasonCode', 'reason', 'orderItemId', 'orderId', 'role', 'authResult', 'errorCode',
  'quantity', 'amount', 'count',
])
const SAFE_METADATA_STRING_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/
const SAFE_METADATA_STRING_KEYS = new Set([...SAFE_METADATA_KEYS].filter((key) => !['quantity', 'amount', 'count'].includes(key)))

type AuditMetadataValue = string | number | boolean | null
export type AuditMetadata = Record<string, AuditMetadataValue>

export type AuditEvent = {
  id: string
  actorId: string | null
  action: string
  entityType: string
  entityId: string | null
  metadata: AuditMetadata
  occurredAt: string
}

export type AuditEventInput = {
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: unknown
  occurredAt?: string
}

export type AuditEventListOptions = {
  limit?: number
  entityType?: string
  action?: string
}

export class AuditValidationError extends Error {
  readonly code = 'invalid_audit_input'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isValidAuditLabel(value: string): boolean {
  return AUDIT_LABEL_PATTERN.test(value)
}

function normalizeLabel(value: string, name: string): string {
  const normalized = value.trim()
  if (!isValidAuditLabel(normalized)) throw new AuditValidationError(`${name} is invalid.`)
  return normalized
}

function sanitizeMetadataValue(key: string, value: unknown): AuditMetadataValue | undefined {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (key === 'reason') return normalized.length >= 1 && normalized.length <= 500 && !/[\\u0000-\\u001f\\u007f]/.test(normalized) ? normalized : undefined
  if (!SAFE_METADATA_STRING_KEYS.has(key)) return undefined
  return SAFE_METADATA_STRING_PATTERN.test(normalized) ? normalized : undefined
}

export function sanitizeAuditMetadata(value: unknown): AuditMetadata {
  if (!isRecord(value)) return {}
  const metadata: AuditMetadata = {}
  for (const key of Object.keys(value).sort()) {
    if (!SAFE_METADATA_KEYS.has(key)) continue
    const sanitizedValue = sanitizeMetadataValue(key, value[key])
    if (sanitizedValue === undefined) continue
    const candidate = { ...metadata, [key]: sanitizedValue }
    if (JSON.stringify(candidate).length <= AUDIT_MAX_METADATA_BYTES) metadata[key] = sanitizedValue
  }
  return metadata
}

function normalizeActorId(actorId: string | null | undefined): string | null {
  if (actorId === undefined || actorId === null) return null
  const normalized = actorId.trim()
  if (!normalized || normalized.length > 200) throw new AuditValidationError('actorId is invalid.')
  return normalized
}

function normalizeEntityId(entityId: string | null | undefined): string | null {
  if (entityId === undefined || entityId === null) return null
  const normalized = entityId.trim()
  if (!UUID_PATTERN.test(normalized)) throw new AuditValidationError('entityId must be a valid UUID.')
  return normalized
}

function normalizeOccurredAt(occurredAt: string | undefined): string {
  if (occurredAt === undefined) return new Date().toISOString()
  const timestamp = new Date(occurredAt)
  if (Number.isNaN(timestamp.getTime())) throw new AuditValidationError('occurredAt is invalid.')
  return timestamp.toISOString()
}

export function normalizeAuditEventInput(input: AuditEventInput): AuditEvent {
  if (!isRecord(input)) throw new AuditValidationError('Audit event input is invalid.')
  return {
    id: randomUUID(),
    actorId: normalizeActorId(input.actorId),
    action: normalizeLabel(input.action, 'action'),
    entityType: normalizeLabel(input.entityType, 'entityType'),
    entityId: normalizeEntityId(input.entityId),
    metadata: sanitizeAuditMetadata(input.metadata),
    occurredAt: normalizeOccurredAt(input.occurredAt),
  }
}

export function normalizeAuditListOptions(options: AuditEventListOptions | undefined): Required<AuditEventListOptions> {
  const limit = options?.limit === undefined ? AUDIT_DEFAULT_LIST_LIMIT : options.limit
  if (!Number.isSafeInteger(limit) || limit < 1) throw new AuditValidationError('limit is invalid.')
  return {
    limit: Math.min(limit, AUDIT_MAX_LIST_LIMIT),
    entityType: options?.entityType === undefined ? '' : normalizeLabel(options.entityType, 'entityType'),
    action: options?.action === undefined ? '' : normalizeLabel(options.action, 'action'),
  }
}

export function cloneAuditEvent(event: AuditEvent): AuditEvent {
  return { ...event, metadata: { ...event.metadata } }
}

import { randomUUID } from 'node:crypto'

export const DEVICE_PROTOCOLS = ['hl7', 'astm', 'tcp_ip', 'serial'] as const
export type DeviceProtocol = (typeof DEVICE_PROTOCOLS)[number]

export const DEVICE_STATUSES = ['configured', 'online', 'offline', 'unknown'] as const
export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

export type LabDevice = {
  id: string
  name: string
  manufacturer: string | null
  model: string | null
  protocol: DeviceProtocol
  endpoint: string
  status: DeviceStatus
  isActive: boolean
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateDeviceInput = {
  name: string
  manufacturer?: string
  model?: string
  protocol: DeviceProtocol
  endpoint: string
  status?: DeviceStatus
  isActive?: boolean
}

export type DeviceConnectionResult = {
  device: LabDevice
  status: DeviceStatus
  adapterConfigured: false
  message: string
  lastCheckedAt: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isDeviceProtocol(value: unknown): value is DeviceProtocol {
  return typeof value === 'string' && (DEVICE_PROTOCOLS as readonly string[]).includes(value)
}

export function isDeviceStatus(value: unknown): value is DeviceStatus {
  return typeof value === 'string' && (DEVICE_STATUSES as readonly string[]).includes(value)
}

export function isDeviceUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isSafeDeviceEndpoint(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const endpoint = value.trim()
  const hasUnsafeCharacter = endpoint.split('').some((character) => {
    const codePoint = character.charCodeAt(0)
    return codePoint < 32 || codePoint === 127 || /\s/u.test(character)
  })
  if (endpoint.length < 1 || endpoint.length > 300 || hasUnsafeCharacter) return false
  if (endpoint.includes('@')) return false
  try {
    const parsed = new URL(endpoint)
    if (parsed.username || parsed.password) return false
  } catch {
    // Serial paths and host:port endpoints are intentionally not URLs.
  }
  return true
}

export function validateCreateDeviceInput(value: unknown): CreateDeviceInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const manufacturer = record.manufacturer === undefined || record.manufacturer === null
    ? undefined
    : typeof record.manufacturer === 'string' ? record.manufacturer.trim() : null
  const model = record.model === undefined || record.model === null
    ? undefined
    : typeof record.model === 'string' ? record.model.trim() : null
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint.trim() : ''
  const protocol = record.protocol
  const status = record.status === undefined ? undefined : record.status
  const isActive = record.isActive === undefined ? undefined : record.isActive
  if (!name || name.length > 200 || manufacturer === null || model === null ||
      (manufacturer !== undefined && (!manufacturer || manufacturer.length > 200)) ||
      (model !== undefined && (!model || model.length > 200)) ||
      !isDeviceProtocol(protocol) || !isSafeDeviceEndpoint(endpoint) ||
      (status !== undefined && !isDeviceStatus(status)) ||
      (isActive !== undefined && typeof isActive !== 'boolean')) return null
  return {
    name,
    ...(manufacturer ? { manufacturer } : {}),
    ...(model ? { model } : {}),
    protocol,
    endpoint,
    ...(status ? { status } : {}),
    ...(isActive === undefined ? {} : { isActive }),
  }
}

export function cloneDevice(device: LabDevice): LabDevice {
  return { ...device }
}

export function createDeviceRecord(input: CreateDeviceInput): LabDevice {
  const timestamp = new Date().toISOString()
  return {
    id: randomUUID(),
    name: input.name,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    protocol: input.protocol,
    endpoint: input.endpoint,
    status: input.status ?? 'unknown',
    isActive: input.isActive ?? true,
    lastSeenAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function checkDeviceConnection(device: LabDevice): DeviceConnectionResult {
  return {
    device: cloneDevice(device),
    status: device.status,
    adapterConfigured: false,
    message: 'Actual device adapter is not configured; configure an approved adapter before attempting a connection.',
    lastCheckedAt: new Date().toISOString(),
  }
}

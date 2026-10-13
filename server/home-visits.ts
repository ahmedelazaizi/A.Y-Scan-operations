export type HomeVisitStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'

export type HomeVisit = {
  id: string
  patientId: string
  orderId: string | null
  address: string
  contactPhone: string
  scheduledAt: string
  assignedTo: string | null
  status: HomeVisitStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type CreateHomeVisitInput = {
  patientId: string
  orderId?: string | null
  address: string
  contactPhone: string
  scheduledAt: string
  assignedTo?: string | null
  notes?: string | null
}

export type HomeVisitTransitionInput = { status: HomeVisitStatus }

export const HOME_VISIT_STATUSES: readonly HomeVisitStatus[] = [
  'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled',
]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_ORDER_PATTERN = /^AY-\d+$/
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= maximum
}

function optionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === undefined || value === null) return value
  return boundedText(value, maximum) ? value.trim() : null
}

export function isHomeVisitUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isHomeVisitStatus(value: unknown): value is HomeVisitStatus {
  return typeof value === 'string' && HOME_VISIT_STATUSES.includes(value as HomeVisitStatus)
}

export function isHomeVisitOrderId(value: unknown): value is string {
  return typeof value === 'string' && (PUBLIC_ORDER_PATTERN.test(value) || UUID_PATTERN.test(value))
}

export function normalizeHomeVisitDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const dateParts = CALENDAR_DATE_PATTERN.exec(value)
  if (!dateParts) return null
  const calendarDate = new Date(`${dateParts[1]}-${dateParts[2]}-${dateParts[3]}T00:00:00.000Z`)
  if (Number.isNaN(calendarDate.getTime()) || !calendarDate.toISOString().startsWith(`${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`)) return null
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

export function validateCreateHomeVisitInput(value: unknown): CreateHomeVisitInput | null {
  if (!isRecord(value) || !isHomeVisitUuid(value.patientId)) return null
  const orderId = value.orderId === undefined || value.orderId === null ? null : value.orderId
  const assignedTo = optionalText(value.assignedTo, 200)
  const notes = optionalText(value.notes, 1000)
  const scheduledAt = normalizeHomeVisitDate(value.scheduledAt)
  const assignedToInvalid = value.assignedTo !== undefined && value.assignedTo !== null && assignedTo === null
  const notesInvalid = value.notes !== undefined && value.notes !== null && notes === null
  if ((orderId !== null && !isHomeVisitOrderId(orderId)) || !boundedText(value.address, 500)) return null
  if (!boundedText(value.contactPhone, 50) || scheduledAt === null || assignedToInvalid || notesInvalid) return null
  return {
    patientId: value.patientId,
    orderId,
    address: value.address.trim(),
    contactPhone: value.contactPhone.trim(),
    scheduledAt,
    ...(assignedTo === undefined ? {} : { assignedTo }),
    ...(notes === undefined ? {} : { notes }),
  }
}

export function validateHomeVisitTransitionInput(value: unknown): HomeVisitTransitionInput | null {
  if (!isRecord(value) || !isHomeVisitStatus(value.status)) return null
  return { status: value.status }
}

export function canTransitionHomeVisit(current: HomeVisitStatus, next: HomeVisitStatus): boolean {
  return current === 'scheduled' && (next === 'confirmed' || next === 'cancelled')
    || current === 'confirmed' && (next === 'in_progress' || next === 'cancelled')
    || current === 'in_progress' && (next === 'completed' || next === 'cancelled')
}

export function cloneHomeVisit(visit: HomeVisit): HomeVisit {
  return { ...visit }
}

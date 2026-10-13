import type { CreateOrderInput, CreatePatientInput, OrderPriority, PatientSex, ResultFlag, SpecimenStatus } from './domain.js'
import { isPaymentMethod, type InvoiceItemInput, type PaymentMethod } from './billing.js'
import { isRadiologyModality, isRadiologyPriority, type RadiologyModality, type RadiologyPriority } from './radiology.js'
import {
  isInventoryAdjustmentDirection,
  isInventoryMovementType,
  validateInventoryItemInput,
  validateInventoryMovementInput,
  type InventoryAdjustmentDirection,
  type InventoryMovementType,
} from './inventory.js'
import { RepositoryInputError } from './storage/repository.js'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export type CreateSpecimenInput = { orderId: string; specimenType: string; barcode: string }
export type EnterResultInput = { orderItemId: string; value: string; unit?: string; referenceRange?: string; flag: ResultFlag }
export type CreateInvoiceInput = { orderId: string; items: InvoiceItemInput[]; discount: number; tax: number }
export type RecordPaymentInput = { amount: number; method: PaymentMethod; reference?: string }
export type CreateRadiologyStudyInput = {
  patientId: string
  modality: RadiologyModality
  bodyPart: string
  priority: RadiologyPriority
  scheduledAt?: string
  referringProvider?: string
}
export type ReportRadiologyStudyInput = { reportText: string; impression: string }
export type CreateInventoryItemInput = { sku: string; name: string; category: string; unit: string; reorderLevel: number }
export type RecordInventoryMovementInput = {
  type: InventoryMovementType
  quantity: number
  reason: string
  reference?: string
  adjustmentDirection?: InventoryAdjustmentDirection
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function isPriority(value: unknown): value is OrderPriority {
  return value === 'normal' || value === 'urgent'
}

export function isSex(value: unknown): value is PatientSex {
  return value === 'female' || value === 'male' || value === 'other' || value === 'unknown'
}

export function isSpecimenStatus(value: string): value is SpecimenStatus {
  return ['pending', 'collected', 'received', 'processing', 'rejected', 'completed'].includes(value)
}

export function isResultFlag(value: unknown): value is ResultFlag {
  return ['normal', 'low', 'high', 'critical', 'not_applicable'].includes(value as string)
}

export function validateText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= maximum ? text : null
}

export function validateOptionalText(value: unknown, maximum: number): string | undefined | null {
  if (value === undefined || value === null) return undefined
  return validateText(value, maximum)
}

export function isValidDateOfBirth(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validatePatientInput(value: unknown): CreatePatientInput | null {
  if (!isRecord(value) || typeof value.fullName !== 'string') return null
  const fullName = value.fullName.trim()
  if (!fullName || fullName.length > 200) return null

  const phone = value.phone === undefined ? undefined : typeof value.phone === 'string' ? value.phone.trim() : null
  const dateOfBirth = value.dateOfBirth === undefined ? undefined : value.dateOfBirth
  const sex = value.sex === undefined ? undefined : value.sex
  if (phone === null || (phone !== undefined && !phone)) return null
  if (dateOfBirth !== undefined && (typeof dateOfBirth !== 'string' || !isValidDateOfBirth(dateOfBirth))) return null
  if (sex !== undefined && !isSex(sex)) return null

  return {
    fullName,
    ...(phone ? { phone } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(sex ? { sex } : {}),
  }
}

export function validateOrderInput(value: unknown): CreateOrderInput | null {
  if (!isRecord(value)) return null
  const patientName = value.patientName === undefined
    ? undefined
    : typeof value.patientName === 'string' ? value.patientName.trim() : null
  const patientId = value.patientId === undefined
    ? undefined
    : typeof value.patientId === 'string' ? value.patientId.trim() : null
  const tests = Array.isArray(value.tests) && value.tests.every((test) => typeof test === 'string' && test.trim())
    ? value.tests.map((test) => test.trim())
    : []
  const priority = value.priority === undefined ? 'normal' : value.priority
  if (patientName === null || patientId === null || (patientId && !isUuid(patientId))) return null
  if ((!patientName && !patientId) || tests.length === 0 || !isPriority(priority)) return null
  return {
    ...(patientId ? { patientId } : {}),
    ...(patientName ? { patientName } : {}),
    tests,
    priority,
  }
}

export function validateSpecimenInput(value: unknown): CreateSpecimenInput | null {
  if (!isRecord(value)) return null
  const orderId = validateText(value.orderId, 100)
  const specimenType = validateText(value.specimenType, 100)
  const barcode = validateText(value.barcode, 100)
  if (!orderId || !specimenType || !barcode) return null
  return { orderId, specimenType, barcode }
}

export function validateResultInput(value: unknown): EnterResultInput | null {
  if (!isRecord(value)) return null
  const orderItemId = validateText(value.orderItemId, 100)
  const resultValue = validateText(value.value, 2000)
  const unit = validateOptionalText(value.unit, 100)
  const referenceRange = validateOptionalText(value.referenceRange, 200)
  const flag = value.flag
  if (!orderItemId || !resultValue || unit === null || referenceRange === null || !isResultFlag(flag)) return null
  return { orderItemId, value: resultValue, unit: unit ?? undefined, referenceRange: referenceRange ?? undefined, flag }
}

export function validateNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function validatePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function validateInvoiceInput(value: unknown): CreateInvoiceInput | null {
  if (!isRecord(value) || !validateText(value.orderId, 100) || !Array.isArray(value.items) || value.items.length === 0) return null
  const items: InvoiceItemInput[] = []
  for (const item of value.items) {
    if (!isRecord(item)) return null
    const description = validateText(item.description, 500)
    if (!description || !validatePositiveNumber(item.quantity) || !validateNonNegativeNumber(item.unitPrice)) return null
    items.push({ description, quantity: item.quantity, unitPrice: item.unitPrice })
  }
  const discount = value.discount === undefined ? 0 : value.discount
  const tax = value.tax === undefined ? 0 : value.tax
  if (!validateNonNegativeNumber(discount) || !validateNonNegativeNumber(tax)) return null
  return { orderId: value.orderId as string, items, discount, tax }
}

export function validatePaymentInput(value: unknown): RecordPaymentInput | null {
  if (!isRecord(value) || !validatePositiveNumber(value.amount) || !isPaymentMethod(value.method)) return null
  const reference = validateOptionalText(value.reference, 200)
  if (reference === null) return null
  return { amount: value.amount, method: value.method, ...(reference ? { reference } : {}) }
}

export function isValidDateTime(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

export function validateRadiologyStudyInput(value: unknown): CreateRadiologyStudyInput | null {
  if (!isRecord(value) || typeof value.patientId !== 'string' || !isUuid(value.patientId.trim())) return null
  const modality = value.modality
  const bodyPart = validateText(value.bodyPart, 200)
  const priority = value.priority === undefined ? 'normal' : value.priority
  const scheduledAt = value.scheduledAt === undefined ? undefined : value.scheduledAt
  const referringProvider = validateOptionalText(value.referringProvider, 200)
  if (!isRadiologyModality(modality) || !bodyPart || !isRadiologyPriority(priority) || referringProvider === null) return null
  if (scheduledAt !== undefined && (typeof scheduledAt !== 'string' || !isValidDateTime(scheduledAt))) return null
  return {
    patientId: value.patientId.trim(), modality, bodyPart, priority,
    ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    ...(referringProvider ? { referringProvider } : {}),
  }
}

export function validateRadiologyReportInput(value: unknown): ReportRadiologyStudyInput | null {
  if (!isRecord(value)) return null
  const reportText = validateText(value.reportText, 20000)
  const impression = validateText(value.impression, 10000)
  return reportText && impression ? { reportText, impression } : null
}

export function validateCreateInventoryItemInput(value: unknown): CreateInventoryItemInput | null {
  if (!isRecord(value)) return null
  try {
    return validateInventoryItemInput(value.sku, value.name, value.category, value.unit, value.reorderLevel)
  } catch (error) {
    if (error instanceof RepositoryInputError) return null
    throw error
  }
}

export function validateRecordInventoryMovementInput(value: unknown): RecordInventoryMovementInput | null {
  if (!isRecord(value) || !isInventoryMovementType(value.type)) return null
  const adjustmentDirection = value.adjustmentDirection
  if (adjustmentDirection !== undefined && adjustmentDirection !== null && !isInventoryAdjustmentDirection(adjustmentDirection)) return null
  try {
    return validateInventoryMovementInput(value.type, value.quantity, value.reason, value.reference, adjustmentDirection)
  } catch (error) {
    if (error instanceof RepositoryInputError) return null
    throw error
  }
}

export function parsePageValue(value: string | null, fallback: number, maximum?: number): number {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback
  return maximum === undefined ? parsed : Math.min(parsed, maximum)
}

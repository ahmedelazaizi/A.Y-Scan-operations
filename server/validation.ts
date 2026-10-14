import type { CatalogTestInput, CatalogTestUpdate, CreateOrderInput, CreatePatientInput, CreateReceptionOrderInput, OrderPriority, PatientSex, ResultFlag, SpecimenStatus } from './domain.js'
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
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, RepositoryInputError, type PageOptions } from './storage/repository.js'

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

const MAX_TESTS_PER_ORDER = 50

export function validateOrderInput(value: unknown): CreateOrderInput | null {
  if (!isRecord(value) || typeof value.patientId !== 'string' || !isUuid(value.patientId.trim())) return null
  if (!Array.isArray(value.testIds) || value.testIds.length === 0 || value.testIds.length > MAX_TESTS_PER_ORDER) return null
  if (!value.testIds.every((id): id is string => typeof id === 'string' && isUuid(id))) return null
  if (new Set(value.testIds).size !== value.testIds.length) return null
  const priority = value.priority === undefined ? 'normal' : value.priority
  if (!isPriority(priority)) return null
  return { patientId: value.patientId.trim(), testIds: value.testIds, priority }
}

export function validateReceptionOrderInput(value: unknown): Omit<CreateReceptionOrderInput, 'actor'> | null {
  if (!isRecord(value) || !Array.isArray(value.testIds) || typeof value.patientId !== 'string' || !isUuid(value.patientId.trim())) return null
  const priority = value.priority === undefined ? 'normal' : value.priority
  if (!isPriority(priority)) return null
  const tests = value.testIds
  if (tests.length > MAX_TESTS_PER_ORDER || !tests.every((id) => typeof id === 'string' && isUuid(id)) || new Set(tests).size !== tests.length) return null
  const legacy: CreateOrderInput = { patientId: value.patientId.trim(), testIds: tests as string[], priority }
  const ids = (field: unknown): field is string[] => field === undefined || (Array.isArray(field) && field.length <= MAX_TESTS_PER_ORDER && field.every((id) => typeof id === 'string' && isUuid(id)) && new Set(field).size === field.length)
  if (!ids(value.bundleIds) || (value.practitionerId !== undefined && (typeof value.practitionerId !== 'string' || !isUuid(value.practitionerId)))) return null
  const bundleIds = (value.bundleIds as string[] | undefined) ?? []
  if (legacy.testIds.length + bundleIds.length === 0 || legacy.testIds.length + bundleIds.length > MAX_TESTS_PER_ORDER) return null
  if (value.fasting !== undefined && typeof value.fasting !== 'boolean') return null
  const text = validateOptionalText(value.diagnosis, 2000)
  const company = validateOptionalText(value.insuranceCompany, 200)
  const reference = validateOptionalText(value.paymentReference, 200)
  if (text === null || company === null || reference === null) return null
  const integer = (n: unknown) => n === undefined || (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 999_999_999_999)
  if (!integer(value.discountPiastres) || !integer(value.insuranceCoveragePiastres) || !integer(value.initialPaymentPiastres)) return null
  if (value.paymentMethod !== undefined && !['cash', 'card', 'bank_transfer'].includes(String(value.paymentMethod))) return null
  return { ...legacy, bundleIds, practitionerId: value.practitionerId as string | undefined, fasting: value.fasting as boolean | undefined, diagnosis: text ?? undefined, discountPiastres: value.discountPiastres as number | undefined, insuranceCoveragePiastres: value.insuranceCoveragePiastres as number | undefined, insuranceCompany: company ?? undefined, initialPaymentPiastres: value.initialPaymentPiastres as number | undefined, paymentMethod: value.paymentMethod as CreateReceptionOrderInput['paymentMethod'], paymentReference: reference ?? undefined }
}

const CATALOG_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/

function validateCatalogPrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null
}

export function validateCatalogTestInput(value: unknown): CatalogTestInput | null {
  if (!isRecord(value)) return null
  const code = typeof value.code === 'string' ? value.code.trim().toUpperCase() : ''
  const name = validateText(value.name, 200)
  const specimenType = validateText(value.specimenType, 100)
  const price = validateCatalogPrice(value.price)
  const isActive = value.isActive === undefined ? true : value.isActive
  if (!CATALOG_CODE_PATTERN.test(code) || !name || !specimenType || price === null || typeof isActive !== 'boolean') return null
  return { code, name, specimenType, price, isActive }
}

export function validateCatalogTestUpdate(value: unknown): CatalogTestUpdate | null {
  if (!isRecord(value)) return null
  const update: CatalogTestUpdate = {}
  if (value.name !== undefined) {
    const name = validateText(value.name, 200)
    if (!name) return null
    update.name = name
  }
  if (value.specimenType !== undefined) {
    const specimenType = validateText(value.specimenType, 100)
    if (!specimenType) return null
    update.specimenType = specimenType
  }
  if (value.price !== undefined) {
    const price = validateCatalogPrice(value.price)
    if (price === null) return null
    update.price = price
  }
  if (value.isActive !== undefined) {
    if (typeof value.isActive !== 'boolean') return null
    update.isActive = value.isActive
  }
  return Object.keys(update).length > 0 ? update : null
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

/** Reads ?limit=&offset= for list endpoints; limit is clamped to MAX_LIST_LIMIT. */
export function parseListPage(query: URLSearchParams): PageOptions {
  return {
    limit: parsePageValue(query.get('limit'), DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT) || DEFAULT_LIST_LIMIT,
    offset: parsePageValue(query.get('offset'), 0),
  }
}

export function parsePageValue(value: string | null, fallback: number, maximum?: number): number {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback
  return maximum === undefined ? parsed : Math.min(parsed, maximum)
}

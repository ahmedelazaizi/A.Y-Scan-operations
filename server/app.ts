import type { IncomingMessage, ServerResponse } from 'node:http'
import { AuditValidationError, isValidAuditLabel, type AuditEventInput } from './audit.js'
import {
  authenticateRequest,
  createLoginSession,
  isAuthRequired,
  isAuthenticationConfigured,
  parseLoginCredentials,
  sendUnauthorized,
} from './auth.js'
import {
  mockRepository,
  type CreateOrderInput,
  type CreatePatientInput,
  type OrderPriority,
  type PatientSex,
  type ResultFlag,
  type SpecimenStatus,
} from './domain.js'
import { isInvoiceStatus, isPaymentMethod, type InvoiceItemInput, type PaymentMethod } from './billing.js'
import { isRadiologyModality, isRadiologyPriority, isRadiologyStudyStatus, type RadiologyModality, type RadiologyPriority } from './radiology.js'
import { isInventoryAdjustmentDirection, isInventoryMovementType, validateInventoryItemInput, validateInventoryMovementInput, type InventoryAdjustmentDirection, type InventoryMovementType } from './inventory.js'
import {
  isInsuranceClaimStatus,
  isInsuranceUuid,
  validateInsuranceClaimInput,
  validateInsurancePolicyInput,
  validateInsuranceTransitionInput,
  type InsuranceClaimInput,
  type InsurancePolicyInput,
  type InsuranceTransitionInput,
} from './insurance.js'
import {
  isHomeVisitStatus,
  isHomeVisitUuid,
  validateCreateHomeVisitInput,
  validateHomeVisitTransitionInput,
} from './home-visits.js'
import {
  RepositoryConflictError,
  RepositoryInputError,
  RepositoryNotFoundError,
  type OrderRepository,
  type RepositoryValue,
} from './storage/repository.js'
import { applyCors, readBody, sendBadRequest, sendJson, sendMethodNotAllowed, sendNotFound } from './http.js'

const SERVICE_NAME = 'ay-scan-api'
const ORDER_PATH = '/api/orders'
const PATIENTS_PATH = '/api/patients'
const CATALOG_PATH = '/api/catalog'
const SPECIMENS_PATH = '/api/specimens'
const RESULTS_PATH = '/api/results'
const BILLING_PATH = '/api/billing'
const BILLING_INVOICES_PATH = `${BILLING_PATH}/invoices`
const RADIOLOGY_PATH = '/api/radiology'
const RADIOLOGY_STUDIES_PATH = `${RADIOLOGY_PATH}/studies`
const INVENTORY_PATH = '/api/inventory'
const INVENTORY_ITEMS_PATH = `${INVENTORY_PATH}/items`
const AUDIT_EVENTS_PATH = '/api/audit-events'
const INSURANCE_PATH = '/api/insurance'
const INSURANCE_POLICIES_PATH = `${INSURANCE_PATH}/policies`
const INSURANCE_CLAIMS_PATH = `${INSURANCE_PATH}/claims`
const HOME_VISITS_PATH = '/api/home-visits'
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void

type AuditedResponseInput = {
  request: IncomingMessage
  response: ServerResponse
  repository: OrderRepository
  statusCode: number
  payload: unknown
  event: Omit<AuditEventInput, 'actorId'>
}

type CreateSpecimenInput = { orderId: string; specimenType: string; barcode: string }
type EnterResultInput = { orderItemId: string; value: string; unit?: string; referenceRange?: string; flag: ResultFlag }
type CreateInvoiceInput = { orderId: string; items: InvoiceItemInput[]; discount: number; tax: number }
type RecordPaymentInput = { amount: number; method: PaymentMethod; reference?: string }
type CreateRadiologyStudyInput = {
  patientId: string
  modality: RadiologyModality
  bodyPart: string
  priority: RadiologyPriority
  scheduledAt?: string
  referringProvider?: string
}
type ReportRadiologyStudyInput = { reportText: string; impression: string }
type CreateInventoryItemInput = { sku: string; name: string; category: string; unit: string; reorderLevel: number }
type RecordInventoryMovementInput = {
  type: InventoryMovementType
  quantity: number
  reason: string
  reference?: string
  adjustmentDirection?: InventoryAdjustmentDirection
}
type CreateInsurancePolicyInput = InsurancePolicyInput
type CreateInsuranceClaimInput = InsuranceClaimInput
type TransitionInsuranceClaimInput = InsuranceTransitionInput

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isPriority(value: unknown): value is OrderPriority {
  return value === 'normal' || value === 'urgent'
}

function isSex(value: unknown): value is PatientSex {
  return value === 'female' || value === 'male' || value === 'other' || value === 'unknown'
}

function isSpecimenStatus(value: string): value is SpecimenStatus {
  return ['pending', 'collected', 'received', 'processing', 'rejected', 'completed'].includes(value)
}

function isResultFlag(value: unknown): value is ResultFlag {
  return ['normal', 'low', 'high', 'critical', 'not_applicable'].includes(value as string)
}

function validateText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= maximum ? text : null
}

function validateOptionalText(value: unknown, maximum: number): string | undefined | null {
  if (value === undefined || value === null) return undefined
  return validateText(value, maximum)
}

function isValidDateOfBirth(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function validatePatientInput(value: unknown): CreatePatientInput | null {
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

function validateOrderInput(value: unknown): CreateOrderInput | null {
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

function validateSpecimenInput(value: unknown): CreateSpecimenInput | null {
  if (!isRecord(value)) return null
  const orderId = validateText(value.orderId, 100)
  const specimenType = validateText(value.specimenType, 100)
  const barcode = validateText(value.barcode, 100)
  if (!orderId || !specimenType || !barcode) return null
  return { orderId, specimenType, barcode }
}

function validateResultInput(value: unknown): EnterResultInput | null {
  if (!isRecord(value)) return null
  const orderItemId = validateText(value.orderItemId, 100)
  const resultValue = validateText(value.value, 2000)
  const unit = validateOptionalText(value.unit, 100)
  const referenceRange = validateOptionalText(value.referenceRange, 200)
  const flag = value.flag
  if (!orderItemId || !resultValue || unit === null || referenceRange === null || !isResultFlag(flag)) return null
  return { orderItemId, value: resultValue, unit: unit ?? undefined, referenceRange: referenceRange ?? undefined, flag }
}

function validateNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validatePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function validateInvoiceInput(value: unknown): CreateInvoiceInput | null {
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

function validatePaymentInput(value: unknown): RecordPaymentInput | null {
  if (!isRecord(value) || !validatePositiveNumber(value.amount) || !isPaymentMethod(value.method)) return null
  const reference = validateOptionalText(value.reference, 200)
  if (reference === null) return null
  return { amount: value.amount, method: value.method, ...(reference ? { reference } : {}) }
}

function isValidDateTime(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

function validateRadiologyStudyInput(value: unknown): CreateRadiologyStudyInput | null {
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

function validateRadiologyReportInput(value: unknown): ReportRadiologyStudyInput | null {
  if (!isRecord(value)) return null
  const reportText = validateText(value.reportText, 20000)
  const impression = validateText(value.impression, 10000)
  return reportText && impression ? { reportText, impression } : null
}

function validateCreateInventoryItemInput(value: unknown): CreateInventoryItemInput | null {
  if (!isRecord(value)) return null
  try {
    return validateInventoryItemInput(value.sku, value.name, value.category, value.unit, value.reorderLevel)
  } catch (error) {
    if (error instanceof RepositoryInputError) return null
    throw error
  }
}

function validateRecordInventoryMovementInput(value: unknown): RecordInventoryMovementInput | null {
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

function validateCreateInsurancePolicyInput(value: unknown): CreateInsurancePolicyInput | null {
  return validateInsurancePolicyInput(value)
}

function validateCreateInsuranceClaimInput(value: unknown): CreateInsuranceClaimInput | null {
  return validateInsuranceClaimInput(value)
}

function validateTransitionInsuranceClaimInput(value: unknown): TransitionInsuranceClaimInput | null {
  return validateInsuranceTransitionInput(value)
}

function parsePageValue(value: string | null, fallback: number, maximum?: number): number {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback
  return maximum === undefined ? parsed : Math.min(parsed, maximum)
}

function auditActorId(request: IncomingMessage): string {
  return authenticateRequest(request)?.id ?? 'system'
}

async function recordAuditSafely(repository: OrderRepository, event: AuditEventInput): Promise<void> {
  try {
    await repository.recordAuditEvent(event)
  } catch {
    console.warn('Audit event recording failed; business response preserved.')
  }
}

async function sendAuditedResponse(input: AuditedResponseInput): Promise<void> {
  await recordAuditSafely(input.repository, { ...input.event, actorId: auditActorId(input.request) })
  sendJson(input.response, input.statusCode, input.payload)
}

async function createPatient(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(await readBody(request))
  } catch {
    sendBadRequest(response, 'Body must be valid JSON.')
    return
  }
  const input = validatePatientInput(parsedBody)
  if (!input) {
    sendBadRequest(response, 'fullName, dateOfBirth, and sex are invalid.')
    return
  }
  try {
    const patient = await repository.createPatient(input)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: patient,
      event: { action: 'patient.created', entityType: 'patient', entityId: patient.id },
    })
  } catch {
    sendJson(response, 503, { error: 'Service Unavailable' })
  }
}

async function createOrder(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(await readBody(request))
  } catch {
    sendBadRequest(response, 'Body must be valid JSON.')
    return
  }
  const input = validateOrderInput(parsedBody)
  if (!input) {
    sendBadRequest(response, 'patientName, tests, and priority are invalid.')
    return
  }
  try {
    if (input.patientId && !(await repository.getPatientById(input.patientId))) {
      sendBadRequest(response, 'patientId does not reference an existing patient.')
      return
    }
    const order = await repository.createOrder(input)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: order,
      event: { action: 'order.created', entityType: 'order', entityId: isUuid(order.id) ? order.id : null, metadata: { priority: order.priority ?? 'normal' } },
    })
  } catch {
    sendJson(response, 503, { error: 'Service Unavailable' })
  }
}

function sendRepositoryError(response: ServerResponse, error: unknown): void {
  if (error instanceof AuditValidationError || error instanceof RepositoryInputError) {
    sendBadRequest(response, error.message)
    return
  }
  if (error instanceof RepositoryNotFoundError) {
    sendJson(response, 404, { error: 'Not Found', message: error.message })
    return
  }
  if (error instanceof RepositoryConflictError) {
    sendJson(response, 409, { error: 'Conflict', message: error.message })
    return
  }
  sendJson(response, 503, { error: 'Service Unavailable' })
}

async function createSpecimen(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateSpecimenInput(parsedBody)
  if (!input) { sendBadRequest(response, 'orderId, specimenType, and barcode are invalid.'); return }
  try {
    const specimen = await repository.createSpecimen(input.orderId, input.specimenType, input.barcode)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: specimen,
      event: { action: 'specimen.created', entityType: 'specimen', entityId: specimen.id, metadata: { specimenType: specimen.specimenType } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function collectSpecimen(request: IncomingMessage, barcode: string, response: ServerResponse, repository: OrderRepository): Promise<void> {
  try {
    const specimen = await repository.collectSpecimen(barcode)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: specimen,
      event: { action: 'specimen.collected', entityType: 'specimen', entityId: specimen.id, metadata: { status: specimen.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createResult(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateResultInput(parsedBody)
  if (!input) { sendBadRequest(response, 'orderItemId, value, and flag are invalid.'); return }
  try {
    const labResult = await repository.enterResult(input.orderItemId, input.value, input.unit, input.referenceRange, input.flag)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: labResult,
      event: { action: 'result.created', entityType: 'result', entityId: labResult.id, metadata: { resultFlag: labResult.flag, status: labResult.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function reviewResult(request: IncomingMessage, id: string, response: ServerResponse, repository: OrderRepository): Promise<void> {
  try {
    const labResult = await repository.reviewResult(id)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: labResult,
      event: { action: 'result.reviewed', entityType: 'result', entityId: labResult.id, metadata: { status: labResult.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createInvoice(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateInvoiceInput(parsedBody)
  if (!input) { sendBadRequest(response, 'orderId, items, discount, and tax are invalid.'); return }
  try {
    const invoice = await repository.createInvoice(input.orderId, input.items, input.discount, input.tax)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: invoice,
      event: { action: 'invoice.created', entityType: 'invoice', entityId: invoice.id, metadata: { status: invoice.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function recordPayment(request: IncomingMessage, response: ServerResponse, invoiceId: string, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validatePaymentInput(parsedBody)
  if (!input) { sendBadRequest(response, 'amount, method, and reference are invalid.'); return }
  try {
    const invoice = await repository.recordPayment(invoiceId, input.amount, input.method, input.reference)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: invoice,
      event: { action: 'payment.recorded', entityType: 'invoice', entityId: invoice.id, metadata: { method: input.method, status: invoice.status, amount: input.amount } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createRadiologyStudy(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateRadiologyStudyInput(parsedBody)
  if (!input) { sendBadRequest(response, 'patientId, modality, bodyPart, priority, scheduledAt, and referringProvider are invalid.'); return }
  try {
    const study = await repository.createRadiologyStudy(input.patientId, input.modality, input.bodyPart, input.priority, input.scheduledAt, input.referringProvider)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: study,
      event: { action: 'radiology.created', entityType: 'radiology', entityId: study.id, metadata: { modality: study.modality, priority: study.priority } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function startRadiologyStudy(request: IncomingMessage, id: string, response: ServerResponse, repository: OrderRepository): Promise<void> {
  try {
    const study = await repository.startRadiologyStudy(id)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: study,
      event: { action: 'radiology.started', entityType: 'radiology', entityId: study.id, metadata: { status: study.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function reportRadiologyStudy(request: IncomingMessage, response: ServerResponse, id: string, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateRadiologyReportInput(parsedBody)
  if (!input) { sendBadRequest(response, 'reportText and impression are required.'); return }
  try {
    const study = await repository.reportRadiologyStudy(id, input.reportText, input.impression)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: study,
      event: { action: 'radiology.reported', entityType: 'radiology', entityId: study.id, metadata: { status: study.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function verifyRadiologyStudy(request: IncomingMessage, id: string, response: ServerResponse, repository: OrderRepository): Promise<void> {
  try {
    const study = await repository.verifyRadiologyStudy(id)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: study,
      event: { action: 'radiology.verified', entityType: 'radiology', entityId: study.id, metadata: { status: study.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createInventoryItem(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateCreateInventoryItemInput(parsedBody)
  if (!input) { sendBadRequest(response, 'sku, name, category, unit, and reorderLevel are invalid.'); return }
  try {
    const item = await repository.createInventoryItem(input.sku, input.name, input.category, input.unit, input.reorderLevel)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: item,
      event: { action: 'inventory.item_created', entityType: 'inventory_item', entityId: item.id },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function recordInventoryMovement(
  request: IncomingMessage,
  response: ServerResponse,
  itemId: string,
  repository: OrderRepository,
): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateRecordInventoryMovementInput(parsedBody)
  if (!input) { sendBadRequest(response, 'type, quantity, reason, reference, and adjustmentDirection are invalid.'); return }
  try {
    const movement = await repository.recordInventoryMovement(
      itemId, input.type, input.quantity, input.reason, input.reference, input.adjustmentDirection, authenticateRequest(request)?.id,
    )
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: movement,
      event: { action: 'inventory.movement_recorded', entityType: 'inventory_movement', entityId: movement.movement.id, metadata: { movementType: movement.movement.type, quantity: movement.movement.quantity } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createInsurancePolicy(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateCreateInsurancePolicyInput(parsedBody)
  if (!input) { sendBadRequest(response, 'patientId, payerName, memberNumber, planName, coveragePercent, validFrom, and validTo are invalid.'); return }
  try {
    const policy = await repository.createInsurancePolicy(input.patientId, input.payerName, input.memberNumber, input.planName, input.coveragePercent, input.validFrom, input.validTo ?? undefined)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: policy,
      event: { action: 'insurance.policy_created', entityType: 'insurance_policy', entityId: policy.id },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createInsuranceClaim(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateCreateInsuranceClaimInput(parsedBody)
  if (!input) { sendBadRequest(response, 'policyId, orderId, and amount are invalid.'); return }
  try {
    const claim = await repository.createInsuranceClaim(input.policyId, input.orderId ?? undefined, input.amount)
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: claim,
      event: { action: 'insurance.claim_created', entityType: 'insurance_claim', entityId: claim.id, metadata: { status: claim.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function transitionInsuranceClaim(request: IncomingMessage, response: ServerResponse, id: string, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateTransitionInsuranceClaimInput(parsedBody)
  if (!input) { sendBadRequest(response, 'status is invalid.'); return }
  try {
    const claim = await repository.transitionInsuranceClaim(id, input.status)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: claim,
      event: { action: 'insurance.claim_transitioned', entityType: 'insurance_claim', entityId: claim.id, metadata: { status: claim.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function createHomeVisit(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateCreateHomeVisitInput(parsedBody)
  if (!input) { sendBadRequest(response, 'patientId, orderId, address, contactPhone, scheduledAt, assignedTo, and notes are invalid.'); return }
  try {
    const visit = await repository.createHomeVisit(
      input.patientId, input.orderId ?? undefined, input.address, input.contactPhone, input.scheduledAt,
      input.assignedTo ?? undefined, input.notes ?? undefined,
    )
    await sendAuditedResponse({
      request, response, repository, statusCode: 201, payload: visit,
      event: { action: 'home_visit.created', entityType: 'home_visit', entityId: visit.id, metadata: { status: visit.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

async function transitionHomeVisit(request: IncomingMessage, response: ServerResponse, id: string, repository: OrderRepository): Promise<void> {
  let parsedBody: unknown
  try { parsedBody = JSON.parse(await readBody(request)) } catch { sendBadRequest(response, 'Body must be valid JSON.'); return }
  const input = validateHomeVisitTransitionInput(parsedBody)
  if (!input) { sendBadRequest(response, 'status is invalid.'); return }
  try {
    const visit = await repository.transitionHomeVisit(id, input.status)
    await sendAuditedResponse({
      request, response, repository, statusCode: 200, payload: visit,
      event: { action: 'home_visit.transitioned', entityType: 'home_visit', entityId: visit.id, metadata: { status: visit.status } },
    })
  } catch (error) { sendRepositoryError(response, error) }
}

function sendRepositoryResponse<T>(response: ServerResponse, result: RepositoryValue<T>): void {
  Promise.resolve(result).then((payload) => sendJson(response, 200, payload)).catch((error: unknown) => sendRepositoryError(response, error))
}

async function readLoginCredentials(request: IncomingMessage, response: ServerResponse): Promise<{ email: string; password: string } | null> {
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(await readBody(request))
  } catch {
    sendBadRequest(response, 'Body must be valid JSON.')
    return null
  }
  const credentials = parseLoginCredentials(parsedBody)
  if (!credentials) sendBadRequest(response, 'email and password are required.')
  return credentials
}

async function login(request: IncomingMessage, response: ServerResponse, repository: OrderRepository): Promise<void> {
  if (!isAuthenticationConfigured()) {
    sendJson(response, 503, { error: 'Service Unavailable', message: 'Authentication is not configured.' })
    return
  }
  const credentials = await readLoginCredentials(request, response)
  if (!credentials) return
  const result = await createLoginSession(credentials.email, credentials.password)
  if (result.status === 'success') {
    await recordAuditSafely(repository, { actorId: result.user.id, action: 'auth.login_success', entityType: 'user', metadata: { authResult: 'success', role: result.user.role } })
    sendJson(response, 200, { user: result.user, token: result.token, expiresAt: result.expiresAt })
    return
  }
  const statusCode = result.status === 'unavailable' ? 503 : 401
  const message = result.status === 'unavailable' ? 'Authentication is not configured.' : 'Invalid credentials.'
  if (result.status === 'invalid') {
    await recordAuditSafely(repository, { actorId: 'system', action: 'auth.login_failed', entityType: 'user', metadata: { authResult: 'invalid' } })
  }
  sendJson(response, statusCode, { error: result.status === 'unavailable' ? 'Service Unavailable' : 'Unauthorized', message })
}

function sendCurrentUser(request: IncomingMessage, response: ServerResponse): void {
  const user = authenticateRequest(request)
  if (!user) {
    sendUnauthorized(response)
    return
  }
  sendJson(response, 200, { user })
}

function sendLogout(response: ServerResponse): void {
  response.statusCode = 204
  response.end()
}

function isClinicalPath(pathname: string): boolean {
  const clinicalPaths = ['/api/dashboard', ORDER_PATH, PATIENTS_PATH, CATALOG_PATH, SPECIMENS_PATH, RESULTS_PATH, BILLING_PATH, RADIOLOGY_PATH, INVENTORY_PATH, AUDIT_EVENTS_PATH, INSURANCE_PATH, HOME_VISITS_PATH]
  return clinicalPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function extractActionParameter(pathname: string, prefix: string, suffix: string): string | null {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null
  const encodedValue = pathname.slice(prefix.length, -suffix.length)
  if (!encodedValue || encodedValue.includes('/')) return null
  try { return decodeURIComponent(encodedValue) } catch { return null }
}

export function createApp(repository: OrderRepository = mockRepository): RequestHandler {
  return (request, response) => {
    applyCors(response, request.headers.origin)
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')

    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }
    if (requestUrl.pathname === '/api/auth/login' && request.method === 'POST') {
      void login(request, response, repository)
      return
    }
    if (requestUrl.pathname === '/api/auth/me' && request.method === 'GET') {
      sendCurrentUser(request, response)
      return
    }
    if (requestUrl.pathname === '/api/auth/logout' && request.method === 'POST') {
      sendLogout(response)
      return
    }
    if (isAuthRequired() && isClinicalPath(requestUrl.pathname) && !authenticateRequest(request)) {
      sendUnauthorized(response)
      return
    }

    if (requestUrl.pathname === ORDER_PATH && request.method === 'POST') {
      void createOrder(request, response, repository)
      return
    }
    if (requestUrl.pathname === PATIENTS_PATH && request.method === 'POST') {
      void createPatient(request, response, repository)
      return
    }
    if (requestUrl.pathname === SPECIMENS_PATH && request.method === 'POST') {
      void createSpecimen(request, response, repository)
      return
    }
    const collectBarcode = extractActionParameter(requestUrl.pathname, `${SPECIMENS_PATH}/`, '/collect')
    if (request.method === 'POST' && collectBarcode !== null) {
      const barcode = validateText(collectBarcode, 100)
      if (!barcode) { sendBadRequest(response, 'barcode is invalid.'); return }
      void collectSpecimen(request, barcode, response, repository)
      return
    }
    if (requestUrl.pathname === RESULTS_PATH && request.method === 'POST') {
      void createResult(request, response, repository)
      return
    }
    const reviewId = extractActionParameter(requestUrl.pathname, `${RESULTS_PATH}/`, '/review')
    if (request.method === 'POST' && reviewId !== null) {
      const id = validateText(reviewId, 100)
      if (!id) { sendBadRequest(response, 'id is invalid.'); return }
      void reviewResult(request, id, response, repository)
      return
    }
    if (requestUrl.pathname === BILLING_INVOICES_PATH && request.method === 'POST') {
      void createInvoice(request, response, repository)
      return
    }
    const paymentInvoiceId = extractActionParameter(requestUrl.pathname, `${BILLING_INVOICES_PATH}/`, '/payments')
    if (request.method === 'POST' && paymentInvoiceId !== null) {
      const id = validateText(paymentInvoiceId, 100)
      if (!id) { sendBadRequest(response, 'id is invalid.'); return }
      void recordPayment(request, response, id, repository)
      return
    }
    if (requestUrl.pathname === RADIOLOGY_STUDIES_PATH && request.method === 'POST') {
      void createRadiologyStudy(request, response, repository)
      return
    }
    const startRadiologyId = extractActionParameter(requestUrl.pathname, `${RADIOLOGY_STUDIES_PATH}/`, '/start')
    if (request.method === 'POST' && startRadiologyId !== null) {
      void startRadiologyStudy(request, startRadiologyId, response, repository)
      return
    }
    const reportRadiologyId = extractActionParameter(requestUrl.pathname, `${RADIOLOGY_STUDIES_PATH}/`, '/report')
    if (request.method === 'POST' && reportRadiologyId !== null) {
      void reportRadiologyStudy(request, response, reportRadiologyId, repository)
      return
    }
    const verifyRadiologyId = extractActionParameter(requestUrl.pathname, `${RADIOLOGY_STUDIES_PATH}/`, '/verify')
    if (request.method === 'POST' && verifyRadiologyId !== null) {
      void verifyRadiologyStudy(request, verifyRadiologyId, response, repository)
      return
    }
    if (requestUrl.pathname === INVENTORY_ITEMS_PATH && request.method === 'POST') {
      void createInventoryItem(request, response, repository)
      return
    }
    const inventoryMovementItemId = extractActionParameter(requestUrl.pathname, `${INVENTORY_ITEMS_PATH}/`, '/movements')
    if (request.method === 'POST' && inventoryMovementItemId !== null) {
      void recordInventoryMovement(request, response, inventoryMovementItemId, repository)
      return
    }
    if (requestUrl.pathname === INSURANCE_POLICIES_PATH && request.method === 'POST') {
      void createInsurancePolicy(request, response, repository)
      return
    }
    if (requestUrl.pathname === INSURANCE_CLAIMS_PATH && request.method === 'POST') {
      void createInsuranceClaim(request, response, repository)
      return
    }
    const insuranceClaimTransitionId = extractActionParameter(requestUrl.pathname, `${INSURANCE_CLAIMS_PATH}/`, '/transition')
    if (request.method === 'POST' && insuranceClaimTransitionId !== null) {
      const id = validateText(insuranceClaimTransitionId, 100)
      if (!id) { sendBadRequest(response, 'id is invalid.'); return }
      void transitionInsuranceClaim(request, response, id, repository)
      return
    }
    if (requestUrl.pathname === HOME_VISITS_PATH && request.method === 'POST') {
      void createHomeVisit(request, response, repository)
      return
    }
    const homeVisitTransitionId = extractActionParameter(requestUrl.pathname, `${HOME_VISITS_PATH}/`, '/transition')
    if (request.method === 'POST' && homeVisitTransitionId !== null) {
      if (!isHomeVisitUuid(homeVisitTransitionId)) { sendBadRequest(response, 'id must be a valid UUID.'); return }
      void transitionHomeVisit(request, response, homeVisitTransitionId, repository)
      return
    }
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response)
      return
    }
    if (requestUrl.pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', service: SERVICE_NAME })
      return
    }
    if (requestUrl.pathname === '/api/ready') {
      sendJson(response, 200, { status: 'ready', database: repository.databaseMode })
      return
    }
    if (requestUrl.pathname === HOME_VISITS_PATH) {
      const patientIdValue = requestUrl.searchParams.get('patientId')
      const patientId = patientIdValue === null ? undefined : patientIdValue.trim()
      const statusValue = requestUrl.searchParams.get('status')
      const status = statusValue === null ? undefined : isHomeVisitStatus(statusValue) ? statusValue : null
      if (patientId !== undefined && !isHomeVisitUuid(patientId)) { sendBadRequest(response, 'patientId must be a valid UUID.'); return }
      if (status === null) { sendBadRequest(response, 'status is invalid.'); return }
      sendRepositoryResponse(response, repository.listHomeVisits(patientId, status))
      return
    }
    if (requestUrl.pathname === INSURANCE_POLICIES_PATH) {
      const patientIdValue = requestUrl.searchParams.get('patientId')
      const patientId = patientIdValue === null ? undefined : patientIdValue.trim()
      if (patientId !== undefined && !isInsuranceUuid(patientId)) { sendBadRequest(response, 'patientId must be a valid UUID.'); return }
      sendRepositoryResponse(response, repository.listInsurancePolicies(patientId))
      return
    }
    if (requestUrl.pathname === INSURANCE_CLAIMS_PATH) {
      const statusValue = requestUrl.searchParams.get('status')
      const status = statusValue === null ? undefined : isInsuranceClaimStatus(statusValue) ? statusValue : null
      if (status === null) { sendBadRequest(response, 'status is invalid.'); return }
      sendRepositoryResponse(response, repository.listInsuranceClaims(status))
      return
    }
    if (requestUrl.pathname === AUDIT_EVENTS_PATH) {
      const entityTypeValue = requestUrl.searchParams.get('entityType')
      const actionValue = requestUrl.searchParams.get('action')
      const entityType = entityTypeValue === null ? undefined : entityTypeValue.trim()
      const action = actionValue === null ? undefined : actionValue.trim()
      if ((entityType !== undefined && !isValidAuditLabel(entityType)) || (action !== undefined && !isValidAuditLabel(action))) {
        sendBadRequest(response, 'entityType and action are invalid.')
        return
      }
      const limit = parsePageValue(requestUrl.searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      sendRepositoryResponse(response, repository.listAuditEvents({ limit, entityType, action }))
      return
    }
    if (requestUrl.pathname === '/api/dashboard') {
      sendRepositoryResponse(response, repository.getDashboard())
      return
    }
    if (requestUrl.pathname === ORDER_PATH) {
      sendRepositoryResponse(response, repository.listRecent())
      return
    }
    if (requestUrl.pathname === PATIENTS_PATH) {
      const limit = parsePageValue(requestUrl.searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      const offset = parsePageValue(requestUrl.searchParams.get('offset'), 0)
      sendRepositoryResponse(response, repository.listPatients({ query: requestUrl.searchParams.get('q') ?? undefined, limit, offset }))
      return
    }
    if (requestUrl.pathname === CATALOG_PATH) {
      sendRepositoryResponse(response, repository.listCatalog())
      return
    }
    if (requestUrl.pathname === SPECIMENS_PATH) {
      const statusValue = requestUrl.searchParams.get('status')
      const status = statusValue === null ? undefined : isSpecimenStatus(statusValue) ? statusValue : null
      if (status === null) { sendBadRequest(response, 'status is invalid.'); return }
      sendRepositoryResponse(response, repository.listSpecimens(status))
      return
    }
    if (requestUrl.pathname === RESULTS_PATH) {
      const orderIdValue = requestUrl.searchParams.get('orderId')
      const orderId = orderIdValue === null ? undefined : validateText(orderIdValue, 100)
      if (orderIdValue !== null && orderId === null) { sendBadRequest(response, 'orderId is invalid.'); return }
      sendRepositoryResponse(response, repository.listResults(orderId ?? undefined))
      return
    }
    if (requestUrl.pathname === BILLING_INVOICES_PATH) {
      const statusValue = requestUrl.searchParams.get('status')
      const status = statusValue === null ? undefined : isInvoiceStatus(statusValue) ? statusValue : null
      if (status === null) { sendBadRequest(response, 'status is invalid.'); return }
      sendRepositoryResponse(response, repository.listInvoices(status))
      return
    }
    if (requestUrl.pathname === RADIOLOGY_STUDIES_PATH) {
      const statusValue = requestUrl.searchParams.get('status')
      const status = statusValue === null ? undefined : isRadiologyStudyStatus(statusValue) ? statusValue : null
      if (status === null) { sendBadRequest(response, 'status is invalid.'); return }
      sendRepositoryResponse(response, repository.listRadiologyStudies(status))
      return
    }
    if (requestUrl.pathname === INVENTORY_ITEMS_PATH) {
      const activeOnlyValue = requestUrl.searchParams.get('activeOnly')
      const activeOnly = activeOnlyValue === null ? undefined : activeOnlyValue === 'true' ? true : activeOnlyValue === 'false' ? false : null
      if (activeOnly === null) { sendBadRequest(response, 'activeOnly must be true or false.'); return }
      sendRepositoryResponse(response, repository.listInventoryItems(activeOnly))
      return
    }
    sendNotFound(response)
  }
}

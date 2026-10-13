import { randomUUID } from 'node:crypto'
import { calculateInvoiceTotals, cloneInvoice, isInvoiceStatus, isPaymentMethod, normalizePaymentAmount, roundMoney, type Invoice, type Payment } from './billing.js'
import { cloneRadiologyStudy, isRadiologyModality, isRadiologyPriority, isRadiologyStudyStatus, type RadiologyStudy } from './radiology.js'
import {
  cloneInventoryItem,
  cloneInventoryMovement,
  movementDelta,
  validateInventoryItemInput,
  validateInventoryMovementInput,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementResult,
} from './inventory.js'
import { cloneAuditEvent, normalizeAuditEventInput, normalizeAuditListOptions, type AuditEvent, type AuditEventInput, type AuditEventListOptions } from './audit.js'
import {
  canTransitionInsuranceClaim,
  cloneInsuranceClaim,
  cloneInsurancePolicy,
  isInsuranceClaimStatus,
  isInsuranceUuid,
  validateInsuranceClaimInput,
  validateInsurancePolicyInput,
  type InsuranceClaim,
  type InsurancePolicy,
} from './insurance.js'
import {
  canTransitionHomeVisit,
  cloneHomeVisit,
  isHomeVisitStatus,
  isHomeVisitUuid,
  validateCreateHomeVisitInput,
  type HomeVisit,
} from './home-visits.js'
import { emptyOperationsReport, isReportDateInRange, validateReportQuery, type OperationsReport, type ReportQuery } from './reports.js'
import { RepositoryConflictError, RepositoryInputError, RepositoryNotFoundError, type OrderRepository } from './storage/repository.js'

export type OrderStatus =
  | 'processing'
  | 'ready_for_review'
  | 'awaiting_sample'
  | 'completed'

export type OrderPriority = 'normal' | 'urgent'
export type PatientSex = 'female' | 'male' | 'other' | 'unknown'

export type CreatePatientInput = {
  fullName: string
  phone?: string
  dateOfBirth?: string
  sex?: PatientSex
}

export type Patient = CreatePatientInput & {
  id: string
  createdAt: string
}

export type SpecimenStatus = 'pending' | 'collected' | 'received' | 'processing' | 'rejected' | 'completed'

export type Specimen = {
  id: string
  orderId: string
  barcode: string
  specimenType: string
  status: SpecimenStatus
  createdAt: string
  updatedAt: string
  collectedAt: string | null
  rejectedReason: string | null
}

export type ResultFlag = 'normal' | 'low' | 'high' | 'critical' | 'not_applicable'
export type ResultStatus = 'draft' | 'in_review' | 'approved' | 'released' | 'amended'

export type LabResult = {
  id: string
  orderItemId: string
  resultValue: string
  unit: string | null
  referenceRange: string | null
  flag: ResultFlag
  status: ResultStatus
  enteredBy: string
  reviewedBy: string | null
  createdAt: string
  updatedAt: string
}

export type PatientListOptions = {
  query?: string
  limit?: number
  offset?: number
}

export type TestCatalogItem = {
  id: string
  code: string
  name: string
  specimenType: string
  price: number
  isActive: boolean
}

export type CreateOrderInput = {
  patientId?: string
  patientName?: string
  tests: string[]
  priority?: OrderPriority
}

export type DashboardMetric = {
  label: string
  value: string
  note: string
  icon: 'receipt' | 'flask' | 'check' | 'chart'
  tone: 'cyan' | 'orange' | 'lime' | 'navy'
}

export type Order = {
  id: string
  patient: string
  tests: string
  time: string
  status: OrderStatus
  state: string
  tone: 'info' | 'success' | 'warning'
  priority?: OrderPriority
}

export type SampleSummary = {
  total: number
  completionRate: number
  inProgress: number
  completed: number
  needsAttention: number
}

export type DashboardSummary = {
  metrics: DashboardMetric[]
  recentOrders: Order[]
  samples: SampleSummary
}

export type { OrderRepository } from './storage/repository.js'
export type { Invoice, InvoiceItem, InvoiceItemInput, InvoiceStatus, Payment, PaymentMethod } from './billing.js'

// بيانات تجريبية ثابتة للعرض والتطوير فقط، ولا تمثل مرضى أو سجلات حقيقية.
const MOCK_ORDERS: Order[] = [
  { id: 'AY-10482', patient: 'مريض تجريبي 01', tests: 'صورة دم كاملة · سكر تراكمي', time: 'منذ 12 دقيقة', status: 'processing', state: 'قيد التحليل', tone: 'info' },
  { id: 'AY-10481', patient: 'مريض تجريبي 02', tests: 'وظائف كبد · دهون الدم', time: 'منذ 28 دقيقة', status: 'ready_for_review', state: 'جاهز للمراجعة', tone: 'success' },
  { id: 'AY-10480', patient: 'مريض تجريبي 03', tests: 'تحليل بول كامل', time: 'منذ 41 دقيقة', status: 'awaiting_sample', state: 'بانتظار العينة', tone: 'warning' },
  { id: 'AY-10479', patient: 'مريض تجريبي 04', tests: 'فيتامين د · كالسيوم', time: 'منذ ساعة', status: 'completed', state: 'مكتمل', tone: 'success' },
]

const MOCK_PATIENTS: Patient[] = [
  { id: '00000000-0000-4000-8000-000000000001', fullName: 'مريض تجريبي 01', sex: 'unknown', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000002', fullName: 'مريض تجريبي 02', sex: 'unknown', createdAt: '2026-01-01T00:00:00.000Z' },
]

const MOCK_CATALOG: TestCatalogItem[] = [
  { id: '00000000-0000-4000-8000-000000000101', code: 'CBC', name: 'CBC / صورة دم كاملة', specimenType: 'blood / دم', price: 150, isActive: true },
  { id: '00000000-0000-4000-8000-000000000102', code: 'HBA1C', name: 'HbA1c / سكر تراكمي', specimenType: 'blood / دم', price: 180, isActive: true },
  { id: '00000000-0000-4000-8000-000000000103', code: 'URINALYSIS', name: 'Urinalysis / تحليل بول كامل', specimenType: 'urine / بول', price: 100, isActive: true },
]

const MOCK_METRICS: DashboardMetric[] = [
  { label: 'طلبات اليوم', value: '128', note: '+12% عن أمس', icon: 'receipt', tone: 'cyan' },
  { label: 'عينات قيد المعالجة', value: '36', note: '8 أولوية عالية', icon: 'flask', tone: 'orange' },
  { label: 'نتائج جاهزة', value: '84', note: 'متوسط الإنجاز 24د', icon: 'check', tone: 'lime' },
  { label: 'إيرادات اليوم', value: '18,420', note: 'جنيه مصري', icon: 'chart', tone: 'navy' },
]

const MOCK_SAMPLES: SampleSummary = { total: 128, completionRate: 68, inProgress: 36, completed: 84, needsAttention: 8 }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateRadiologyId(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new RepositoryInputError('id must be a valid UUID.')
}

function cloneOrder(order: Order): Order {
  return { ...order }
}

function clonePatient(patient: Patient): Patient {
  return { ...patient }
}

function cloneCatalogItem(item: TestCatalogItem): TestCatalogItem {
  return { ...item }
}

function cloneSpecimen(specimen: Specimen): Specimen {
  return { ...specimen }
}

function cloneLabResult(labResult: LabResult): LabResult {
  return { ...labResult }
}

function countReportRecords<T extends { status: string }>(records: T[], query: ReportQuery, getTimestamp: (record: T) => string, status?: string): number {
  return records.filter((record) => isReportDateInRange(getTimestamp(record), query) && (status === undefined || record.status === status)).length
}

function invoicePaidAmount(invoice: Invoice): number {
  return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)
}

type MemoryReportSources = {
  period: ReportQuery
  orders: Order[]
  orderCreatedAt: Map<string, string>
  specimens: Specimen[]
  labResults: LabResult[]
  invoices: Invoice[]
  radiologyStudies: RadiologyStudy[]
  inventoryItems: InventoryItem[]
  insuranceClaims: InsuranceClaim[]
  homeVisits: HomeVisit[]
}

function calculateMemoryOperationsReport(sources: MemoryReportSources): OperationsReport {
  const { period, orders, orderCreatedAt, specimens, labResults, invoices, radiologyStudies, inventoryItems, insuranceClaims, homeVisits } = sources
  const report = emptyOperationsReport(period)
  report.orders.total = countReportRecords(orders, period, (order) => orderCreatedAt.get(order.id) ?? '')
  report.orders.completed = countReportRecords(orders, period, (order) => orderCreatedAt.get(order.id) ?? '', 'completed')
  report.orders.awaitingSample = countReportRecords(orders, period, (order) => orderCreatedAt.get(order.id) ?? '', 'awaiting_sample')
  report.orders.inProgress = countReportRecords(orders, period, (order) => orderCreatedAt.get(order.id) ?? '', 'processing') + countReportRecords(orders, period, (order) => orderCreatedAt.get(order.id) ?? '', 'ready_for_review')
  report.specimens.total = countReportRecords(specimens, period, (specimen) => specimen.createdAt)
  report.specimens.collected = countReportRecords(specimens, period, (specimen) => specimen.createdAt, 'collected')
  report.specimens.processing = countReportRecords(specimens, period, (specimen) => specimen.createdAt, 'processing')
  report.specimens.completed = countReportRecords(specimens, period, (specimen) => specimen.createdAt, 'completed')
  report.results.total = countReportRecords(labResults, period, (labResult) => labResult.createdAt)
  report.results.draft = countReportRecords(labResults, period, (labResult) => labResult.createdAt, 'draft')
  report.results.reviewed = labResults.filter((labResult) => isReportDateInRange(labResult.createdAt, period) && labResult.status !== 'draft').length
  report.billing.invoiced = roundMoney(invoices.filter((invoice) => invoice.status !== 'void' && isReportDateInRange(invoice.createdAt, period)).reduce((sum, invoice) => sum + invoice.total, 0))
  report.billing.paid = roundMoney(invoices.flatMap((invoice) => invoice.payments).filter((payment) => isReportDateInRange(payment.paidAt, period)).reduce((sum, payment) => sum + payment.amount, 0))
  report.billing.open = roundMoney(invoices.filter((invoice) => invoice.status !== 'void' && isReportDateInRange(invoice.createdAt, period)).reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoicePaidAmount(invoice)), 0))
  report.radiology.total = countReportRecords(radiologyStudies, period, (study) => study.createdAt)
  report.radiology.scheduled = countReportRecords(radiologyStudies, period, (study) => study.createdAt, 'scheduled')
  report.radiology.inProgress = countReportRecords(radiologyStudies, period, (study) => study.createdAt, 'in_progress')
  report.radiology.reported = countReportRecords(radiologyStudies, period, (study) => study.createdAt, 'reported')
  report.radiology.verified = countReportRecords(radiologyStudies, period, (study) => study.createdAt, 'verified')
  const activeInventory = inventoryItems.filter((item) => item.isActive && isReportDateInRange(item.createdAt, period))
  report.inventory.items = activeInventory.length
  report.inventory.lowStock = activeInventory.filter((item) => item.quantity <= item.reorderLevel).length
  report.insurance.claimsTotal = countReportRecords(insuranceClaims, period, (claim) => claim.createdAt)
  report.insurance.submitted = countReportRecords(insuranceClaims, period, (claim) => claim.createdAt, 'submitted')
  report.insurance.approved = countReportRecords(insuranceClaims, period, (claim) => claim.createdAt, 'approved')
  report.insurance.paid = countReportRecords(insuranceClaims, period, (claim) => claim.createdAt, 'paid')
  report.homeVisits.total = countReportRecords(homeVisits, period, (visit) => visit.scheduledAt)
  report.homeVisits.scheduled = countReportRecords(homeVisits, period, (visit) => visit.scheduledAt, 'scheduled')
  report.homeVisits.inProgress = countReportRecords(homeVisits, period, (visit) => visit.scheduledAt, 'in_progress')
  report.homeVisits.completed = countReportRecords(homeVisits, period, (visit) => visit.scheduledAt, 'completed')
  return report
}

function cloneRadiology(study: RadiologyStudy): RadiologyStudy {
  return cloneRadiologyStudy(study)
}

function cloneInventoryResult(result: InventoryMovementResult): InventoryMovementResult {
  return { item: cloneInventoryItem(result.item), movement: cloneInventoryMovement(result.movement) }
}

function recordAuditEvent(auditEvents: AuditEvent[], input: AuditEventInput): AuditEvent {
  const event = normalizeAuditEventInput(input)
  auditEvents.unshift(event)
  if (auditEvents.length > 1000) auditEvents.length = 1000
  return cloneAuditEvent(event)
}

function listAuditEvents(auditEvents: AuditEvent[], options?: AuditEventListOptions): AuditEvent[] {
  const normalized = normalizeAuditListOptions(options)
  return auditEvents
    .filter((event) => (!normalized.entityType || event.entityType === normalized.entityType) && (!normalized.action || event.action === normalized.action))
    .slice(0, normalized.limit)
    .map(cloneAuditEvent)
}

function cloneDashboard(orders: Order[]): DashboardSummary {
  return {
    metrics: MOCK_METRICS.map((metric) => ({ ...metric })),
    recentOrders: orders.map(cloneOrder),
    samples: { ...MOCK_SAMPLES },
  }
}

function filterPatients(patients: Patient[], query: string | undefined): Patient[] {
  const normalizedQuery = query?.trim().toLocaleLowerCase()
  if (!normalizedQuery) return patients
  return patients.filter((patient) => {
    const searchableText = `${patient.fullName} ${patient.phone ?? ''}`.toLocaleLowerCase()
    return searchableText.includes(normalizedQuery)
  })
}

function paginatePatients(patients: Patient[], options: PatientListOptions | undefined): Patient[] {
  const offset = options?.offset ?? 0
  const limit = options?.limit ?? 50
  return patients.slice(offset, offset + limit).map(clonePatient)
}

export function createMemoryRepository(): OrderRepository {
  let nextOrderNumber = 10483
  let orders = MOCK_ORDERS.map(cloneOrder)
  const initialOrderTimestamp = new Date().toISOString()
  const orderCreatedAt = new Map(orders.map((order) => [order.id, initialOrderTimestamp]))
  let patients = MOCK_PATIENTS.map(clonePatient)
  let specimens: Specimen[] = []
  let labResults: LabResult[] = []
  let nextInvoiceNumber = 1
  let invoices: Invoice[] = []
  let radiologyStudies: RadiologyStudy[] = []
  let nextAccessionNumber = 1
  let inventoryItems: InventoryItem[] = []
  let insurancePolicies: InsurancePolicy[] = []
  let insuranceClaims: InsuranceClaim[] = []
  let nextClaimNumber = 1
  let homeVisits: HomeVisit[] = []
  const auditEvents: AuditEvent[] = []

  return {
    databaseMode: 'memory' as const,
    listRecent: () => orders.map(cloneOrder),
    getDashboard: () => cloneDashboard(orders),
    getOperationsReport: (from, to) => {
      const period = validateReportQuery({ from, to })
      return calculateMemoryOperationsReport({ period, orders, orderCreatedAt, specimens, labResults, invoices, radiologyStudies, inventoryItems, insuranceClaims, homeVisits })
    },
    listPatients: (options) => paginatePatients(filterPatients(patients, options?.query), options),
    getPatientById: (patientId) => {
      const patient = patients.find((candidate) => candidate.id === patientId)
      return patient ? clonePatient(patient) : null
    },
    createPatient: (input) => {
      const patient: Patient = { id: randomUUID(), ...input, createdAt: new Date().toISOString() }
      patients = [patient, ...patients]
      return clonePatient(patient)
    },
    listCatalog: () => MOCK_CATALOG.map(cloneCatalogItem),
    createOrder: (input) => {
      const patient = input.patientId ? patients.find((candidate) => candidate.id === input.patientId) : undefined
      const patientName = patient?.fullName ?? input.patientName
      if (!patientName) throw new Error('A patientId or patientName is required.')
      const createdAt = new Date().toISOString()
      const order: Order = {
        id: `AY-${nextOrderNumber++}`,
        patient: patientName.trim(),
        tests: input.tests.join(' · '),
        time: 'الآن',
        status: 'awaiting_sample',
        state: 'بانتظار العينة',
        tone: 'warning',
        priority: input.priority ?? 'normal',
      }
      orderCreatedAt.set(order.id, createdAt)
      orders = [order, ...orders]
      return cloneOrder(order)
    },
    listSpecimens: (status) => specimens.filter((specimen) => !status || specimen.status === status).map(cloneSpecimen),
    createSpecimen: (orderId, specimenType, barcode) => {
      if (!orders.some((order) => order.id === orderId)) throw new RepositoryNotFoundError('Order was not found.')
      if (specimens.some((specimen) => specimen.barcode === barcode)) throw new RepositoryConflictError('Barcode already exists.')
      const timestamp = new Date().toISOString()
      const specimen: Specimen = {
        id: randomUUID(), orderId, barcode, specimenType, status: 'pending', createdAt: timestamp,
        updatedAt: timestamp, collectedAt: null, rejectedReason: null,
      }
      specimens = [specimen, ...specimens]
      return cloneSpecimen(specimen)
    },
    collectSpecimen: (barcode) => {
      const specimen = specimens.find((candidate) => candidate.barcode === barcode)
      if (!specimen) throw new RepositoryNotFoundError('Specimen was not found.')
      if (specimen.status !== 'pending') throw new RepositoryConflictError('Specimen can only be collected from pending status.')
      const timestamp = new Date().toISOString()
      specimen.status = 'collected'
      specimen.collectedAt = timestamp
      specimen.updatedAt = timestamp
      return cloneSpecimen(specimen)
    },
    listResults: (orderId) => labResults
      .filter((labResult) => !orderId || labResult.orderItemId === orderId)
      .map(cloneLabResult),
    enterResult: (orderItemId, value, unit, referenceRange, flag) => {
      const timestamp = new Date().toISOString()
      const labResult: LabResult = {
        id: randomUUID(), orderItemId, resultValue: value, unit: unit ?? null, referenceRange: referenceRange ?? null,
        flag, status: 'draft', enteredBy: 'system', reviewedBy: null, createdAt: timestamp, updatedAt: timestamp,
      }
      labResults = [labResult, ...labResults]
      return cloneLabResult(labResult)
    },
    reviewResult: (id) => {
      const labResult = labResults.find((candidate) => candidate.id === id)
      if (!labResult) throw new RepositoryNotFoundError('Lab result was not found.')
      if (labResult.status === 'draft') labResult.status = 'in_review'
      else if (labResult.status === 'in_review') labResult.status = 'approved'
      else throw new RepositoryConflictError('Lab result is not in a reviewable status.')
      labResult.reviewedBy = 'system'
      labResult.updatedAt = new Date().toISOString()
      return cloneLabResult(labResult)
    },
    listInvoices: (status) => {
      if (status !== undefined && !isInvoiceStatus(status)) throw new RepositoryInputError('status is invalid.')
      return invoices
        .filter((invoice) => status === undefined || invoice.status === status)
        .map(cloneInvoice)
    },
    createInvoice: (orderId, items, discount, tax) => {
      const normalizedOrderId = orderId.trim()
      if (!orders.some((order) => order.id === normalizedOrderId)) throw new RepositoryNotFoundError('Order was not found.')
      const totals = calculateInvoiceTotals(items, discount, tax)
      const timestamp = new Date().toISOString()
      const invoice: Invoice = {
        id: randomUUID(),
        orderId: normalizedOrderId,
        invoiceNumber: `INV-${nextInvoiceNumber++}`,
        currency: 'EGP',
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        status: 'draft',
        items: totals.items.map((item) => ({ ...item, id: randomUUID(), lineTotal: roundMoney(item.quantity * item.unitPrice) })),
        payments: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      invoices = [invoice, ...invoices]
      return cloneInvoice(invoice)
    },
    recordPayment: (invoiceId, amount, method, reference) => {
      const invoice = invoices.find((candidate) => candidate.id === invoiceId)
      if (!invoice) throw new RepositoryNotFoundError('Invoice was not found.')
      if (!isPaymentMethod(method)) throw new RepositoryInputError('method is invalid.')
      const normalizedAmount = normalizePaymentAmount(amount)
      if (reference !== undefined && (typeof reference !== 'string' || reference.trim().length === 0 || reference.trim().length > 200)) {
        throw new RepositoryInputError('reference is invalid.')
      }
      if (invoice.status === 'void') throw new RepositoryConflictError('Void invoices cannot receive payments.')
      if (invoice.status === 'paid') throw new RepositoryConflictError('Invoice is already paid.')
      const paidBefore = roundMoney(invoice.payments.reduce((sum, payment) => sum + payment.amount, 0))
      if (normalizedAmount > roundMoney(invoice.total - paidBefore)) throw new RepositoryConflictError('Payment exceeds the invoice balance.')
      const payment: Payment = {
        id: randomUUID(), amount: normalizedAmount, method, reference: reference?.trim() || null,
        paidAt: new Date().toISOString(), receivedBy: 'system',
      }
      invoice.payments = [...invoice.payments, payment]
      const paidAfter = roundMoney(paidBefore + normalizedAmount)
      invoice.status = paidAfter >= invoice.total ? 'paid' : 'partially_paid'
      invoice.updatedAt = new Date().toISOString()
      return cloneInvoice(invoice)
    },
    listRadiologyStudies: (status) => {
      if (status !== undefined && !isRadiologyStudyStatus(status)) throw new RepositoryInputError('status is invalid.')
      return radiologyStudies
        .filter((study) => status === undefined || study.status === status)
        .map(cloneRadiology)
    },
    createRadiologyStudy: (patientId, modality, bodyPart, priority, scheduledAt, referringProvider) => {
      if (!UUID_PATTERN.test(patientId) || !isRadiologyModality(modality) || !bodyPart.trim() || bodyPart.trim().length > 200 || !isRadiologyPriority(priority)) {
        throw new RepositoryInputError('Radiology study input is invalid.')
      }
      if (scheduledAt !== undefined && Number.isNaN(new Date(scheduledAt).getTime())) throw new RepositoryInputError('scheduledAt is invalid.')
      if (referringProvider !== undefined && (!referringProvider.trim() || referringProvider.trim().length > 200)) {
        throw new RepositoryInputError('referringProvider is invalid.')
      }
      if (!patients.some((patient) => patient.id === patientId)) throw new RepositoryNotFoundError('Patient was not found.')
      const timestamp = new Date().toISOString()
      const study: RadiologyStudy = {
        id: randomUUID(), accessionNumber: `RAD-${nextAccessionNumber++}`, patientId, modality, bodyPart: bodyPart.trim(), priority,
        status: 'scheduled', scheduledAt: scheduledAt ?? null, performedAt: null, reportText: null, impression: null,
        referringProvider: referringProvider ?? null, verifiedBy: null, createdAt: timestamp, updatedAt: timestamp,
      }
      radiologyStudies = [study, ...radiologyStudies]
      return cloneRadiology(study)
    },
    startRadiologyStudy: (id) => {
      validateRadiologyId(id)
      const study = radiologyStudies.find((candidate) => candidate.id === id)
      if (!study) throw new RepositoryNotFoundError('Radiology study was not found.')
      if (study.status !== 'scheduled') throw new RepositoryConflictError('Radiology study can only start from scheduled status.')
      study.status = 'in_progress'
      study.performedAt = new Date().toISOString()
      study.updatedAt = study.performedAt
      return cloneRadiology(study)
    },
    reportRadiologyStudy: (id, reportText, impression) => {
      validateRadiologyId(id)
      const study = radiologyStudies.find((candidate) => candidate.id === id)
      if (!study) throw new RepositoryNotFoundError('Radiology study was not found.')
      if (study.status !== 'in_progress') throw new RepositoryConflictError('Radiology study can only be reported from in_progress status.')
      if (!reportText.trim() || !impression.trim()) throw new RepositoryInputError('reportText and impression are required.')
      study.status = 'reported'
      study.reportText = reportText.trim()
      study.impression = impression.trim()
      study.updatedAt = new Date().toISOString()
      return cloneRadiology(study)
    },
    verifyRadiologyStudy: (id) => {
      validateRadiologyId(id)
      const study = radiologyStudies.find((candidate) => candidate.id === id)
      if (!study) throw new RepositoryNotFoundError('Radiology study was not found.')
      if (study.status !== 'reported') throw new RepositoryConflictError('Radiology study can only be verified from reported status.')
      if (!study.reportText?.trim() || !study.impression?.trim()) throw new RepositoryConflictError('Radiology study requires a report and impression before verification.')
      study.status = 'verified'
      study.verifiedBy = 'system'
      study.updatedAt = new Date().toISOString()
      return cloneRadiology(study)
    },
    listInventoryItems: (activeOnly) => inventoryItems
      .filter((item) => activeOnly !== true || item.isActive)
      .map(cloneInventoryItem),
    createInventoryItem: (sku, name, category, unit, reorderLevel) => {
      const input = validateInventoryItemInput(sku, name, category, unit, reorderLevel)
      if (inventoryItems.some((item) => item.sku === input.sku)) throw new RepositoryConflictError('SKU already exists.')
      const timestamp = new Date().toISOString()
      const item: InventoryItem = {
        id: randomUUID(), ...input, quantity: 0, isActive: true, createdAt: timestamp, updatedAt: timestamp,
      }
      inventoryItems = [item, ...inventoryItems]
      return cloneInventoryItem(item)
    },
    recordInventoryMovement: (itemId, type, quantity, reason, reference, adjustmentDirection, createdBy) => {
      const input = validateInventoryMovementInput(type, quantity, reason, reference, adjustmentDirection)
      const item = inventoryItems.find((candidate) => candidate.id === itemId)
      if (!item) throw new RepositoryNotFoundError('Inventory item was not found.')
      const delta = movementDelta(input.type, input.quantity, input.adjustmentDirection)
      if (item.quantity + delta < 0) throw new RepositoryConflictError('Insufficient inventory stock.')
      const timestamp = new Date().toISOString()
      item.quantity = Math.round((item.quantity + delta + Number.EPSILON) * 1000) / 1000
      item.updatedAt = timestamp
      const movement: InventoryMovement = {
        id: randomUUID(), itemId, type: input.type, quantity: input.quantity,
        adjustmentDirection: input.adjustmentDirection ?? null, reason: input.reason,
        reference: input.reference ?? null, createdBy: createdBy?.trim() || 'system', createdAt: timestamp,
      }
      return cloneInventoryResult({ item, movement })
    },
    listInsurancePolicies: (patientId) => {
      if (patientId !== undefined && !isInsuranceUuid(patientId)) throw new RepositoryInputError('patientId must be a valid UUID.')
      return insurancePolicies
        .filter((policy) => patientId === undefined || policy.patientId === patientId)
        .map(cloneInsurancePolicy)
    },
    createInsurancePolicy: (patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo) => {
      const input = validateInsurancePolicyInput({ patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo })
      if (!input) throw new RepositoryInputError('Insurance policy input is invalid.')
      if (!patients.some((patient) => patient.id === input.patientId)) throw new RepositoryNotFoundError('Patient was not found.')
      if (insurancePolicies.some((policy) => policy.payerName === input.payerName && policy.memberNumber === input.memberNumber)) {
        throw new RepositoryConflictError('Insurance policy member number already exists for this payer.')
      }
      const timestamp = new Date().toISOString()
      const policy: InsurancePolicy = {
        id: randomUUID(), ...input, status: 'active', validTo: input.validTo ?? null, createdAt: timestamp, updatedAt: timestamp,
      }
      insurancePolicies = [policy, ...insurancePolicies]
      return cloneInsurancePolicy(policy)
    },
    listInsuranceClaims: (status) => {
      if (status !== undefined && !isInsuranceClaimStatus(status)) throw new RepositoryInputError('status is invalid.')
      return insuranceClaims.filter((claim) => status === undefined || claim.status === status).map(cloneInsuranceClaim)
    },
    createInsuranceClaim: (policyId, orderId, amount) => {
      const input = validateInsuranceClaimInput({ policyId, orderId, amount })
      if (!input) throw new RepositoryInputError('Insurance claim input is invalid.')
      if (!insurancePolicies.some((policy) => policy.id === input.policyId)) throw new RepositoryNotFoundError('Insurance policy was not found.')
      const normalizedOrderId = input.orderId ?? null
      if (normalizedOrderId !== null && !orders.some((order) => order.id === normalizedOrderId)) throw new RepositoryNotFoundError('Order was not found.')
      const timestamp = new Date().toISOString()
      const claim: InsuranceClaim = {
        id: randomUUID(), claimNumber: `CLM-${nextClaimNumber++}`, policyId: input.policyId, orderId: normalizedOrderId,
        amount: input.amount, status: 'draft', submittedAt: null, responseCode: null, notes: null, createdAt: timestamp, updatedAt: timestamp,
      }
      insuranceClaims = [claim, ...insuranceClaims]
      return cloneInsuranceClaim(claim)
    },
    transitionInsuranceClaim: (id, nextStatus) => {
      if (!isInsuranceUuid(id) || !isInsuranceClaimStatus(nextStatus)) throw new RepositoryInputError('Insurance claim transition input is invalid.')
      const claim = insuranceClaims.find((candidate) => candidate.id === id)
      if (!claim) throw new RepositoryNotFoundError('Insurance claim was not found.')
      if (!canTransitionInsuranceClaim(claim.status, nextStatus)) throw new RepositoryConflictError('Insurance claim transition is not allowed.')
      claim.status = nextStatus
      if (nextStatus === 'submitted') claim.submittedAt = new Date().toISOString()
      claim.updatedAt = new Date().toISOString()
      return cloneInsuranceClaim(claim)
    },
    listHomeVisits: (patientId, status) => {
       if (patientId !== undefined && !isHomeVisitUuid(patientId)) throw new RepositoryInputError('patientId must be a valid UUID.')
       if (status !== undefined && !isHomeVisitStatus(status)) throw new RepositoryInputError('status is invalid.')
       return homeVisits
         .filter((visit) => (patientId === undefined || visit.patientId === patientId) && (status === undefined || visit.status === status))
         .map(cloneHomeVisit)
     },
     createHomeVisit: (patientId, orderId, address, contactPhone, scheduledAt, assignedTo, notes) => {
       const input = validateCreateHomeVisitInput({ patientId, orderId: orderId ?? null, address, contactPhone, scheduledAt, assignedTo, notes })
       if (!input) throw new RepositoryInputError('Home visit input is invalid.')
       if (!patients.some((patient) => patient.id === input.patientId)) throw new RepositoryNotFoundError('Patient was not found.')
       if (input.orderId !== null && !orders.some((order) => order.id === input.orderId)) throw new RepositoryNotFoundError('Order was not found.')
       const timestamp = new Date().toISOString()
       const visit: HomeVisit = {
         id: randomUUID(), patientId: input.patientId, orderId: input.orderId ?? null, address: input.address,
         contactPhone: input.contactPhone, scheduledAt: input.scheduledAt, assignedTo: input.assignedTo ?? null,
         status: 'scheduled', notes: input.notes ?? null, createdAt: timestamp, updatedAt: timestamp,
       }
       homeVisits = [visit, ...homeVisits]
       return cloneHomeVisit(visit)
     },
     transitionHomeVisit: (id, nextStatus) => {
       if (!isHomeVisitUuid(id) || !isHomeVisitStatus(nextStatus)) throw new RepositoryInputError('Home visit transition input is invalid.')
       const visit = homeVisits.find((candidate) => candidate.id === id)
       if (!visit) throw new RepositoryNotFoundError('Home visit was not found.')
       if (!canTransitionHomeVisit(visit.status, nextStatus)) throw new RepositoryConflictError('Home visit transition is not allowed.')
       visit.status = nextStatus
       visit.updatedAt = new Date().toISOString()
       return cloneHomeVisit(visit)
     },
     recordAuditEvent: (input) => recordAuditEvent(auditEvents, input),
    listAuditEvents: (options) => listAuditEvents(auditEvents, options),
  }
}

export const mockRepository = createMemoryRepository()

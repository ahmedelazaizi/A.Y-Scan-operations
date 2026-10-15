import type {
  CatalogTestInput,
  CatalogTestUpdate,
  CreateOrderInput,
  CreateReceptionOrderInput,
  ReceptionOrder,
  CreatePatientInput,
  DashboardSummary,
  LabResult,
  Order,
  Patient,
  PatientListOptions,
  Specimen,
  SpecimenStatus,
  TestCatalogItem,
  ResultFlag,
  ResultWorklistItem,
  ReportRelease,
} from '../domain.js'
import type { OperationsReport } from '../reports.js'
import type { Invoice, InvoiceItemInput, InvoiceStatus, PaymentMethod } from '../billing.js'
import type { RadiologyModality, RadiologyOrderItem, RadiologyPriority, RadiologyStudy, RadiologyStudyStatus } from '../radiology.js'
import type { InventoryAdjustmentDirection, InventoryItem, InventoryMovementResult, InventoryMovementType } from '../inventory.js'
import type { AuditEvent, AuditEventInput, AuditEventListOptions } from '../audit.js'
import type { InsuranceClaim, InsuranceClaimStatus, InsurancePolicy } from '../insurance.js'
import type { HomeVisit, HomeVisitStatus } from '../home-visits.js'
import type { CreateDeviceInput, DeviceConnectionResult, LabDevice } from '../devices.js'

export type RepositoryValue<T> = T | Promise<T>

export type PageOptions = { limit: number; offset: number }
export const DEFAULT_LIST_LIMIT = 100
export const MAX_LIST_LIMIT = 500

export function resolvePage(page: PageOptions | undefined): PageOptions {
  return page ?? { limit: DEFAULT_LIST_LIMIT, offset: 0 }
}

export function paginate<T>(items: readonly T[], page: PageOptions | undefined): T[] {
  const { limit, offset } = resolvePage(page)
  return items.slice(offset, offset + limit)
}

export class RepositoryNotFoundError extends Error {
  readonly code = 'not_found'
}

export class RepositoryInputError extends Error {
  readonly code = 'invalid_input'
}

export class RepositoryConflictError extends Error {
  readonly code = 'conflict'
}

/** Validates the signer name stored on clinical and financial records. */
export function normalizeActor(actor: string): string {
  const normalized = actor.trim()
  if (!normalized || normalized.length > 200) throw new RepositoryInputError('Actor name is invalid.')
  return normalized
}

/** Actor arguments (enteredBy, reviewedBy, ...) are the signer's display name, snapshotted onto the record. */
export type OrderRepository = {
  listRecent(): RepositoryValue<Order[]>
  getDashboard(): RepositoryValue<DashboardSummary>
  getOperationsReport(from?: string, to?: string): RepositoryValue<OperationsReport>
  createOrder(input: CreateOrderInput): RepositoryValue<Order>
  createReceptionOrder(input: CreateReceptionOrderInput): RepositoryValue<ReceptionOrder>
  listReceptionOrders(page?: PageOptions): RepositoryValue<ReceptionOrder[]>
  listPatients(options?: PatientListOptions): RepositoryValue<Patient[]>
  getPatientById(patientId: string): RepositoryValue<Patient | null>
  createPatient(input: CreatePatientInput): RepositoryValue<Patient>
  listCatalog(): RepositoryValue<TestCatalogItem[]>
  createCatalogTest(input: CatalogTestInput): RepositoryValue<TestCatalogItem>
  updateCatalogTest(id: string, update: CatalogTestUpdate): RepositoryValue<TestCatalogItem>
  listSpecimens(status?: SpecimenStatus, page?: PageOptions): RepositoryValue<Specimen[]>
  createSpecimen(orderId: string, specimenType: string, barcode: string): RepositoryValue<Specimen>
  collectSpecimen(barcode: string): RepositoryValue<Specimen>
  collectSpecimenWithPaymentOverride(barcode: string): RepositoryValue<Specimen>
  rejectSpecimen(barcode: string, reason: string): RepositoryValue<Specimen>
  receiveSpecimen(barcode: string): RepositoryValue<Specimen>
  listResultWorklist(page?: PageOptions): RepositoryValue<ResultWorklistItem[]>
  listResults(orderId?: string, page?: PageOptions): RepositoryValue<LabResult[]>
  enterResult(orderItemId: string, value: string, unit: string | undefined, referenceRange: string | undefined, flag: ResultFlag, enteredBy: string, enteredById?: string, parameterId?: string, referenceRangeSnapshot?: Record<string, unknown>): RepositoryValue<LabResult>
  reviewResult(id: string, reviewedBy: string, reviewedById?: string): RepositoryValue<LabResult>
  amendResult(id: string, value: string, unit: string | undefined, referenceRange: string | undefined, flag: ResultFlag, reason: string, enteredBy: string, enteredById?: string, parameterId?: string, referenceRangeSnapshot?: Record<string, unknown>): RepositoryValue<LabResult>
  releaseReport(orderId: string, releasedById: string, contentSnapshot: Record<string, unknown>, settingsSnapshot: Record<string, unknown>): RepositoryValue<ReportRelease>
  getReportRelease(id: string): RepositoryValue<ReportRelease | null>
  listReportReleases(orderId: string): RepositoryValue<ReportRelease[]>
  getPublicReportVerification(token: string): RepositoryValue<import('../domain.js').PublicReportVerification | null>
  listInvoices(status?: InvoiceStatus, page?: PageOptions): RepositoryValue<Invoice[]>
  createInvoice(orderId: string, items: InvoiceItemInput[], discount?: number, tax?: number): RepositoryValue<Invoice>
  recordPayment(invoiceId: string, amount: number, method: PaymentMethod, reference: string | undefined, receivedBy: string): RepositoryValue<Invoice>
  listRadiologyStudies(status?: RadiologyStudyStatus, page?: PageOptions): RepositoryValue<RadiologyStudy[]>
  listRadiologyOrderItems(page?: PageOptions): RepositoryValue<RadiologyOrderItem[]>
  createRadiologyStudy(
    orderItemId: string,
    modality: RadiologyModality,
    bodyPart: string,
    priority: RadiologyPriority,
    scheduledAt: string,
    referringProvider?: string,
  ): RepositoryValue<RadiologyStudy>
  startRadiologyStudy(id: string): RepositoryValue<RadiologyStudy>
  reportRadiologyStudy(id: string, reportText: string, impression: string): RepositoryValue<RadiologyStudy>
  verifyRadiologyStudy(id: string, verifiedBy: string): RepositoryValue<RadiologyStudy>
  listInventoryItems(activeOnly?: boolean): RepositoryValue<InventoryItem[]>
  createInventoryItem(sku: string, name: string, category: string, unit: string, reorderLevel: number): RepositoryValue<InventoryItem>
  recordInventoryMovement(
    itemId: string,
    type: InventoryMovementType,
    quantity: number,
    reason: string,
    reference: string | undefined,
    adjustmentDirection: InventoryAdjustmentDirection | undefined,
    createdBy: string,
  ): RepositoryValue<InventoryMovementResult>
  recordAuditEvent(input: AuditEventInput): RepositoryValue<AuditEvent>
  listAuditEvents(options?: AuditEventListOptions): RepositoryValue<AuditEvent[]>
  listInsurancePolicies(patientId?: string, page?: PageOptions): RepositoryValue<InsurancePolicy[]>
  createInsurancePolicy(
    patientId: string,
    payerName: string,
    memberNumber: string,
    planName: string,
    coveragePercent: number,
    validFrom: string,
    validTo?: string,
  ): RepositoryValue<InsurancePolicy>
  listInsuranceClaims(status?: InsuranceClaimStatus, page?: PageOptions): RepositoryValue<InsuranceClaim[]>
  createInsuranceClaim(policyId: string, orderId: string | undefined, amount: number): RepositoryValue<InsuranceClaim>
  transitionInsuranceClaim(id: string, nextStatus: InsuranceClaimStatus): RepositoryValue<InsuranceClaim>
  listHomeVisits(patientId?: string, status?: HomeVisitStatus, page?: PageOptions): RepositoryValue<HomeVisit[]>
  createHomeVisit(
    patientId: string,
    orderId: string | undefined,
    address: string,
    contactPhone: string,
    scheduledAt: string,
    assignedTo?: string,
    notes?: string,
  ): RepositoryValue<HomeVisit>
  transitionHomeVisit(id: string, nextStatus: HomeVisitStatus): RepositoryValue<HomeVisit>
  listDevices(activeOnly?: boolean): RepositoryValue<LabDevice[]>
  createDevice(input: CreateDeviceInput): RepositoryValue<LabDevice>
  checkDeviceConnection(id: string): RepositoryValue<DeviceConnectionResult>
  readonly databaseMode: 'configured' | 'memory'
}

import type {
  CreateOrderInput,
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
} from '../domain.js'
import type { OperationsReport } from '../reports.js'
import type { Invoice, InvoiceItemInput, InvoiceStatus, PaymentMethod } from '../billing.js'
import type { RadiologyModality, RadiologyPriority, RadiologyStudy, RadiologyStudyStatus } from '../radiology.js'
import type { InventoryAdjustmentDirection, InventoryItem, InventoryMovementResult, InventoryMovementType } from '../inventory.js'
import type { AuditEvent, AuditEventInput, AuditEventListOptions } from '../audit.js'
import type { InsuranceClaim, InsuranceClaimStatus, InsurancePolicy } from '../insurance.js'
import type { HomeVisit, HomeVisitStatus } from '../home-visits.js'
import type { CreateDeviceInput, DeviceConnectionResult, LabDevice } from '../devices.js'

export type RepositoryValue<T> = T | Promise<T>

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
  listPatients(options?: PatientListOptions): RepositoryValue<Patient[]>
  getPatientById(patientId: string): RepositoryValue<Patient | null>
  createPatient(input: CreatePatientInput): RepositoryValue<Patient>
  listCatalog(): RepositoryValue<TestCatalogItem[]>
  listSpecimens(status?: SpecimenStatus): RepositoryValue<Specimen[]>
  createSpecimen(orderId: string, specimenType: string, barcode: string): RepositoryValue<Specimen>
  collectSpecimen(barcode: string): RepositoryValue<Specimen>
  listResults(orderId?: string): RepositoryValue<LabResult[]>
  enterResult(orderItemId: string, value: string, unit: string | undefined, referenceRange: string | undefined, flag: ResultFlag, enteredBy: string): RepositoryValue<LabResult>
  reviewResult(id: string, reviewedBy: string): RepositoryValue<LabResult>
  listInvoices(status?: InvoiceStatus): RepositoryValue<Invoice[]>
  createInvoice(orderId: string, items: InvoiceItemInput[], discount?: number, tax?: number): RepositoryValue<Invoice>
  recordPayment(invoiceId: string, amount: number, method: PaymentMethod, reference: string | undefined, receivedBy: string): RepositoryValue<Invoice>
  listRadiologyStudies(status?: RadiologyStudyStatus): RepositoryValue<RadiologyStudy[]>
  createRadiologyStudy(
    patientId: string,
    modality: RadiologyModality,
    bodyPart: string,
    priority: RadiologyPriority,
    scheduledAt?: string,
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
  listInsurancePolicies(patientId?: string): RepositoryValue<InsurancePolicy[]>
  createInsurancePolicy(
    patientId: string,
    payerName: string,
    memberNumber: string,
    planName: string,
    coveragePercent: number,
    validFrom: string,
    validTo?: string,
  ): RepositoryValue<InsurancePolicy>
  listInsuranceClaims(status?: InsuranceClaimStatus): RepositoryValue<InsuranceClaim[]>
  createInsuranceClaim(policyId: string, orderId: string | undefined, amount: number): RepositoryValue<InsuranceClaim>
  transitionInsuranceClaim(id: string, nextStatus: InsuranceClaimStatus): RepositoryValue<InsuranceClaim>
  listHomeVisits(patientId?: string, status?: HomeVisitStatus): RepositoryValue<HomeVisit[]>
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

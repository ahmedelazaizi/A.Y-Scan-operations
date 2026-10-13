import { Pool, type PoolClient } from 'pg'
import type {
  CreatePatientInput,
  DashboardSummary,
  LabResult,
  Order,
  Patient,
  ResultFlag,
  Specimen,
  SpecimenStatus,
  TestCatalogItem,
} from '../domain.js'
import { emptyOperationsReport, validateReportQuery, type OperationsReport } from '../reports.js'
import { calculateInvoiceTotals, isInvoiceStatus, isPaymentMethod, normalizePaymentAmount, roundMoney, type Invoice, type InvoiceItem, type InvoiceItemInput, type Payment, type PaymentMethod } from '../billing.js'
import { isRadiologyModality, isRadiologyPriority, isRadiologyStudyStatus, type RadiologyModality, type RadiologyPriority, type RadiologyStudy, type RadiologyStudyStatus } from '../radiology.js'
import {
  movementDelta,
  validateInventoryItemInput,
  validateInventoryMovementInput,
  type InventoryAdjustmentDirection,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementResult,
  type InventoryMovementType,
} from '../inventory.js'
import { normalizeAuditEventInput, normalizeAuditListOptions, sanitizeAuditMetadata, type AuditEvent, type AuditEventInput, type AuditEventListOptions } from '../audit.js'
import {
  canTransitionInsuranceClaim,
  isInsuranceClaimStatus,
  isInsuranceUuid,
  validateInsuranceClaimInput,
  validateInsurancePolicyInput,
  type InsuranceClaim,
  type InsuranceClaimStatus,
  type InsurancePolicy,
} from '../insurance.js'
import {
  canTransitionHomeVisit,
  isHomeVisitStatus,
  isHomeVisitUuid,
  validateCreateHomeVisitInput,
  type HomeVisit,
  type HomeVisitStatus,
} from '../home-visits.js'
import { RepositoryConflictError, RepositoryInputError, RepositoryNotFoundError, type OrderRepository } from './repository.js'

const ORDER_STATUS = 'awaiting_sample'

type StoredPatient = { id: string; fullName: string }

function formatPatient(row: Record<string, unknown>): Patient {
  const patient: Patient = {
    id: String(row.id),
    fullName: String(row.full_name),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
  if (row.phone !== null && row.phone !== undefined) patient.phone = String(row.phone)
  if (row.date_of_birth !== null && row.date_of_birth !== undefined) patient.dateOfBirth = String(row.date_of_birth)
  if (row.sex !== null && row.sex !== undefined) patient.sex = row.sex as Patient['sex']
  return patient
}

function formatCatalogItem(row: Record<string, unknown>): TestCatalogItem {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    specimenType: String(row.specimen_type),
    price: Number(row.price),
    isActive: Boolean(row.is_active),
  }
}

function formatSpecimen(row: Record<string, unknown>): Specimen {
  return {
    id: String(row.id),
    orderId: row.order_number === undefined ? String(row.order_id) : `AY-${row.order_number}`,
    barcode: String(row.barcode),
    specimenType: String(row.specimen_type),
    status: row.status as SpecimenStatus,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    collectedAt: row.collected_at ? new Date(String(row.collected_at)).toISOString() : null,
    rejectedReason: row.rejected_reason ? String(row.rejected_reason) : null,
  }
}

function formatLabResult(row: Record<string, unknown>): LabResult {
  return {
    id: String(row.id),
    orderItemId: String(row.order_item_id),
    resultValue: String(row.result_value),
    unit: row.unit ? String(row.unit) : null,
    referenceRange: row.reference_range ? String(row.reference_range) : null,
    flag: row.flag as ResultFlag,
    status: row.status as LabResult['status'],
    enteredBy: String(row.entered_by),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatRadiologyStudy(row: Record<string, unknown>): RadiologyStudy {
  return {
    id: String(row.id),
    accessionNumber: `RAD-${row.accession_number}`,
    patientId: String(row.patient_id),
    modality: row.modality as RadiologyModality,
    bodyPart: String(row.body_part),
    priority: row.priority as RadiologyPriority,
    status: row.status as RadiologyStudyStatus,
    scheduledAt: row.scheduled_at ? new Date(String(row.scheduled_at)).toISOString() : null,
    performedAt: row.performed_at ? new Date(String(row.performed_at)).toISOString() : null,
    reportText: row.report_text === null || row.report_text === undefined ? null : String(row.report_text),
    impression: row.impression === null || row.impression === undefined ? null : String(row.impression),
    referringProvider: row.referring_provider === null || row.referring_provider === undefined ? null : String(row.referring_provider),
    verifiedBy: row.verified_by === null || row.verified_by === undefined ? null : String(row.verified_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatInventoryItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    category: String(row.category),
    unit: String(row.unit),
    reorderLevel: Number(row.reorder_level),
    quantity: Number(row.quantity),
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatInventoryMovement(row: Record<string, unknown>): InventoryMovement {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    type: row.type as InventoryMovementType,
    quantity: Number(row.quantity),
    adjustmentDirection: row.adjustment_direction === null || row.adjustment_direction === undefined
      ? null
      : row.adjustment_direction as InventoryAdjustmentDirection,
    reason: String(row.reason),
    reference: row.reference === null || row.reference === undefined ? null : String(row.reference),
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

function formatInventoryResult(itemRow: Record<string, unknown>, movementRow: Record<string, unknown>): InventoryMovementResult {
  return { item: formatInventoryItem(itemRow), movement: formatInventoryMovement(movementRow) }
}

function formatAuditEvent(row: Record<string, unknown>): AuditEvent {
  const rawMetadata = row.metadata
  const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
    ? sanitizeAuditMetadata(rawMetadata)
    : {}
  return {
    id: String(row.id),
    actorId: row.actor_id === null || row.actor_id === undefined ? null : String(row.actor_id),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: row.entity_id === null || row.entity_id === undefined ? null : String(row.entity_id),
    metadata,
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
  }
}

function formatInvoice(row: Record<string, unknown>): Invoice {
  const items = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : []
  const payments = Array.isArray(row.payments) ? row.payments as Array<Record<string, unknown>> : []
  return {
    id: String(row.id),
    orderId: row.order_number === undefined ? String(row.order_id) : `AY-${row.order_number}`,
    invoiceNumber: row.invoice_number === undefined ? '' : `INV-${row.invoice_number}`,
    currency: String(row.currency),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    tax: Number(row.tax),
    total: Number(row.total),
    status: row.status as Invoice['status'],
    items: items.map((item): InvoiceItem => ({
      id: String(item.id),
      description: String(item.description),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    payments: payments.map((payment): Payment => ({
      id: String(payment.id),
      amount: Number(payment.amount),
      method: payment.method as Payment['method'],
      reference: payment.reference === null || payment.reference === undefined ? null : String(payment.reference),
      paidAt: new Date(String(payment.paidAt)).toISOString(),
      receivedBy: String(payment.receivedBy),
    })),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatInsurancePolicy(row: Record<string, unknown>): InsurancePolicy {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    payerName: String(row.payer_name),
    memberNumber: String(row.member_number),
    planName: String(row.plan_name),
    status: row.status as InsurancePolicy['status'],
    coveragePercent: Number(row.coverage_percent),
    validFrom: String(row.valid_from),
    validTo: row.valid_to === null || row.valid_to === undefined ? null : String(row.valid_to),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatInsuranceClaim(row: Record<string, unknown>): InsuranceClaim {
  return {
    id: String(row.id),
    claimNumber: `CLM-${row.claim_number}`,
    policyId: String(row.policy_id),
    orderId: row.order_number === null || row.order_number === undefined
      ? null
      : `AY-${row.order_number}`,
    amount: Number(row.amount),
    status: row.status as InsuranceClaimStatus,
    submittedAt: row.submitted_at === null || row.submitted_at === undefined ? null : new Date(String(row.submitted_at)).toISOString(),
    responseCode: row.response_code === null || row.response_code === undefined ? null : String(row.response_code),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatHomeVisit(row: Record<string, unknown>): HomeVisit {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    orderId: row.order_number === null || row.order_number === undefined ? null : `AY-${row.order_number}`,
    address: String(row.address),
    contactPhone: String(row.contact_phone),
    scheduledAt: new Date(String(row.scheduled_at)).toISOString(),
    assignedTo: row.assigned_to === null || row.assigned_to === undefined ? null : String(row.assigned_to),
    status: row.status as HomeVisitStatus,
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function formatOrder(row: Record<string, unknown>): Order {
  return {
    id: `AY-${row.order_number}`,
    patient: String(row.patient_name),
    tests: String(row.tests),
    time: new Date(String(row.created_at)).toISOString(),
    status: row.status as Order['status'],
    state: row.status === ORDER_STATUS ? 'بانتظار العينة' : String(row.status),
    tone: row.status === 'completed' ? 'success' : row.status === ORDER_STATUS ? 'warning' : 'info',
    priority: row.priority as Order['priority'],
  }
}

async function findRecentOrders(pool: Pool): Promise<Order[]> {
  const result = await pool.query(`
    SELECT o.order_number, o.status, o.priority, o.created_at, p.full_name AS patient_name,
           COALESCE(string_agg(tc.name, ' · ' ORDER BY tc.name), '') AS tests
    FROM orders o
    JOIN patients p ON p.id = o.patient_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN test_catalog tc ON tc.id = oi.test_catalog_id
    GROUP BY o.id, p.full_name
    ORDER BY o.created_at DESC
    LIMIT 20
  `)
  return result.rows.map(formatOrder)
}

function dashboardMetrics(): DashboardSummary['metrics'] {
  return [
    { label: 'طلبات اليوم', value: '0', note: 'من قاعدة البيانات', icon: 'receipt', tone: 'cyan' },
    { label: 'عينات قيد المعالجة', value: '0', note: 'من قاعدة البيانات', icon: 'flask', tone: 'orange' },
    { label: 'نتائج جاهزة', value: '0', note: 'من قاعدة البيانات', icon: 'check', tone: 'lime' },
    { label: 'إيرادات اليوم', value: '0', note: 'من قاعدة البيانات', icon: 'chart', tone: 'navy' },
  ]
}

async function findPatient(client: PoolClient, patientId: string): Promise<StoredPatient> {
  const result = await client.query<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM patients WHERE id = $1',
    [patientId],
  )
  const patient = result.rows[0]
  if (!patient) throw new Error('patientId does not reference an existing patient.')
  return { id: patient.id, fullName: patient.full_name }
}

async function insertPatient(client: PoolClient, patientName: string): Promise<StoredPatient> {
  const result = await client.query<{ id: string; full_name: string }>(
    'INSERT INTO patients (full_name) VALUES ($1) RETURNING id, full_name',
    [patientName.trim()],
  )
  return { id: result.rows[0].id, fullName: result.rows[0].full_name }
}

async function insertCatalogTest(client: PoolClient, testName: string): Promise<string> {
  const code = `CUSTOM_${testName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 55) || 'TEST'}`
  const result = await client.query<{ id: string }>(
    `INSERT INTO test_catalog (code, name, specimen_type)
     VALUES ($1, $2, 'unspecified')
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [code, testName.trim()],
  )
  return result.rows[0].id
}

async function insertOrder(client: PoolClient, patientId: string, priority: string): Promise<{ id: string; order_number: number; created_at: Date }> {
  const result = await client.query<{ id: string; order_number: number; created_at: Date }>(
    `INSERT INTO orders (patient_id, priority) VALUES ($1, $2)
     RETURNING id, order_number, created_at`,
    [patientId, priority],
  )
  return result.rows[0]
}

async function resolveOrderPatient(client: PoolClient, patientId: string | undefined, patientName: string | undefined): Promise<StoredPatient> {
  if (patientId) return findPatient(client, patientId)
  if (patientName) return insertPatient(client, patientName)
  throw new Error('A patientId or patientName is required.')
}

async function listPatients(pool: Pool, query: string | undefined, limit: number, offset: number): Promise<Patient[]> {
  const result = await pool.query(
    `SELECT id, full_name, phone, date_of_birth, sex, created_at
     FROM patients
     WHERE ($1 = '' OR full_name ILIKE '%' || $1 || '%' OR COALESCE(phone, '') ILIKE '%' || $1 || '%')
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [query?.trim() ?? '', limit, offset],
  )
  return result.rows.map(formatPatient)
}

async function createPatient(pool: Pool, input: CreatePatientInput): Promise<Patient> {
  const result = await pool.query(
    `INSERT INTO patients (full_name, phone, date_of_birth, sex)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, phone, date_of_birth, sex, created_at`,
    [input.fullName.trim(), input.phone ?? null, input.dateOfBirth ?? null, input.sex ?? null],
  )
  return formatPatient(result.rows[0])
}

async function listCatalog(pool: Pool): Promise<TestCatalogItem[]> {
  const result = await pool.query(
    `SELECT id, code, name, specimen_type, price, is_active
     FROM test_catalog
     ORDER BY is_active DESC, code ASC`,
  )
  return result.rows.map(formatCatalogItem)
}

async function recordAuditEvent(pool: Pool, input: AuditEventInput): Promise<AuditEvent> {
  const event = normalizeAuditEventInput(input)
  const result = await pool.query(
    `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, actor_id, action, entity_type, entity_id, metadata, occurred_at`,
    [event.id, event.actorId, event.action, event.entityType, event.entityId, JSON.stringify(event.metadata), event.occurredAt],
  )
  return formatAuditEvent(result.rows[0])
}

async function listAuditEvents(pool: Pool, options?: AuditEventListOptions): Promise<AuditEvent[]> {
  const normalized = normalizeAuditListOptions(options)
  const result = await pool.query(
    `SELECT id, actor_id, action, entity_type, entity_id, metadata, occurred_at
     FROM audit_events
     WHERE ($1::text IS NULL OR entity_type = $1)
       AND ($2::text IS NULL OR action = $2)
     ORDER BY occurred_at DESC, id DESC
     LIMIT $3`,
    [normalized.entityType || null, normalized.action || null, normalized.limit],
  )
  return result.rows.map(formatAuditEvent)
}

const RADIOLOGY_COLUMNS = `id, accession_number, patient_id, modality, body_part, priority, status,
  scheduled_at, performed_at, report_text, impression, referring_provider, verified_by, created_at, updated_at`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type QueryExecutor = { query: Pool['query'] }

const SPECIMEN_COLUMNS = 's.id, s.order_id, o.order_number, s.barcode, s.specimen_type, s.status, s.created_at, s.updated_at, s.collected_at, s.rejected_reason'
const RESULT_COLUMNS = 'id, order_item_id, result_value, unit, reference_range, flag, status, entered_by, reviewed_by, created_at, updated_at'
const QUALIFIED_RESULT_COLUMNS = RESULT_COLUMNS.split(', ').map((column) => `lr.${column}`).join(', ')
const INSURANCE_POLICY_COLUMNS = 'id, patient_id, payer_name, member_number, plan_name, status, coverage_percent, valid_from, valid_to, created_at, updated_at'
const INSURANCE_CLAIM_SELECT = `
  SELECT c.id, c.claim_number, c.policy_id, c.order_id, o.order_number, c.amount, c.status,
         c.submitted_at, c.response_code, c.notes, c.created_at, c.updated_at
  FROM insurance_claims c
  LEFT JOIN orders o ON o.id = c.order_id`
const HOME_VISIT_COLUMNS = `hv.id, hv.patient_id, hv.order_id, o.order_number, hv.address, hv.contact_phone,
  hv.scheduled_at, hv.assigned_to, hv.status, hv.notes, hv.created_at, hv.updated_at`
const HOME_VISIT_SELECT = `SELECT ${HOME_VISIT_COLUMNS}
  FROM home_visits hv LEFT JOIN orders o ON o.id = hv.order_id`

async function listInsurancePolicies(pool: Pool, patientId: string | undefined): Promise<InsurancePolicy[]> {
  if (patientId !== undefined && !isInsuranceUuid(patientId)) throw new RepositoryInputError('patientId must be a valid UUID.')
  const result = await pool.query(
    `SELECT ${INSURANCE_POLICY_COLUMNS}
     FROM insurance_policies
     WHERE ($1::uuid IS NULL OR patient_id = $1)
     ORDER BY created_at DESC`,
    [patientId ?? null],
  )
  return result.rows.map(formatInsurancePolicy)
}

async function createInsurancePolicy(
  pool: Pool,
  patientId: string,
  payerName: string,
  memberNumber: string,
  planName: string,
  coveragePercent: number,
  validFrom: string,
  validTo?: string,
): Promise<InsurancePolicy> {
  const input = validateInsurancePolicyInput({ patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo })
  if (!input) throw new RepositoryInputError('Insurance policy input is invalid.')
  const patient = await pool.query('SELECT id FROM patients WHERE id = $1', [input.patientId])
  if (!patient.rows[0]) throw new RepositoryNotFoundError('Patient was not found.')
  try {
    const result = await pool.query(
      `INSERT INTO insurance_policies (patient_id, payer_name, member_number, plan_name, coverage_percent, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${INSURANCE_POLICY_COLUMNS}`,
      [input.patientId, input.payerName, input.memberNumber, input.planName, input.coveragePercent, input.validFrom, input.validTo ?? null],
    )
    return formatInsurancePolicy(result.rows[0])
  } catch (error) {
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('Insurance policy member number already exists for this payer.')
    if (isPostgresError(error, '22P02') || isPostgresError(error, '23514')) throw new RepositoryInputError('Insurance policy input is invalid.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Patient was not found.')
    throw error
  }
}

async function findInsuranceClaim(pool: Pool, claimId: string): Promise<InsuranceClaim> {
  const result = await pool.query(`${INSURANCE_CLAIM_SELECT} WHERE c.id = $1`, [claimId])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Insurance claim was not found.')
  return formatInsuranceClaim(result.rows[0])
}

async function listInsuranceClaims(pool: Pool, status: InsuranceClaimStatus | undefined): Promise<InsuranceClaim[]> {
  if (status !== undefined && !isInsuranceClaimStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(`${INSURANCE_CLAIM_SELECT} WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.created_at DESC`, [status ?? null])
  return result.rows.map(formatInsuranceClaim)
}

async function createInsuranceClaim(pool: Pool, policyId: string, orderId: string | undefined, amount: number): Promise<InsuranceClaim> {
  const input = validateInsuranceClaimInput({ policyId, orderId, amount })
  if (!input) throw new RepositoryInputError('Insurance claim input is invalid.')
  const policy = await pool.query('SELECT id FROM insurance_policies WHERE id = $1', [input.policyId])
  if (!policy.rows[0]) throw new RepositoryNotFoundError('Insurance policy was not found.')
  const internalOrderId = input.orderId ? await resolveOrderId(pool, input.orderId) : null
  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO insurance_claims (policy_id, order_id, amount)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.policyId, internalOrderId, input.amount],
    )
    return findInsuranceClaim(pool, result.rows[0].id)
  } catch (error) {
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('Insurance claim input is invalid.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Insurance policy or order was not found.')
    throw error
  }
}

async function transitionInsuranceClaim(pool: Pool, id: string, nextStatus: InsuranceClaimStatus): Promise<InsuranceClaim> {
  if (!isInsuranceUuid(id) || !isInsuranceClaimStatus(nextStatus)) throw new RepositoryInputError('Insurance claim transition input is invalid.')
  const existing = await pool.query<{ status: InsuranceClaimStatus }>('SELECT status FROM insurance_claims WHERE id = $1', [id])
  const claim = existing.rows[0]
  if (!claim) throw new RepositoryNotFoundError('Insurance claim was not found.')
  if (!canTransitionInsuranceClaim(claim.status, nextStatus)) throw new RepositoryConflictError('Insurance claim transition is not allowed.')
  await pool.query(
    `UPDATE insurance_claims
     SET status = $2,
         submitted_at = CASE WHEN $2 = 'submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
         updated_at = now()
     WHERE id = $1`,
    [id, nextStatus],
  )
  return findInsuranceClaim(pool, id)
}

async function findHomeVisit(pool: Pool, id: string): Promise<HomeVisit> {
  const result = await pool.query(`${HOME_VISIT_SELECT} WHERE hv.id = $1`, [id])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Home visit was not found.')
  return formatHomeVisit(result.rows[0])
}

async function listHomeVisits(pool: Pool, patientId: string | undefined, status: HomeVisitStatus | undefined): Promise<HomeVisit[]> {
  if (patientId !== undefined && !isHomeVisitUuid(patientId)) throw new RepositoryInputError('patientId must be a valid UUID.')
  if (status !== undefined && !isHomeVisitStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(
    `${HOME_VISIT_SELECT}
     WHERE ($1::uuid IS NULL OR hv.patient_id = $1)
       AND ($2::text IS NULL OR hv.status = $2)
     ORDER BY hv.scheduled_at ASC, hv.created_at DESC`,
    [patientId ?? null, status ?? null],
  )
  return result.rows.map(formatHomeVisit)
}

async function createHomeVisit(
  pool: Pool,
  patientId: string,
  orderId: string | undefined,
  address: string,
  contactPhone: string,
  scheduledAt: string,
  assignedTo?: string,
  notes?: string,
): Promise<HomeVisit> {
  const input = validateCreateHomeVisitInput({ patientId, orderId: orderId ?? null, address, contactPhone, scheduledAt, assignedTo, notes })
  if (!input) throw new RepositoryInputError('Home visit input is invalid.')
  const patient = await pool.query('SELECT id FROM patients WHERE id = $1', [input.patientId])
  if (!patient.rows[0]) throw new RepositoryNotFoundError('Patient was not found.')
  const normalizedOrderId = input.orderId ?? null
  const internalOrderId = normalizedOrderId === null ? null : await resolveOrderId(pool, normalizedOrderId)
  try {
    const result = await pool.query(
      `INSERT INTO home_visits (patient_id, order_id, address, contact_phone, scheduled_at, assigned_to, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [input.patientId, internalOrderId, input.address, input.contactPhone, input.scheduledAt, input.assignedTo ?? null, input.notes ?? null],
    )
    return findHomeVisit(pool, String(result.rows[0].id))
  } catch (error) {
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError) throw error
    if (isPostgresError(error, '22P02') || isPostgresError(error, '23514')) throw new RepositoryInputError('Home visit input is invalid.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Patient or order was not found.')
    throw error
  }
}

async function transitionHomeVisit(pool: Pool, id: string, nextStatus: HomeVisitStatus): Promise<HomeVisit> {
  if (!isHomeVisitUuid(id) || !isHomeVisitStatus(nextStatus)) throw new RepositoryInputError('Home visit transition input is invalid.')
  const existing = await pool.query<{ status: HomeVisitStatus }>('SELECT status FROM home_visits WHERE id = $1', [id])
  const visit = existing.rows[0]
  if (!visit) throw new RepositoryNotFoundError('Home visit was not found.')
  if (!canTransitionHomeVisit(visit.status, nextStatus)) throw new RepositoryConflictError('Home visit transition is not allowed.')
  await pool.query('UPDATE home_visits SET status = $2, updated_at = now() WHERE id = $1', [id, nextStatus])
  return findHomeVisit(pool, id)
}

function validateRadiologyId(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new RepositoryInputError('id must be a valid UUID.')
}

function validateRadiologyCreateInput(patientId: string, modality: RadiologyModality, bodyPart: string, priority: RadiologyPriority): void {
  if (!UUID_PATTERN.test(patientId) || !isRadiologyModality(modality) || !bodyPart.trim() || bodyPart.trim().length > 200 || !isRadiologyPriority(priority)) {
    throw new RepositoryInputError('Radiology study input is invalid.')
  }
}

async function listRadiologyStudies(pool: Pool, status: RadiologyStudyStatus | undefined): Promise<RadiologyStudy[]> {
  if (status !== undefined && !isRadiologyStudyStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(
    `SELECT ${RADIOLOGY_COLUMNS} FROM radiology_studies
     WHERE ($1::text IS NULL OR status = $1)
     ORDER BY created_at DESC`,
    [status ?? null],
  )
  return result.rows.map(formatRadiologyStudy)
}

async function createRadiologyStudy(
  pool: Pool,
  patientId: string,
  modality: RadiologyModality,
  bodyPart: string,
  priority: RadiologyPriority,
  scheduledAt?: string,
  referringProvider?: string,
): Promise<RadiologyStudy> {
  validateRadiologyCreateInput(patientId, modality, bodyPart, priority)
  if (scheduledAt !== undefined && Number.isNaN(new Date(scheduledAt).getTime())) throw new RepositoryInputError('scheduledAt is invalid.')
  if (referringProvider !== undefined && (!referringProvider.trim() || referringProvider.trim().length > 200)) {
    throw new RepositoryInputError('referringProvider is invalid.')
  }
  const patient = await pool.query('SELECT id FROM patients WHERE id = $1', [patientId])
  if (!patient.rows[0]) throw new RepositoryNotFoundError('Patient was not found.')
  try {
    const result = await pool.query(
      `INSERT INTO radiology_studies (patient_id, modality, body_part, priority, scheduled_at, referring_provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${RADIOLOGY_COLUMNS}`,
      [patientId, modality, bodyPart.trim(), priority, scheduledAt ?? null, referringProvider?.trim() || null],
    )
    return formatRadiologyStudy(result.rows[0])
  } catch (error) {
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('Radiology study input is invalid.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Patient was not found.')
    throw error
  }
}

async function startRadiologyStudy(pool: Pool, id: string): Promise<RadiologyStudy> {
  validateRadiologyId(id)
  return updateRadiologyStudy(pool, id, 'scheduled', `
    SET status = 'in_progress', performed_at = now(), updated_at = now()
  `, 'Radiology study can only start from scheduled status.')
}

async function reportRadiologyStudy(pool: Pool, id: string, reportText: string, impression: string): Promise<RadiologyStudy> {
  validateRadiologyId(id)
  if (!reportText.trim() || !impression.trim()) throw new RepositoryInputError('reportText and impression are required.')
  return updateRadiologyStudy(pool, id, 'in_progress', `
    SET status = 'reported', report_text = $3, impression = $4, updated_at = now()
  `, 'Radiology study can only be reported from in_progress status.', [reportText.trim(), impression.trim()])
}

async function verifyRadiologyStudy(pool: Pool, id: string): Promise<RadiologyStudy> {
  validateRadiologyId(id)
  return updateRadiologyStudy(pool, id, 'reported', `
    SET status = 'verified', verified_by = 'system', updated_at = now()
    WHERE id = $1 AND status = $2 AND report_text IS NOT NULL AND btrim(report_text) <> ''
      AND impression IS NOT NULL AND btrim(impression) <> ''
  `, 'Radiology study can only be verified from reported status.')
}

async function updateRadiologyStudy(
  pool: Pool,
  id: string,
  expectedStatus: RadiologyStudyStatus,
  updateClause: string,
  conflictMessage: string,
  extraParameters: string[] = [],
): Promise<RadiologyStudy> {
  const updateSql = updateClause.includes('WHERE id = $1') ? updateClause : `${updateClause} WHERE id = $1 AND status = $2`
  const parameters = updateClause.includes('$3') ? [id, expectedStatus, ...extraParameters] : [id, expectedStatus]
  const updated = await pool.query(`UPDATE radiology_studies ${updateSql} RETURNING ${RADIOLOGY_COLUMNS}`, parameters)
  if (updated.rows[0]) return formatRadiologyStudy(updated.rows[0])
  const existing = await pool.query('SELECT status FROM radiology_studies WHERE id = $1', [id])
  if (!existing.rows[0]) throw new RepositoryNotFoundError('Radiology study was not found.')
  throw new RepositoryConflictError(conflictMessage)
}

const INVENTORY_ITEM_COLUMNS = 'id, sku, name, category, unit, reorder_level, quantity, is_active, created_at, updated_at'
const INVENTORY_MOVEMENT_COLUMNS = 'id, item_id, type, quantity, adjustment_direction, reason, reference, created_by, created_at'

function validateInventoryId(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new RepositoryInputError('id must be a valid UUID.')
}

async function listInventoryItems(pool: Pool, activeOnly: boolean | undefined): Promise<InventoryItem[]> {
  const result = await pool.query(
    `SELECT ${INVENTORY_ITEM_COLUMNS}
     FROM inventory_items
     WHERE ($1::boolean IS NOT TRUE OR is_active = TRUE)
     ORDER BY name ASC, sku ASC`,
    [activeOnly === true],
  )
  return result.rows.map(formatInventoryItem)
}

async function createInventoryItem(
  pool: Pool,
  sku: string,
  name: string,
  category: string,
  unit: string,
  reorderLevel: number,
): Promise<InventoryItem> {
  const input = validateInventoryItemInput(sku, name, category, unit, reorderLevel)
  try {
    const result = await pool.query(
      `INSERT INTO inventory_items (sku, name, category, unit, reorder_level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${INVENTORY_ITEM_COLUMNS}`,
      [input.sku, input.name, input.category, input.unit, input.reorderLevel],
    )
    return formatInventoryItem(result.rows[0])
  } catch (error) {
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('SKU already exists.')
    if (isPostgresError(error, '22P02') || isPostgresError(error, '23514')) throw new RepositoryInputError('Inventory item input is invalid.')
    throw error
  }
}

async function recordInventoryMovement(
  pool: Pool,
  itemId: string,
  type: InventoryMovementType,
  quantity: number,
  reason: string,
  reference?: string,
  adjustmentDirection?: InventoryAdjustmentDirection,
  createdBy?: string,
): Promise<InventoryMovementResult> {
  validateInventoryId(itemId)
  const input = validateInventoryMovementInput(type, quantity, reason, reference, adjustmentDirection)
  const normalizedCreatedBy = createdBy?.trim() || 'system'
  if (normalizedCreatedBy.length > 200) throw new RepositoryInputError('createdBy is invalid.')
  const delta = movementDelta(input.type, input.quantity, input.adjustmentDirection)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(`SELECT ${INVENTORY_ITEM_COLUMNS} FROM inventory_items WHERE id = $1 FOR UPDATE`, [itemId])
    const item = existing.rows[0]
    if (!item) throw new RepositoryNotFoundError('Inventory item was not found.')
    if (Number(item.quantity) + delta < 0) throw new RepositoryConflictError('Insufficient inventory stock.')

    const updated = await client.query(
      `UPDATE inventory_items
       SET quantity = quantity + $2, updated_at = now()
       WHERE id = $1
       RETURNING ${INVENTORY_ITEM_COLUMNS}`,
      [itemId, delta],
    )
    const movement = await client.query(
      `INSERT INTO inventory_movements (item_id, type, quantity, adjustment_direction, reason, reference, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${INVENTORY_MOVEMENT_COLUMNS}`,
      [itemId, input.type, input.quantity, input.adjustmentDirection ?? null, input.reason, input.reference ?? null, normalizedCreatedBy],
    )
    await client.query('COMMIT')
    return formatInventoryResult(updated.rows[0], movement.rows[0])
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('Inventory movement input is invalid.')
    if (isPostgresError(error, '23514')) throw new RepositoryConflictError('Inventory movement would make stock invalid.')
    throw error
  } finally {
    client.release()
  }
}

async function resolveOrderId(pool: QueryExecutor, publicOrderId: string): Promise<string> {
  const orderNumber = /^AY-(\d+)$/.exec(publicOrderId)?.[1]
  const query = UUID_PATTERN.test(publicOrderId)
    ? ['SELECT id FROM orders WHERE id = $1', publicOrderId]
    : orderNumber
      ? ['SELECT id FROM orders WHERE order_number = $1', orderNumber]
      : null
  if (!query) throw new RepositoryInputError('orderId must be an AY order number or UUID.')
  const result = await pool.query(query[0], [query[1]])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Order was not found.')
  return String(result.rows[0].id)
}

async function findSpecimen(pool: Pool, specimenId: string): Promise<Specimen> {
  const result = await pool.query(
    `SELECT ${SPECIMEN_COLUMNS}
     FROM specimens s JOIN orders o ON o.id = s.order_id
     WHERE s.id = $1`,
    [specimenId],
  )
  if (!result.rows[0]) throw new RepositoryNotFoundError('Specimen was not found.')
  return formatSpecimen(result.rows[0])
}

async function listSpecimens(pool: Pool, status: SpecimenStatus | undefined): Promise<Specimen[]> {
  const result = await pool.query(
    `SELECT ${SPECIMEN_COLUMNS}
     FROM specimens s JOIN orders o ON o.id = s.order_id
     WHERE ($1::text IS NULL OR s.status = $1)
     ORDER BY s.created_at DESC`,
    [status ?? null],
  )
  return result.rows.map(formatSpecimen)
}

async function createSpecimen(pool: Pool, orderId: string, specimenType: string, barcode: string): Promise<Specimen> {
  try {
    const internalOrderId = await resolveOrderId(pool, orderId)
    const result = await pool.query(
      `INSERT INTO specimens (order_id, specimen_type, barcode)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [internalOrderId, specimenType, barcode],
    )
    return findSpecimen(pool, String(result.rows[0].id))
  } catch (error) {
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('orderId must be an AY order number or UUID.')
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('Barcode already exists.')
    throw error
  }
}

async function collectSpecimen(pool: Pool, barcode: string): Promise<Specimen> {
  const updated = await pool.query(
    `UPDATE specimens
     SET status = 'collected', collected_at = now(), updated_at = now()
     WHERE barcode = $1 AND status = 'pending'
     RETURNING id`,
    [barcode],
  )
  if (updated.rows[0]) return findSpecimen(pool, String(updated.rows[0].id))
  const existing = await pool.query('SELECT status FROM specimens WHERE barcode = $1', [barcode])
  if (!existing.rows[0]) throw new RepositoryNotFoundError('Specimen was not found.')
  throw new RepositoryConflictError('Specimen can only be collected from pending status.')
}

async function listResults(pool: Pool, orderId: string | undefined): Promise<LabResult[]> {
  const internalOrderId = orderId ? await resolveOrderId(pool, orderId) : null
  const result = await pool.query(
    `SELECT ${QUALIFIED_RESULT_COLUMNS}
     FROM lab_results lr
     JOIN order_items oi ON oi.id = lr.order_item_id
     WHERE ($1::uuid IS NULL OR oi.order_id = $1::uuid)
     ORDER BY lr.created_at DESC`,
    [internalOrderId],
  )
  return result.rows.map(formatLabResult)
}

async function enterResult(pool: Pool, orderItemId: string, value: string, unit: string | undefined, referenceRange: string | undefined, flag: ResultFlag): Promise<LabResult> {
  try {
    const orderItem = await pool.query('SELECT id FROM order_items WHERE id = $1', [orderItemId])
    if (!orderItem.rows[0]) throw new RepositoryNotFoundError('Order item was not found.')
    const result = await pool.query(
      `INSERT INTO lab_results (order_item_id, result_value, unit, reference_range, flag)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${RESULT_COLUMNS}`,
      [orderItemId, value, unit ?? null, referenceRange ?? null, flag],
    )
    return formatLabResult(result.rows[0])
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('orderItemId must be a valid UUID.')
    throw error
  }
}

async function reviewResult(pool: Pool, id: string): Promise<LabResult> {
  try {
    const updated = await pool.query(
      `UPDATE lab_results
       SET status = CASE status WHEN 'draft' THEN 'in_review' WHEN 'in_review' THEN 'approved' END,
           reviewed_by = 'system', updated_at = now()
       WHERE id = $1 AND status IN ('draft', 'in_review')
       RETURNING ${RESULT_COLUMNS}`,
      [id],
    )
    if (updated.rows[0]) return formatLabResult(updated.rows[0])
    const existing = await pool.query('SELECT status FROM lab_results WHERE id = $1', [id])
    if (!existing.rows[0]) throw new RepositoryNotFoundError('Lab result was not found.')
    throw new RepositoryConflictError('Lab result is not in a reviewable status.')
  } catch (error) {
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('id must be a valid UUID.')
    throw error
  }
}

const INVOICE_SELECT = `
  SELECT i.id, i.order_id, o.order_number, i.invoice_number, i.currency,
         i.subtotal, i.discount, i.tax, i.total, i.status, i.created_at, i.updated_at,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', ii.id, 'description', ii.description, 'quantity', ii.quantity,
             'unitPrice', ii.unit_price, 'lineTotal', ii.line_total
           ) ORDER BY ii.item_index)
           FROM invoice_items ii WHERE ii.invoice_id = i.id
         ), '[]'::json) AS items,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', p.id, 'amount', p.amount, 'method', p.method,
             'reference', p.reference, 'paidAt', p.paid_at, 'receivedBy', p.received_by
           ) ORDER BY p.paid_at, p.id)
           FROM payments p WHERE p.invoice_id = i.id
         ), '[]'::json) AS payments
  FROM invoices i
  JOIN orders o ON o.id = i.order_id`

async function findInvoice(pool: Pool, invoiceId: string): Promise<Invoice> {
  const result = await pool.query(`${INVOICE_SELECT} WHERE i.id = $1`, [invoiceId])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Invoice was not found.')
  return formatInvoice(result.rows[0])
}

async function listInvoices(pool: Pool, status: Invoice['status'] | undefined): Promise<Invoice[]> {
  if (status !== undefined && !isInvoiceStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(`${INVOICE_SELECT} WHERE ($1::text IS NULL OR i.status = $1) ORDER BY i.created_at DESC`, [status ?? null])
  return result.rows.map(formatInvoice)
}

async function createInvoice(pool: Pool, orderId: string, items: InvoiceItemInput[], discount?: number, tax?: number): Promise<Invoice> {
  if (typeof orderId !== 'string' || !orderId.trim()) throw new RepositoryInputError('orderId is invalid.')
  const totals = calculateInvoiceTotals(items, discount, tax)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const internalOrderId = await resolveOrderId(client, orderId.trim())
    const invoiceResult = await client.query<{ id: string }>(
      `INSERT INTO invoices (order_id, subtotal, discount, tax, total)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [internalOrderId, totals.subtotal, totals.discount, totals.tax, totals.total],
    )
    const invoiceId = invoiceResult.rows[0].id
    for (const [itemIndex, item] of totals.items.entries()) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_index, description, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, itemIndex, item.description, item.quantity, item.unitPrice],
      )
    }
    await client.query('COMMIT')
    return findInvoice(pool, invoiceId)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('orderId must be an AY order number or UUID.')
    throw error
  } finally {
    client.release()
  }
}

async function recordPayment(pool: Pool, invoiceId: string, amount: number, method: PaymentMethod, reference?: string): Promise<Invoice> {
  if (typeof invoiceId !== 'string' || !UUID_PATTERN.test(invoiceId)) throw new RepositoryInputError('id must be a valid UUID.')
  if (!isPaymentMethod(method)) throw new RepositoryInputError('method is invalid.')
  const normalizedAmount = normalizePaymentAmount(amount)
  if (reference !== undefined && (typeof reference !== 'string' || reference.trim().length === 0 || reference.trim().length > 200)) {
    throw new RepositoryInputError('reference is invalid.')
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const invoiceResult = await client.query<{ status: string; total: string | number }>(
      'SELECT status, total FROM invoices WHERE id = $1 FOR UPDATE',
      [invoiceId],
    )
    const invoice = invoiceResult.rows[0]
    if (!invoice) throw new RepositoryNotFoundError('Invoice was not found.')
    if (invoice.status === 'void') throw new RepositoryConflictError('Void invoices cannot receive payments.')
    if (invoice.status === 'paid') throw new RepositoryConflictError('Invoice is already paid.')
    if (!['draft', 'issued', 'partially_paid'].includes(invoice.status)) {
      throw new RepositoryConflictError('Invoice is not payable in its current status.')
    }
    const paidResult = await client.query<{ paid: string | number }>(
      'SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1',
      [invoiceId],
    )
    const paidBefore = roundMoney(Number(paidResult.rows[0]?.paid ?? 0))
    const total = roundMoney(Number(invoice.total))
    if (normalizedAmount > roundMoney(total - paidBefore)) throw new RepositoryConflictError('Payment exceeds the invoice balance.')
    await client.query(
      `INSERT INTO payments (invoice_id, amount, method, reference, received_by)
       VALUES ($1, $2, $3, $4, 'system')`,
      [invoiceId, normalizedAmount, method, reference?.trim() || null],
    )
    const paidAfter = roundMoney(paidBefore + normalizedAmount)
    await client.query(
      'UPDATE invoices SET status = $2, updated_at = now() WHERE id = $1',
      [invoiceId, paidAfter >= total ? 'paid' : 'partially_paid'],
    )
    await client.query('COMMIT')
    return findInvoice(pool, invoiceId)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('id must be a valid UUID.')
    throw error
  } finally {
    client.release()
  }
}

function reportDateFilter(column: string): string {
  return `($1::date IS NULL OR ${column} >= $1::date) AND ($2::date IS NULL OR ${column} < ($2::date + INTERVAL '1 day'))`
}

function reportNumber(row: Record<string, unknown>, field: string): number {
  return Number(row[field] ?? 0)
}

async function getOperationsReport(pool: Pool, from?: string, to?: string): Promise<OperationsReport> {
  const period = validateReportQuery({ from, to })
  const result = await pool.query<Record<string, unknown>>(`
    SELECT
      (SELECT COUNT(*) FROM orders o WHERE ${reportDateFilter('o.created_at')}) AS orders_total,
      (SELECT COUNT(*) FROM orders o WHERE ${reportDateFilter('o.created_at')} AND o.status = 'completed') AS orders_completed,
      (SELECT COUNT(*) FROM orders o WHERE ${reportDateFilter('o.created_at')} AND o.status = 'awaiting_sample') AS orders_awaiting_sample,
      (SELECT COUNT(*) FROM orders o WHERE ${reportDateFilter('o.created_at')} AND o.status IN ('processing', 'ready_for_review')) AS orders_in_progress,
      (SELECT COUNT(*) FROM specimens s WHERE ${reportDateFilter('s.created_at')}) AS specimens_total,
      (SELECT COUNT(*) FROM specimens s WHERE ${reportDateFilter('s.created_at')} AND s.status = 'collected') AS specimens_collected,
      (SELECT COUNT(*) FROM specimens s WHERE ${reportDateFilter('s.created_at')} AND s.status = 'processing') AS specimens_processing,
      (SELECT COUNT(*) FROM specimens s WHERE ${reportDateFilter('s.created_at')} AND s.status = 'completed') AS specimens_completed,
      (SELECT COUNT(*) FROM lab_results r WHERE ${reportDateFilter('r.created_at')}) AS results_total,
      (SELECT COUNT(*) FROM lab_results r WHERE ${reportDateFilter('r.created_at')} AND r.status = 'draft') AS results_draft,
      (SELECT COUNT(*) FROM lab_results r WHERE ${reportDateFilter('r.created_at')} AND r.status <> 'draft') AS results_reviewed,
      (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE ${reportDateFilter('i.created_at')} AND i.status <> 'void') AS billing_invoiced,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE ${reportDateFilter('p.paid_at')}) AS billing_paid,
      (SELECT COALESCE(SUM(i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)), 0) FROM invoices i WHERE ${reportDateFilter('i.created_at')} AND i.status <> 'void') AS billing_open,
      (SELECT COUNT(*) FROM radiology_studies r WHERE ${reportDateFilter('r.created_at')}) AS radiology_total,
      (SELECT COUNT(*) FROM radiology_studies r WHERE ${reportDateFilter('r.created_at')} AND r.status = 'scheduled') AS radiology_scheduled,
      (SELECT COUNT(*) FROM radiology_studies r WHERE ${reportDateFilter('r.created_at')} AND r.status = 'in_progress') AS radiology_in_progress,
      (SELECT COUNT(*) FROM radiology_studies r WHERE ${reportDateFilter('r.created_at')} AND r.status = 'reported') AS radiology_reported,
      (SELECT COUNT(*) FROM radiology_studies r WHERE ${reportDateFilter('r.created_at')} AND r.status = 'verified') AS radiology_verified,
      (SELECT COUNT(*) FROM inventory_items i WHERE ${reportDateFilter('i.created_at')} AND i.is_active) AS inventory_items,
      (SELECT COUNT(*) FROM inventory_items i WHERE ${reportDateFilter('i.created_at')} AND i.is_active AND i.quantity <= i.reorder_level) AS inventory_low_stock,
      (SELECT COUNT(*) FROM insurance_claims c WHERE ${reportDateFilter('c.created_at')}) AS insurance_claims_total,
      (SELECT COUNT(*) FROM insurance_claims c WHERE ${reportDateFilter('c.created_at')} AND c.status = 'submitted') AS insurance_submitted,
      (SELECT COUNT(*) FROM insurance_claims c WHERE ${reportDateFilter('c.created_at')} AND c.status = 'approved') AS insurance_approved,
      (SELECT COUNT(*) FROM insurance_claims c WHERE ${reportDateFilter('c.created_at')} AND c.status = 'paid') AS insurance_paid,
      (SELECT COUNT(*) FROM home_visits h WHERE ${reportDateFilter('h.scheduled_at')}) AS home_visits_total,
      (SELECT COUNT(*) FROM home_visits h WHERE ${reportDateFilter('h.scheduled_at')} AND h.status = 'scheduled') AS home_visits_scheduled,
      (SELECT COUNT(*) FROM home_visits h WHERE ${reportDateFilter('h.scheduled_at')} AND h.status = 'in_progress') AS home_visits_in_progress,
      (SELECT COUNT(*) FROM home_visits h WHERE ${reportDateFilter('h.scheduled_at')} AND h.status = 'completed') AS home_visits_completed
  `, [period.from, period.to])
  const row = result.rows[0] ?? {}
  const report = emptyOperationsReport(period)
  report.orders = { total: reportNumber(row, 'orders_total'), completed: reportNumber(row, 'orders_completed'), awaitingSample: reportNumber(row, 'orders_awaiting_sample'), inProgress: reportNumber(row, 'orders_in_progress') }
  report.specimens = { total: reportNumber(row, 'specimens_total'), collected: reportNumber(row, 'specimens_collected'), processing: reportNumber(row, 'specimens_processing'), completed: reportNumber(row, 'specimens_completed') }
  report.results = { total: reportNumber(row, 'results_total'), draft: reportNumber(row, 'results_draft'), reviewed: reportNumber(row, 'results_reviewed') }
  report.billing = { invoiced: reportNumber(row, 'billing_invoiced'), paid: reportNumber(row, 'billing_paid'), open: Math.max(0, reportNumber(row, 'billing_open')) }
  report.radiology = { total: reportNumber(row, 'radiology_total'), scheduled: reportNumber(row, 'radiology_scheduled'), inProgress: reportNumber(row, 'radiology_in_progress'), reported: reportNumber(row, 'radiology_reported'), verified: reportNumber(row, 'radiology_verified') }
  report.inventory = { items: reportNumber(row, 'inventory_items'), lowStock: reportNumber(row, 'inventory_low_stock') }
  report.insurance = { claimsTotal: reportNumber(row, 'insurance_claims_total'), submitted: reportNumber(row, 'insurance_submitted'), approved: reportNumber(row, 'insurance_approved'), paid: reportNumber(row, 'insurance_paid') }
  report.homeVisits = { total: reportNumber(row, 'home_visits_total'), scheduled: reportNumber(row, 'home_visits_scheduled'), inProgress: reportNumber(row, 'home_visits_in_progress'), completed: reportNumber(row, 'home_visits_completed') }
  return report
}

export function createPostgresRepository(databaseUrl: string, poolOverride?: Pool): OrderRepository {
  const pool = poolOverride ?? new Pool({ connectionString: databaseUrl, max: 10 })
  return {
    databaseMode: 'configured',
    listRecent: () => findRecentOrders(pool),
    getDashboard: async () => {
      const recentOrders = await findRecentOrders(pool)
      return {
        metrics: dashboardMetrics(),
        recentOrders,
        samples: { total: recentOrders.length, completionRate: 0, inProgress: 0, completed: 0, needsAttention: 0 },
      }
    },
    getOperationsReport: (from, to) => getOperationsReport(pool, from, to),
    listPatients: (options) => listPatients(pool, options?.query, options?.limit ?? 50, options?.offset ?? 0),
    getPatientById: async (patientId) => {
      const result = await pool.query(
        `SELECT id, full_name, phone, date_of_birth, sex, created_at
         FROM patients WHERE id = $1`,
        [patientId],
      )
      return result.rows[0] ? formatPatient(result.rows[0]) : null
    },
    createPatient: (input) => createPatient(pool, input),
    listCatalog: () => listCatalog(pool),
    createOrder: async (input) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // patientName remains a compatibility fallback; complete duplicate prevention requires patientId.
        const patient = await resolveOrderPatient(client, input.patientId, input.patientName)
        const order = await insertOrder(client, patient.id, input.priority ?? 'normal')
        for (const testName of input.tests) {
          const testId = await insertCatalogTest(client, testName)
          await client.query('INSERT INTO order_items (order_id, test_catalog_id) VALUES ($1, $2)', [order.id, testId])
        }
        await client.query('COMMIT')
        return {
          id: `AY-${order.order_number}`,
          patient: patient.fullName,
          tests: input.tests.join(' · '),
          time: order.created_at.toISOString(),
          status: ORDER_STATUS,
          state: 'بانتظار العينة',
          tone: 'warning',
          priority: input.priority ?? 'normal',
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    listSpecimens: (status) => listSpecimens(pool, status),
    createSpecimen: (orderId, specimenType, barcode) => createSpecimen(pool, orderId, specimenType, barcode),
    collectSpecimen: (barcode) => collectSpecimen(pool, barcode),
    listResults: (orderId) => listResults(pool, orderId),
    enterResult: (orderItemId, value, unit, referenceRange, flag) => enterResult(pool, orderItemId, value, unit, referenceRange, flag),
    reviewResult: (id) => reviewResult(pool, id),
    listInvoices: (status) => listInvoices(pool, status),
    createInvoice: (orderId, items, discount, tax) => createInvoice(pool, orderId, items, discount, tax),
    recordPayment: (invoiceId, amount, method, reference) => recordPayment(pool, invoiceId, amount, method, reference),
    listRadiologyStudies: (status) => listRadiologyStudies(pool, status),
    createRadiologyStudy: (patientId, modality, bodyPart, priority, scheduledAt, referringProvider) => createRadiologyStudy(pool, patientId, modality, bodyPart, priority, scheduledAt, referringProvider),
    startRadiologyStudy: (id) => startRadiologyStudy(pool, id),
    reportRadiologyStudy: (id, reportText, impression) => reportRadiologyStudy(pool, id, reportText, impression),
    verifyRadiologyStudy: (id) => verifyRadiologyStudy(pool, id),
    listInventoryItems: (activeOnly) => listInventoryItems(pool, activeOnly),
    createInventoryItem: (sku, name, category, unit, reorderLevel) => createInventoryItem(pool, sku, name, category, unit, reorderLevel),
    recordInventoryMovement: (itemId, type, quantity, reason, reference, adjustmentDirection, createdBy) => recordInventoryMovement(
      pool, itemId, type, quantity, reason, reference, adjustmentDirection, createdBy,
    ),
    recordAuditEvent: (input) => recordAuditEvent(pool, input),
    listAuditEvents: (options) => listAuditEvents(pool, options),
    listInsurancePolicies: (patientId) => listInsurancePolicies(pool, patientId),
    createInsurancePolicy: (patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo) => createInsurancePolicy(
      pool, patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo,
    ),
    listInsuranceClaims: (status) => listInsuranceClaims(pool, status),
    createInsuranceClaim: (policyId, orderId, amount) => createInsuranceClaim(pool, policyId, orderId, amount),
    transitionInsuranceClaim: (id, nextStatus) => transitionInsuranceClaim(pool, id, nextStatus),
     listHomeVisits: (patientId, status) => listHomeVisits(pool, patientId, status),
     createHomeVisit: (patientId, orderId, address, contactPhone, scheduledAt, assignedTo, notes) => createHomeVisit(
       pool, patientId, orderId, address, contactPhone, scheduledAt, assignedTo, notes,
     ),
     transitionHomeVisit: (id, nextStatus) => transitionHomeVisit(pool, id, nextStatus),
  }
}

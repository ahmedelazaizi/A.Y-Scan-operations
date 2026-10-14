import { randomBytes, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import {
  ORDER_STATE_LABELS,
  ORDER_STATE_TONES,
  type CatalogTestInput,
  type CatalogTestUpdate,
  type CreateOrderInput,
  type CreateReceptionOrderInput,
  type ReceptionOrder,
  type CreatePatientInput,
  type DashboardSummary,
  type LabResult,
  type Order,
  type Patient,
  type ResultFlag,
  type ResultWorklistItem,
  type ReportRelease,
  type Specimen,
  type SpecimenStatus,
  type TestCatalogItem,
} from '../domain.js'
import { emptyOperationsReport, validateReportQuery, type OperationsReport } from '../reports.js'
import { calculateInvoiceTotals, fromMinorUnits, isInvoiceStatus, isPaymentMethod, normalizePaymentAmount, outstandingMinor, roundMoney, toMinorUnits, type Invoice, type InvoiceItem, type InvoiceItemInput, type Payment, type PaymentMethod } from '../billing.js'
import { isRadiologyModality, isRadiologyPriority, isRadiologyStudyStatus, type RadiologyModality, type RadiologyOrderItem, type RadiologyPriority, type RadiologyStudy, type RadiologyStudyStatus } from '../radiology.js'
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
import { checkDeviceConnection as evaluateDeviceConnection, isDeviceUuid, validateCreateDeviceInput, type DeviceConnectionResult, type LabDevice } from '../devices.js'
import { normalizeActor, resolvePage, RepositoryConflictError, RepositoryInputError, RepositoryNotFoundError, type OrderRepository, type PageOptions } from './repository.js'

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
    orderItemId: row.order_item_id == null ? null : String(row.order_item_id),
    testName: row.test_name == null ? null : String(row.test_name),
    tube: row.tube == null ? null : String(row.tube),
    patientName: row.patient_name == null ? null : String(row.patient_name),
    invoiceStatus: row.invoice_status == null ? null : row.invoice_status as Specimen['invoiceStatus'],
    paymentCleared: Boolean(row.payment_cleared),
    receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : null,
  }
}

function formatLabResult(row: Record<string, unknown>): LabResult {
  return {
    id: String(row.id),
    orderItemId: String(row.order_item_id),
    resultValue: String(row.result_value),
    parameterId: row.parameter_id == null ? null : String(row.parameter_id),
    unit: row.unit ? String(row.unit) : null,
    referenceRange: row.reference_range ? String(row.reference_range) : null,
    referenceRangeSnapshot: row.reference_range_snapshot && typeof row.reference_range_snapshot === 'object' ? row.reference_range_snapshot as Record<string, unknown> : null,
    flag: row.flag as ResultFlag,
    status: row.status as LabResult['status'],
    enteredById: row.entered_by_id == null ? null : String(row.entered_by_id),
    enteredBy: String(row.entered_by),
    reviewedById: row.reviewed_by_id == null ? null : String(row.reviewed_by_id),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    version: Number(row.version ?? 1),
    amendmentReason: row.amendment_reason == null ? null : String(row.amendment_reason),
    supersedesResultId: row.supersedes_result_id == null ? null : String(row.supersedes_result_id),
    releasedSnapshotId: row.released_snapshot_id == null ? null : String(row.released_snapshot_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function formatRadiologyStudy(row: Record<string, unknown>): RadiologyStudy {
  return {
    orderItemId: row.order_item_id == null ? null : String(row.order_item_id),
    orderId: row.order_id == null ? null : String(row.order_id),
    publicOrderId: row.public_order_id == null ? null : String(row.public_order_id),
    patientName: row.patient_name == null ? null : String(row.patient_name),
    catalogCode: row.catalog_code == null ? null : String(row.catalog_code),
    catalogName: row.catalog_name == null ? null : String(row.catalog_name),
    invoiceNumber: row.invoice_number == null ? null : `INV-${row.invoice_number}`,
    invoiceStatus: row.invoice_status == null ? null : row.invoice_status as RadiologyStudy['invoiceStatus'],
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

function formatDevice(row: Record<string, unknown>): LabDevice {
  return {
    id: String(row.id),
    name: String(row.name),
    manufacturer: row.manufacturer === null || row.manufacturer === undefined ? null : String(row.manufacturer),
    model: row.model === null || row.model === undefined ? null : String(row.model),
    protocol: row.protocol as LabDevice['protocol'],
    endpoint: String(row.endpoint),
    status: row.status as LabDevice['status'],
    isActive: Boolean(row.is_active),
    lastSeenAt: row.last_seen_at === null || row.last_seen_at === undefined ? null : new Date(String(row.last_seen_at)).toISOString(),
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
    state: ORDER_STATE_LABELS[row.status as Order['status']] ?? String(row.status),
    tone: ORDER_STATE_TONES[row.status as Order['status']] ?? 'info',
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

const IN_PROGRESS_SPECIMEN_STATUSES = "('collected', 'received', 'processing')"

function formatCount(value: unknown): string {
  return Number(value ?? 0).toLocaleString('en-US')
}

/** "Today" follows the session time zone, which the pool sets to the clinic's APP_TIMEZONE. */
async function getDashboard(pool: Pool): Promise<DashboardSummary> {
  const [summary, recentOrders] = await Promise.all([
    pool.query<Record<string, unknown>>(`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('day', now())) AS orders_today,
        (SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('day', now()) AND priority = 'urgent') AS urgent_today,
        (SELECT COUNT(*) FROM specimens WHERE status IN ${IN_PROGRESS_SPECIMEN_STATUSES}) AS specimens_in_progress,
        (SELECT COUNT(*) FROM lab_results WHERE status = 'in_review') AS results_awaiting_review,
        (SELECT COUNT(*) FROM lab_results WHERE status = 'approved' AND updated_at >= date_trunc('day', now())) AS results_approved_today,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE paid_at >= date_trunc('day', now())) AS revenue_today,
        (SELECT COUNT(*) FROM specimens WHERE created_at >= date_trunc('day', now())) AS specimens_today,
        (SELECT COUNT(*) FROM specimens WHERE created_at >= date_trunc('day', now()) AND status = 'completed') AS specimens_completed_today,
        (SELECT COUNT(*) FROM specimens WHERE created_at >= date_trunc('day', now()) AND status IN ${IN_PROGRESS_SPECIMEN_STATUSES}) AS specimens_in_progress_today,
        (SELECT COUNT(*) FROM specimens WHERE status = 'rejected' AND updated_at >= date_trunc('day', now()))
          + (SELECT COUNT(*) FROM lab_results WHERE flag = 'critical' AND status IN ('draft', 'in_review')) AS needs_attention
    `),
    findRecentOrders(pool),
  ])
  const row = summary.rows[0] ?? {}
  const specimensToday = Number(row.specimens_today ?? 0)
  const completedToday = Number(row.specimens_completed_today ?? 0)
  return {
    metrics: [
      { label: 'طلبات اليوم', value: formatCount(row.orders_today), note: `${formatCount(row.urgent_today)} عاجل`, icon: 'receipt', tone: 'cyan' },
      { label: 'عينات قيد المعالجة', value: formatCount(row.specimens_in_progress), note: 'كل العينات المفتوحة', icon: 'flask', tone: 'orange' },
      { label: 'نتائج معتمدة اليوم', value: formatCount(row.results_approved_today), note: `${formatCount(row.results_awaiting_review)} بانتظار المراجعة`, icon: 'check', tone: 'lime' },
      {
        label: 'تحصيل اليوم',
        value: Number(row.revenue_today ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        note: 'جنيه مصري',
        icon: 'chart',
        tone: 'navy',
      },
    ],
    recentOrders,
    samples: {
      total: specimensToday,
      completed: completedToday,
      inProgress: Number(row.specimens_in_progress_today ?? 0),
      needsAttention: Number(row.needs_attention ?? 0),
      completionRate: specimensToday === 0 ? 0 : Math.round((completedToday / specimensToday) * 100),
    },
  }
}

async function findPatient(client: PoolClient, patientId: string): Promise<StoredPatient> {
  const result = await client.query<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM patients WHERE id = $1',
    [patientId],
  )
  const patient = result.rows[0]
  if (!patient) throw new RepositoryNotFoundError('Patient was not found.')
  return { id: patient.id, fullName: patient.full_name }
}

async function findActiveCatalogTests(client: PoolClient, testIds: string[]): Promise<Array<{ id: string; name: string }>> {
  const result = await client.query<{ id: string; name: string }>(
    'SELECT id, name FROM test_catalog WHERE id = ANY($1::uuid[]) AND is_active',
    [testIds],
  )
  const byId = new Map(result.rows.map((row) => [row.id, row]))
  if (testIds.some((id) => !byId.has(id))) throw new RepositoryInputError('One or more tests are not in the active catalog.')
  return testIds.map((id) => byId.get(id) as { id: string; name: string })
}

async function insertOrder(client: PoolClient, patientId: string, priority: string): Promise<{ id: string; order_number: number; created_at: Date }> {
  const result = await client.query<{ id: string; order_number: number; created_at: Date }>(
    `INSERT INTO orders (patient_id, priority) VALUES ($1, $2)
     RETURNING id, order_number, created_at`,
    [patientId, priority],
  )
  return result.rows[0]
}

async function createOrder(pool: Pool, input: CreateOrderInput): Promise<Order> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const patient = await findPatient(client, input.patientId)
    const tests = await findActiveCatalogTests(client, input.testIds)
    const order = await insertOrder(client, patient.id, input.priority ?? 'normal')
    await client.query(
      'INSERT INTO order_items (order_id, test_catalog_id) SELECT $1, unnest($2::uuid[])',
      [order.id, tests.map((test) => test.id)],
    )
    await client.query('COMMIT')
    return {
      id: `AY-${order.order_number}`,
      patient: patient.fullName,
      tests: tests.map((test) => test.name).join(' · '),
      time: order.created_at.toISOString(),
      status: ORDER_STATUS,
      state: ORDER_STATE_LABELS[ORDER_STATUS],
      tone: 'warning',
      priority: input.priority ?? 'normal',
    }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('patientId and testIds must be valid UUIDs.')
    throw error
  } finally {
    client.release()
  }
}

const CATALOG_COLUMNS = 'id, code, name, specimen_type, price, is_active'

async function createCatalogTest(pool: Pool, input: CatalogTestInput): Promise<TestCatalogItem> {
  try {
    const result = await pool.query(
      `INSERT INTO test_catalog (code, name, specimen_type, price, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CATALOG_COLUMNS}`,
      [input.code, input.name, input.specimenType, roundMoney(input.price), input.isActive],
    )
    return formatCatalogItem(result.rows[0])
  } catch (error) {
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('A test with this code already exists.')
    if (isPostgresError(error, '23514')) throw new RepositoryInputError('Catalog test input is invalid.')
    throw error
  }
}

async function updateCatalogTest(pool: Pool, id: string, update: CatalogTestUpdate): Promise<TestCatalogItem> {
  if (!UUID_PATTERN.test(id)) throw new RepositoryInputError('id must be a valid UUID.')
  try {
    const result = await pool.query(
      `UPDATE test_catalog
       SET name = COALESCE($2, name),
           specimen_type = COALESCE($3, specimen_type),
           price = COALESCE($4, price),
           is_active = COALESCE($5, is_active),
           updated_at = now()
       WHERE id = $1
       RETURNING ${CATALOG_COLUMNS}`,
      [id, update.name ?? null, update.specimenType ?? null, update.price === undefined ? null : roundMoney(update.price), update.isActive ?? null],
    )
    if (!result.rows[0]) throw new RepositoryNotFoundError('Catalog test was not found.')
    return formatCatalogItem(result.rows[0])
  } catch (error) {
    if (isPostgresError(error, '23514')) throw new RepositoryInputError('Catalog test input is invalid.')
    throw error
  }
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
     ORDER BY is_active DESC, name ASC`,
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

const RADIOLOGY_COLUMNS = `r.id, r.accession_number, r.patient_id, r.order_item_id, r.modality, r.body_part, r.priority, r.status,
  r.scheduled_at, r.performed_at, r.report_text, r.impression, r.referring_provider, r.verified_by, r.created_at, r.updated_at,
  o.id AS order_id, CASE WHEN o.id IS NULL THEN NULL ELSE 'AY-' || o.order_number::text END AS public_order_id,
  p.full_name AS patient_name, tc.code AS catalog_code, tc.name AS catalog_name,
  inv.invoice_number, inv.status AS invoice_status`
const RADIOLOGY_JOINS = `FROM radiology_studies r
  LEFT JOIN order_items oi ON oi.id = r.order_item_id
  LEFT JOIN orders o ON o.id = oi.order_id
  LEFT JOIN patients p ON p.id = o.patient_id
  LEFT JOIN test_catalog tc ON tc.id = oi.test_catalog_id
  LEFT JOIN LATERAL (SELECT invoice_number, status FROM invoices WHERE order_id = o.id ORDER BY created_at DESC, id DESC LIMIT 1) inv ON true`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type QueryExecutor = { query: Pool['query'] }

const SPECIMEN_COLUMNS = `s.id, s.order_id, o.order_number, s.barcode, s.specimen_type, s.status, s.created_at, s.updated_at, s.collected_at, s.rejected_reason, s.order_item_id, s.tube, s.received_at, tc.name AS test_name, p.full_name AS patient_name, inv.status AS invoice_status, (EXISTS (SELECT 1 FROM invoices active WHERE active.order_id = o.id AND active.status <> 'void') AND NOT EXISTS (SELECT 1 FROM invoices active WHERE active.order_id = o.id AND active.status <> 'void' AND COALESCE((SELECT SUM(payment.amount) FROM payments payment WHERE payment.invoice_id = active.id), 0) < active.total)) AS payment_cleared`
const RESULT_COLUMNS = 'id, order_item_id, parameter_id, result_value, unit, reference_range, reference_range_snapshot, flag, status, entered_by_id, entered_by, reviewed_by_id, reviewed_by, version, amendment_reason, supersedes_result_id, released_snapshot_id, created_at, updated_at'
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

async function listInsurancePolicies(pool: Pool, patientId: string | undefined, page: PageOptions): Promise<InsurancePolicy[]> {
  if (patientId !== undefined && !isInsuranceUuid(patientId)) throw new RepositoryInputError('patientId must be a valid UUID.')
  const result = await pool.query(
    `SELECT ${INSURANCE_POLICY_COLUMNS}
     FROM insurance_policies
     WHERE ($1::uuid IS NULL OR patient_id = $1)
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [patientId ?? null, page.limit, page.offset],
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

async function listInsuranceClaims(pool: Pool, status: InsuranceClaimStatus | undefined, page: PageOptions): Promise<InsuranceClaim[]> {
  if (status !== undefined && !isInsuranceClaimStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(`${INSURANCE_CLAIM_SELECT} WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`, [status ?? null, page.limit, page.offset])
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
  // Compare-and-set on the status we validated, so two concurrent transitions cannot both succeed.
  const updated = await pool.query(
    `UPDATE insurance_claims
     SET status = $2,
         submitted_at = CASE WHEN $2 = 'submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
         updated_at = now()
     WHERE id = $1 AND status = $3`,
    [id, nextStatus, claim.status],
  )
  if (updated.rowCount === 0) throw new RepositoryConflictError('Insurance claim was changed by another user; reload and try again.')
  return findInsuranceClaim(pool, id)
}

async function findHomeVisit(pool: Pool, id: string): Promise<HomeVisit> {
  const result = await pool.query(`${HOME_VISIT_SELECT} WHERE hv.id = $1`, [id])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Home visit was not found.')
  return formatHomeVisit(result.rows[0])
}

async function listHomeVisits(pool: Pool, patientId: string | undefined, status: HomeVisitStatus | undefined, page: PageOptions): Promise<HomeVisit[]> {
  if (patientId !== undefined && !isHomeVisitUuid(patientId)) throw new RepositoryInputError('patientId must be a valid UUID.')
  if (status !== undefined && !isHomeVisitStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(
    `${HOME_VISIT_SELECT}
     WHERE ($1::uuid IS NULL OR hv.patient_id = $1)
       AND ($2::text IS NULL OR hv.status = $2)
     ORDER BY hv.scheduled_at ASC, hv.created_at DESC
     LIMIT $3 OFFSET $4`,
    [patientId ?? null, status ?? null, page.limit, page.offset],
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
  // Compare-and-set on the status we validated, so two concurrent transitions cannot both succeed.
  const updated = await pool.query('UPDATE home_visits SET status = $2, updated_at = now() WHERE id = $1 AND status = $3', [id, nextStatus, visit.status])
  if (updated.rowCount === 0) throw new RepositoryConflictError('Home visit was changed by another user; reload and try again.')
  return findHomeVisit(pool, id)
}

function validateRadiologyId(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new RepositoryInputError('id must be a valid UUID.')
}

function validateRadiologyCreateInput(orderItemId: string, modality: RadiologyModality, bodyPart: string, priority: RadiologyPriority, scheduledAt: string): void {
  if (!UUID_PATTERN.test(orderItemId) || !isRadiologyModality(modality) || !bodyPart.trim() || bodyPart.trim().length > 200 || !isRadiologyPriority(priority) || Number.isNaN(new Date(scheduledAt).getTime())) {
    throw new RepositoryInputError('Radiology study input is invalid.')
  }
}

async function getRadiologyStudy(pool: Pool, id: string): Promise<RadiologyStudy> {
  const result = await pool.query(`SELECT ${RADIOLOGY_COLUMNS} ${RADIOLOGY_JOINS} WHERE r.id = $1`, [id])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Radiology study was not found.')
  return formatRadiologyStudy(result.rows[0])
}

async function listRadiologyStudies(pool: Pool, status: RadiologyStudyStatus | undefined, page: PageOptions): Promise<RadiologyStudy[]> {
  if (status !== undefined && !isRadiologyStudyStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(
    `SELECT ${RADIOLOGY_COLUMNS} ${RADIOLOGY_JOINS}
     WHERE ($1::text IS NULL OR r.status = $1)
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status ?? null, page.limit, page.offset],
  )
  return result.rows.map(formatRadiologyStudy)
}

async function listRadiologyOrderItems(pool: Pool, page: PageOptions): Promise<RadiologyOrderItem[]> {
  const result = await pool.query(`SELECT oi.id AS order_item_id, o.id AS order_id, 'AY-' || o.order_number::text AS public_order_id,
      p.id AS patient_id, p.full_name AS patient_name, tc.code AS catalog_code, tc.name AS catalog_name,
      inv.invoice_number, inv.status AS invoice_status
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    JOIN patients p ON p.id = o.patient_id JOIN test_catalog tc ON tc.id = oi.test_catalog_id
    JOIN LATERAL (SELECT invoice_number, status FROM invoices WHERE order_id = o.id ORDER BY created_at DESC, id DESC LIMIT 1) inv ON true
    WHERE tc.kind = 'radiology' AND tc.is_fee = false AND o.status <> 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM radiology_studies rs WHERE rs.order_item_id = oi.id)
    ORDER BY o.created_at DESC, oi.id LIMIT $1 OFFSET $2`, [page.limit, page.offset])
  return result.rows.map((row): RadiologyOrderItem => ({
    orderItemId: String(row.order_item_id), orderId: String(row.order_id), publicOrderId: String(row.public_order_id),
    patientId: String(row.patient_id), patientName: String(row.patient_name), catalogCode: String(row.catalog_code),
    catalogName: String(row.catalog_name), invoiceNumber: `INV-${row.invoice_number}`, invoiceStatus: row.invoice_status as RadiologyOrderItem['invoiceStatus'],
  }))
}

async function createRadiologyStudy(
  pool: Pool,
  orderItemId: string,
  modality: RadiologyModality,
  bodyPart: string,
  priority: RadiologyPriority,
  scheduledAt: string,
  referringProvider?: string,
): Promise<RadiologyStudy> {
  validateRadiologyCreateInput(orderItemId, modality, bodyPart, priority, scheduledAt)
  if (referringProvider !== undefined && (!referringProvider.trim() || referringProvider.trim().length > 200)) throw new RepositoryInputError('referringProvider is invalid.')
  const linked = await pool.query<Record<string, unknown>>(`SELECT oi.id, oi.order_id, o.patient_id, o.order_number, o.status AS order_status,
      tc.kind, tc.is_fee, EXISTS (SELECT 1 FROM invoices WHERE order_id = o.id) AS has_invoice
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN test_catalog tc ON tc.id = oi.test_catalog_id
    WHERE oi.id = $1`, [orderItemId])
  const item = linked.rows[0]
  if (!item) throw new RepositoryNotFoundError('Radiology order item was not found.')
  if (item.kind !== 'radiology' || item.is_fee === true) throw new RepositoryInputError('Order item must be a radiology service, not a fee.')
  if (item.order_status === 'cancelled') throw new RepositoryConflictError('Cancelled orders cannot be scheduled for radiology.')
  if (!item.has_invoice) throw new RepositoryConflictError('Radiology order item requires an invoice.')
  try {
    const inserted = await pool.query<{ id: string }>(`INSERT INTO radiology_studies (patient_id, order_item_id, modality, body_part, priority, scheduled_at, referring_provider)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [item.patient_id, orderItemId, modality, bodyPart.trim(), priority, scheduledAt, referringProvider?.trim() || null])
    return getRadiologyStudy(pool, inserted.rows[0].id)
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('Radiology study input is invalid.')
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('Radiology order item already has a study.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Radiology order item was not found.')
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

async function verifyRadiologyStudy(pool: Pool, id: string, verifiedBy: string): Promise<RadiologyStudy> {
  validateRadiologyId(id)
  return updateRadiologyStudy(pool, id, 'reported', `
    SET status = 'verified', verified_by = $3, updated_at = now()
    WHERE id = $1 AND status = $2 AND report_text IS NOT NULL AND btrim(report_text) <> ''
      AND impression IS NOT NULL AND btrim(impression) <> ''
  `, 'Radiology study can only be verified from reported status.', [normalizeActor(verifiedBy)])
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
  const updated = await pool.query<{ id: string }>(`UPDATE radiology_studies ${updateSql} RETURNING id`, parameters)
  if (updated.rows[0]) return getRadiologyStudy(pool, updated.rows[0].id)
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
  reference: string | undefined,
  adjustmentDirection: InventoryAdjustmentDirection | undefined,
  createdBy: string,
): Promise<InventoryMovementResult> {
  validateInventoryId(itemId)
  const input = validateInventoryMovementInput(type, quantity, reason, reference, adjustmentDirection)
  const normalizedCreatedBy = normalizeActor(createdBy)
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
     JOIN patients p ON p.id = o.patient_id
     LEFT JOIN order_items oi ON oi.id = s.order_item_id
     LEFT JOIN test_catalog tc ON tc.id = oi.test_catalog_id
     LEFT JOIN LATERAL (SELECT id, status, total FROM invoices WHERE order_id = o.id ORDER BY created_at DESC, id DESC LIMIT 1) inv ON true
     WHERE s.id = $1`,
    [specimenId],
  )
  if (!result.rows[0]) throw new RepositoryNotFoundError('Specimen was not found.')
  return formatSpecimen(result.rows[0])
}

async function listSpecimens(pool: Pool, status: SpecimenStatus | undefined, page: PageOptions): Promise<Specimen[]> {
  const result = await pool.query(
    `SELECT ${SPECIMEN_COLUMNS}
     FROM specimens s JOIN orders o ON o.id = s.order_id
     JOIN patients p ON p.id = o.patient_id
     LEFT JOIN order_items oi ON oi.id = s.order_item_id
     LEFT JOIN test_catalog tc ON tc.id = oi.test_catalog_id
     LEFT JOIN LATERAL (SELECT id, status, total FROM invoices WHERE order_id = o.id ORDER BY created_at DESC, id DESC LIMIT 1) inv ON true
     WHERE ($1::text IS NULL OR s.status = $1)
     ORDER BY s.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status ?? null, page.limit, page.offset],
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

async function collectSpecimen(pool: Pool, barcode: string, mode: 'payment-required' | 'manager-override'): Promise<Specimen> {
  const updated = await pool.query<{ id: string }>(
    `UPDATE specimens s
     SET status = 'collected', collected_at = now(), updated_at = now()
     WHERE s.barcode = $1 AND s.status = 'pending'
       AND ($2::text = 'manager-override' OR (
         EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = s.order_id AND i.status <> 'void')
         AND NOT EXISTS (
           SELECT 1 FROM invoices i WHERE i.order_id = s.order_id AND i.status <> 'void'
             AND COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) < i.total
         )
       ))
     RETURNING s.id`, [barcode, mode],
  )
  if (updated.rows[0]) return findSpecimen(pool, String(updated.rows[0].id))
  const existing = await pool.query<{ status: string }>('SELECT status FROM specimens WHERE barcode = $1', [barcode])
  if (!existing.rows[0]) throw new RepositoryNotFoundError('Specimen was not found.')
  if (existing.rows[0].status !== 'pending') throw new RepositoryConflictError('Specimen can only be collected from pending status.')
  throw new RepositoryConflictError('Specimen collection requires full invoice payment.')
}

async function rejectSpecimen(pool: Pool, barcode: string, reason: string): Promise<Specimen> {
  const updated = await pool.query<{ id: string }>(`UPDATE specimens SET status = 'rejected', rejected_reason = $2, updated_at = now() WHERE barcode = $1 AND status IN ('pending', 'collected') RETURNING id`, [barcode, reason])
  if (!updated.rows[0]) {
    const existing = await pool.query('SELECT 1 FROM specimens WHERE barcode = $1', [barcode])
    if (!existing.rows[0]) throw new RepositoryNotFoundError('Specimen was not found.')
    throw new RepositoryConflictError('Specimen can only be rejected from pending or collected status.')
  }
  return findSpecimen(pool, updated.rows[0].id)
}

async function receiveSpecimen(pool: Pool, barcode: string): Promise<Specimen> {
  const updated = await pool.query<{ id: string }>(`UPDATE specimens SET status = 'received', received_at = now(), updated_at = now() WHERE barcode = $1 AND status = 'collected' RETURNING id`, [barcode])
  if (!updated.rows[0]) {
    const existing = await pool.query('SELECT 1 FROM specimens WHERE barcode = $1', [barcode])
    if (!existing.rows[0]) throw new RepositoryNotFoundError('Specimen was not found.')
    throw new RepositoryConflictError('Specimen can only be received from collected status.')
  }
  return findSpecimen(pool, updated.rows[0].id)
}

async function listResultWorklist(pool: Pool, page: PageOptions): Promise<ResultWorklistItem[]> {
  const rows = await pool.query(`SELECT o.id AS order_id, o.order_number, o.created_at AS order_date, p.full_name AS patient_name,
    p.sex AS patient_sex, p.date_of_birth, oi.id AS order_item_id, tc.id AS catalog_id, tc.code AS catalog_code,
    tc.name AS catalog_name, tc.kind AS catalog_kind, s.id AS specimen_id, s.barcode, s.specimen_type, s.tube, s.status
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN patients p ON p.id = o.patient_id
    JOIN test_catalog tc ON tc.id = oi.test_catalog_id JOIN specimens s ON s.order_item_id = oi.id
    WHERE tc.kind = 'lab' AND s.status IN ('received', 'processing')
    ORDER BY o.created_at, tc.name, s.created_at LIMIT $1 OFFSET $2`, [page.limit, page.offset])
  return rows.rows.map((row): ResultWorklistItem => ({ orderId: String(row.order_id), publicOrderId: `AY-${row.order_number}`, patientName: String(row.patient_name), patientSex: row.patient_sex as ResultWorklistItem['patientSex'], patientDateOfBirth: row.date_of_birth == null ? null : String(row.date_of_birth), orderDate: new Date(String(row.order_date)).toISOString(), orderItemId: String(row.order_item_id), catalogId: String(row.catalog_id), catalogCode: String(row.catalog_code), catalogName: String(row.catalog_name), catalogKind: row.catalog_kind as ResultWorklistItem['catalogKind'], specimenId: String(row.specimen_id), specimenBarcode: String(row.barcode), specimenType: String(row.specimen_type), tube: row.tube == null ? null : String(row.tube), specimenStatus: row.status as SpecimenStatus }))
}

async function listResults(pool: Pool, orderId: string | undefined, page: PageOptions): Promise<LabResult[]> {
  const internalOrderId = orderId ? await resolveOrderId(pool, orderId) : null
  const result = await pool.query(
    `SELECT ${QUALIFIED_RESULT_COLUMNS}
     FROM lab_results lr
     JOIN order_items oi ON oi.id = lr.order_item_id
     WHERE ($1::uuid IS NULL OR oi.order_id = $1::uuid)
     ORDER BY lr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [internalOrderId, page.limit, page.offset],
  )
  return result.rows.map(formatLabResult)
}

async function enterResult(pool: Pool, orderItemId: string, value: string, unit: string | undefined, referenceRange: string | undefined, flag: ResultFlag, enteredBy: string, enteredById?: string, parameterId?: string, rangeSnapshot?: Record<string, unknown>): Promise<LabResult> {
  try {
    const eligible = await pool.query(`SELECT oi.id FROM order_items oi JOIN test_catalog tc ON tc.id = oi.test_catalog_id
      JOIN specimens s ON s.order_item_id = oi.id WHERE oi.id = $1 AND tc.kind = 'lab' AND s.status IN ('received', 'processing')`, [orderItemId])
    if (!eligible.rows[0]) throw new RepositoryConflictError('Result requires a received or processing lab specimen.')
    const inserted = await pool.query(
      `INSERT INTO lab_results (order_item_id, parameter_id, result_value, unit, reference_range, reference_range_snapshot, flag, entered_by_id, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) RETURNING ${RESULT_COLUMNS}`,
      [orderItemId, parameterId ?? null, value, unit ?? null, referenceRange ?? null, JSON.stringify(rangeSnapshot ?? null), flag, enteredById ?? null, normalizeActor(enteredBy)],
    )
    return formatLabResult(inserted.rows[0])
  } catch (error) {
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('Result identifiers must be valid UUIDs.')
    throw error
  }
}

async function reviewResult(pool: Pool, id: string, reviewedBy: string, reviewedById?: string): Promise<LabResult> {
  try {
    const updated = await pool.query(
      `UPDATE lab_results SET status = CASE status WHEN 'draft' THEN 'in_review' WHEN 'in_review' THEN 'approved' END,
       reviewed_by = $2, reviewed_by_id = $3, updated_at = now()
       WHERE id = $1 AND status IN ('draft', 'in_review')
         AND NOT (status = 'in_review' AND ($3::uuid IS NULL OR entered_by_id = $3::uuid))
       RETURNING ${RESULT_COLUMNS}`,
      [id, normalizeActor(reviewedBy), reviewedById ?? null],
    )
    if (updated.rows[0]) return formatLabResult(updated.rows[0])
    const existing = await pool.query<{ status: string; entered_by_id: string | null }>('SELECT status, entered_by_id FROM lab_results WHERE id = $1', [id])
    if (!existing.rows[0]) throw new RepositoryNotFoundError('Lab result was not found.')
    if (existing.rows[0].status === 'in_review' && (!reviewedById || existing.rows[0].entered_by_id === reviewedById)) throw new RepositoryConflictError('A different user identity is required to approve the result.')
    throw new RepositoryConflictError('Lab result is not in a reviewable status.')
  } catch (error) {
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('id and actor identifiers must be valid UUIDs.')
    throw error
  }
}

async function amendResult(pool: Pool, id: string, value: string, unit: string | undefined, referenceRange: string | undefined, flag: ResultFlag, reason: string, enteredBy: string, enteredById?: string, parameterId?: string, rangeSnapshot?: Record<string, unknown>): Promise<LabResult> {
  if (!reason.trim()) throw new RepositoryInputError('Amendment reason is required.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const prior = await client.query<Record<string, unknown>>(`SELECT ${RESULT_COLUMNS} FROM lab_results WHERE id = $1 FOR UPDATE`, [id])
    const previous = prior.rows[0]
    if (!previous) throw new RepositoryNotFoundError('Lab result was not found.')
    if (!['approved', 'released', 'amended'].includes(String(previous.status))) throw new RepositoryConflictError('Only approved or released results can be amended.')
    const child = await client.query('SELECT 1 FROM lab_results WHERE supersedes_result_id = $1 LIMIT 1', [id])
    if (child.rows[0]) throw new RepositoryConflictError('This result version already has an amendment.')
    const inserted = await client.query(`INSERT INTO lab_results (order_item_id, parameter_id, result_value, unit, reference_range, reference_range_snapshot, flag, status, entered_by_id, entered_by, version, amendment_reason, supersedes_result_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'draft', $8, $9, $10, $11, $12) RETURNING ${RESULT_COLUMNS}`,
    [previous.order_item_id, parameterId ?? previous.parameter_id, value, unit ?? null, referenceRange ?? null, JSON.stringify(rangeSnapshot ?? null), flag, enteredById ?? null, normalizeActor(enteredBy), Number(previous.version) + 1, reason.trim(), id])
    await client.query('COMMIT')
    return formatLabResult(inserted.rows[0])
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('id and actor identifiers must be valid UUIDs.')
    throw error
  } finally { client.release() }
}

async function releaseReport(pool: Pool, orderId: string, releasedById: string, contentSnapshot: Record<string, unknown>, settingsSnapshot: Record<string, unknown>): Promise<ReportRelease> {
  if (!UUID_PATTERN.test(releasedById)) throw new RepositoryInputError('releasedById must be a valid UUID.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const internalOrderId = await resolveOrderId(client, orderId)
    const locked = await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [internalOrderId])
    if (!locked.rows[0]) throw new RepositoryNotFoundError('Order was not found.')
    const inserted = await client.query<Record<string, unknown>>(`INSERT INTO report_releases (order_id, version, verification_token, released_by_id, content_snapshot, settings_snapshot)
      SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, $4::jsonb, $5::jsonb FROM report_releases WHERE order_id = $1
      RETURNING id, order_id, version, verification_token, released_by_id, released_at, content_snapshot, settings_snapshot`,
    [internalOrderId, randomBytes(32).toString('base64url'), releasedById, JSON.stringify(contentSnapshot), JSON.stringify(settingsSnapshot)])
    const release = inserted.rows[0]
    await client.query(`UPDATE lab_results lr SET status = 'released', released_snapshot_id = $2, updated_at = now()
      FROM order_items oi WHERE lr.order_item_id = oi.id AND oi.order_id = $1 AND lr.status = 'approved'`, [internalOrderId, release.id])
    await client.query('COMMIT')
    return formatReportRelease(release)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('orderId and releasedById must be valid identifiers.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Releasing user or order was not found.')
    throw error
  } finally { client.release() }
}

function formatReportRelease(row: Record<string, unknown>): ReportRelease {
  return { id: String(row.id), orderId: String(row.order_id), version: Number(row.version), verificationToken: String(row.verification_token), releasedById: String(row.released_by_id), releasedAt: new Date(String(row.released_at)).toISOString(), contentSnapshot: row.content_snapshot as Record<string, unknown>, settingsSnapshot: row.settings_snapshot as Record<string, unknown> }
}

async function getReportRelease(pool: Pool, id: string): Promise<ReportRelease | null> {
  if (!UUID_PATTERN.test(id)) throw new RepositoryInputError('id must be a valid UUID.')
  const found = await pool.query(`SELECT id, order_id, version, verification_token, released_by_id, released_at, content_snapshot, settings_snapshot FROM report_releases WHERE id = $1`, [id])
  return found.rows[0] ? formatReportRelease(found.rows[0]) : null
}

async function listReportReleases(pool: Pool, orderId: string): Promise<ReportRelease[]> {
  const internalOrderId = await resolveOrderId(pool, orderId)
  const found = await pool.query(`SELECT id, order_id, version, verification_token, released_by_id, released_at, content_snapshot, settings_snapshot FROM report_releases WHERE order_id = $1 ORDER BY version DESC`, [internalOrderId])
  return found.rows.map(formatReportRelease)
}

async function getPublicReportVerification(pool: Pool, token: string): Promise<import('../domain.js').PublicReportVerification | null> {
  const found = await pool.query(`SELECT rr.version, rr.released_at,
    jsonb_strip_nulls(jsonb_build_object('nameAr', rr.settings_snapshot->'nameAr', 'nameEn', rr.settings_snapshot->'nameEn', 'licenseNumber', rr.settings_snapshot->'licenseNumber')) AS lab_identity
    FROM report_releases rr WHERE rr.verification_token = $1`, [token])
  const row = found.rows[0]
  return row ? { authentic: true, version: Number(row.version), issuedAt: new Date(String(row.released_at)).toISOString(), labIdentity: row.lab_identity as Record<string, unknown> } : null
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

async function listInvoices(pool: Pool, status: Invoice['status'] | undefined, page: PageOptions): Promise<Invoice[]> {
  if (status !== undefined && !isInvoiceStatus(status)) throw new RepositoryInputError('status is invalid.')
  const result = await pool.query(`${INVOICE_SELECT} WHERE ($1::text IS NULL OR i.status = $1) ORDER BY i.created_at DESC LIMIT $2 OFFSET $3`, [status ?? null, page.limit, page.offset])
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

async function findReceptionOrder(pool: QueryExecutor, internalOrderId: string): Promise<ReceptionOrder> {
  const orderResult = await pool.query<Record<string, unknown>>(`
    SELECT o.id, o.order_number, o.patient_id, o.status, o.priority, o.created_at, o.fasting, o.diagnosis,
           o.practitioner_id, o.insurance_coverage_piastres, p.full_name AS patient_name,
           pr.name_ar AS practitioner_name,
           COALESCE(string_agg(DISTINCT tc.name, ' · ' ORDER BY tc.name), '') AS tests
    FROM orders o JOIN patients p ON p.id = o.patient_id
    LEFT JOIN practitioners pr ON pr.id = o.practitioner_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN test_catalog tc ON tc.id = oi.test_catalog_id
    WHERE o.id = $1
    GROUP BY o.id, p.full_name, pr.name_ar`, [internalOrderId])
  const row = orderResult.rows[0]
  if (!row) throw new RepositoryNotFoundError('Order was not found.')
  const invoiceResult = await pool.query(`${INVOICE_SELECT} WHERE i.order_id = $1 ORDER BY i.created_at DESC LIMIT 1`, [internalOrderId])
  const specimenResult = await pool.query(`SELECT ${SPECIMEN_COLUMNS} FROM specimens s JOIN orders o ON o.id = s.order_id
     JOIN patients p ON p.id = o.patient_id
     LEFT JOIN order_items oi ON oi.id = s.order_item_id
     LEFT JOIN test_catalog tc ON tc.id = oi.test_catalog_id
     LEFT JOIN LATERAL (SELECT id, status, total FROM invoices WHERE order_id = o.id ORDER BY created_at DESC, id DESC LIMIT 1) inv ON true WHERE s.order_id = $1 ORDER BY s.created_at, s.id`, [internalOrderId])
  const commissionResult = await pool.query<{ amount_piastres: string | number; status: string }>('SELECT amount_piastres, status FROM practitioner_commissions WHERE order_id = $1', [internalOrderId])
  const invoice = invoiceResult.rows[0] ? formatInvoice(invoiceResult.rows[0]) : null
  return {
    ...formatOrder({ ...row, patient_name: row.patient_name, tests: row.tests }),
    patientId: String(row.patient_id),
    practitionerId: row.practitioner_id == null ? null : String(row.practitioner_id),
    practitioner: row.practitioner_name == null ? null : String(row.practitioner_name),
    fasting: Boolean(row.fasting), diagnosis: row.diagnosis == null ? null : String(row.diagnosis),
    subtotalPiastres: invoice ? toMinorUnits(invoice.subtotal) : 0,
    discountPiastres: invoice ? toMinorUnits(invoice.discount) : 0,
    insuranceCoveragePiastres: Number(row.insurance_coverage_piastres ?? 0), invoice,
    specimens: specimenResult.rows.map(formatSpecimen),
    commission: commissionResult.rows[0] ? { amountPiastres: Number(commissionResult.rows[0].amount_piastres), status: 'pending' } : null,
  }
}

async function listReceptionOrders(pool: Pool, page: PageOptions): Promise<ReceptionOrder[]> {
  const orders = await pool.query<{ id: string }>('SELECT id FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2', [page.limit, page.offset])
  return Promise.all(orders.rows.map((row) => findReceptionOrder(pool, row.id)))
}

type ReceptionServiceSnapshot = { id: string; name: string; price: number; specimenType: string; tube: string | null; kind: 'lab' | 'radiology'; bundleId: string | null; quantity: number; orderItemId?: string }
type ReceptionBundleSnapshot = { id: string; name: string; price: number }
type ReceptionPractitionerSnapshot = { id: string; name_ar: string; commission_type: string; commission_percent: number | string | null; commission_amount_piastres: number | string | null }
type ReceptionSelection = { services: Map<string, ReceptionServiceSnapshot>; bundles: ReceptionBundleSnapshot[]; practitioner: ReceptionPractitionerSnapshot | null }
type ReceptionAmounts = { subtotal: number; discount: number; coverage: number; upfront: number; total: number }

function assertReceptionInput(input: CreateReceptionOrderInput): { actor: string; serviceIds: string[]; bundleIds: string[]; discount: number; coverage: number; upfront: number } {
  const actor = normalizeActor(input.actor)
  const serviceIds = input.testIds ?? []
  const bundleIds = input.bundleIds ?? []
  const ids = [...serviceIds, ...bundleIds, ...(input.practitionerId ? [input.practitionerId] : [])]
  if (!UUID_PATTERN.test(input.patientId) || !['normal', 'urgent'].includes(input.priority ?? 'normal') || serviceIds.length + bundleIds.length === 0 || serviceIds.length + bundleIds.length > 50) throw new RepositoryInputError('Reception order input is invalid.')
  if (new Set(serviceIds).size !== serviceIds.length || new Set(bundleIds).size !== bundleIds.length || ids.some((id) => !UUID_PATTERN.test(id))) throw new RepositoryInputError('Reception identifiers must be valid and unique UUIDs.')
  if (input.paymentReference !== undefined && (!input.paymentReference.trim() || input.paymentReference.trim().length > 200)) throw new RepositoryInputError('paymentReference is invalid.')
  const amounts = [input.discountPiastres ?? 0, input.insuranceCoveragePiastres ?? 0, input.initialPaymentPiastres ?? 0]
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999_999)) throw new RepositoryInputError('Reception amounts must be non-negative integer piastres within the supported limit.')
  return { actor, serviceIds, bundleIds, discount: amounts[0], coverage: amounts[1], upfront: amounts[2] }
}

async function loadDirectReceptionServices(client: PoolClient, serviceIds: string[], selected: Map<string, ReceptionServiceSnapshot>): Promise<void> {
  if (!serviceIds.length) return
  const result = await client.query<Record<string, unknown>>(`SELECT id, name, specimen_type, tube, kind, COALESCE(price_piastres, ROUND(price * 100)::BIGINT) AS price FROM test_catalog WHERE id = ANY($1::uuid[]) AND is_active FOR SHARE`, [serviceIds])
  if (result.rows.length !== serviceIds.length) throw new RepositoryInputError('One or more tests are not in the active catalog.')
  for (const test of result.rows) selected.set(String(test.id), { id: String(test.id), name: String(test.name), price: Number(test.price), specimenType: String(test.specimen_type), tube: test.tube == null ? null : String(test.tube), kind: test.kind as 'lab' | 'radiology', bundleId: null, quantity: 1 })
}

async function loadReceptionBundles(client: PoolClient, bundleIds: string[], selected: Map<string, ReceptionServiceSnapshot>): Promise<ReceptionBundleSnapshot[]> {
  if (!bundleIds.length) return []
  const result = await client.query<Record<string, unknown>>('SELECT id, name_ar, price_piastres FROM bundles WHERE id = ANY($1::uuid[]) AND is_active FOR SHARE', [bundleIds])
  if (result.rows.length !== bundleIds.length) throw new RepositoryInputError('One or more bundles are not active.')
  const bundles: ReceptionBundleSnapshot[] = []
  for (const bundle of result.rows) {
    const members = await client.query<Record<string, unknown>>(`SELECT tc.id, tc.name, tc.specimen_type, tc.tube, tc.kind, tc.is_active, bi.quantity,
      COALESCE(tc.price_piastres, ROUND(tc.price * 100)::BIGINT) AS price
      FROM bundle_items bi JOIN test_catalog tc ON tc.id = bi.test_catalog_id WHERE bi.bundle_id = $1 ORDER BY tc.id FOR SHARE OF tc`, [bundle.id])
    if (!members.rows.length || members.rows.some((member) => !member.is_active)) throw new RepositoryInputError('Bundle has no active services.')
    bundles.push({ id: String(bundle.id), name: String(bundle.name_ar), price: Number(bundle.price_piastres) })
    for (const member of members.rows) {
      const serviceId = String(member.id)
      if (selected.has(serviceId)) throw new RepositoryInputError('A service cannot be selected directly or through multiple bundles.')
      selected.set(serviceId, { id: serviceId, name: String(member.name), price: Number(member.price), specimenType: String(member.specimen_type), tube: member.tube == null ? null : String(member.tube), kind: member.kind as 'lab' | 'radiology', bundleId: String(bundle.id), quantity: Number(member.quantity) })
    }
  }
  return bundles
}

async function loadReceptionPractitioner(client: PoolClient, practitionerId: string | undefined): Promise<ReceptionPractitionerSnapshot | null> {
  if (!practitionerId) return null
  const result = await client.query<ReceptionPractitionerSnapshot>('SELECT id, name_ar, commission_type, commission_percent, commission_amount_piastres FROM practitioners WHERE id = $1 AND is_active FOR SHARE', [practitionerId])
  if (!result.rows[0]) throw new RepositoryInputError('Practitioner is not active.')
  return result.rows[0]
}

async function loadReceptionSelection(client: PoolClient, input: CreateReceptionOrderInput, serviceIds: string[], bundleIds: string[]): Promise<ReceptionSelection> {
  const services = new Map<string, ReceptionServiceSnapshot>()
  await loadDirectReceptionServices(client, serviceIds, services)
  const bundles = await loadReceptionBundles(client, bundleIds, services)
  const practitioner = await loadReceptionPractitioner(client, input.practitionerId)
  if (!services.size) throw new RepositoryInputError('At least one active service is required.')
  return { services, bundles, practitioner }
}

function calculatePostgresReceptionAmounts(selection: ReceptionSelection, discount: number, coverage: number, upfront: number): ReceptionAmounts {
  const maxMoney = 999_999_999_999
  const isSafeMoney = (amount: number) => Number.isSafeInteger(amount) && amount >= 0 && amount <= maxMoney
  if ([...selection.services.values()].some((service) => !isSafeMoney(service.price) || !Number.isSafeInteger(service.quantity) || service.quantity <= 0) || selection.bundles.some((bundle) => !isSafeMoney(bundle.price))) throw new RepositoryInputError('Catalog prices or quantities exceed the supported limits.')
  const subtotal = [...selection.services.values()].reduce((sum, service) => sum + (service.bundleId ? 0 : service.price * service.quantity), 0) + selection.bundles.reduce((sum, bundle) => sum + bundle.price, 0)
  if (!isSafeMoney(subtotal) || discount > subtotal) throw new RepositoryInputError('Discount or subtotal exceeds the allowed amount.')
  const total = subtotal - discount
  if (coverage > total) throw new RepositoryInputError('Insurance coverage cannot exceed invoice total.')
  if (upfront > total - coverage) throw new RepositoryInputError('Initial payment exceeds the patient balance.')
  return { subtotal, discount, coverage, upfront, total }
}

async function insertReceptionOrder(client: PoolClient, input: CreateReceptionOrderInput, patientId: string, selection: ReceptionSelection, amounts: ReceptionAmounts): Promise<{ id: string; order_number: number }> {
  const result = await client.query<{ id: string; order_number: number }>(`INSERT INTO orders (patient_id, priority, practitioner_id, fasting, diagnosis, insurance_company, insurance_coverage_piastres)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, order_number`, [patientId, input.priority ?? 'normal', selection.practitioner?.id ?? null, input.fasting ?? false, input.diagnosis ?? null, input.insuranceCompany ?? null, amounts.coverage])
  const order = result.rows[0]
  for (const service of selection.services.values()) {
    const item = await client.query<{ id: string }>('INSERT INTO order_items (order_id, test_catalog_id, bundle_id, quantity, unit_price_piastres) VALUES ($1, $2, $3, $4, $5) RETURNING id', [order.id, service.id, service.bundleId, service.quantity, service.price])
    service.orderItemId = item.rows[0].id
  }
  return order
}

async function insertReceptionInvoice(client: PoolClient, orderId: string, actor: string, actorId: string | undefined, input: CreateReceptionOrderInput, selection: ReceptionSelection, amounts: ReceptionAmounts): Promise<string> {
  const invoice = await client.query<{ id: string }>(`INSERT INTO invoices (order_id, subtotal, discount, tax, total, status) VALUES ($1, $2, $3, 0, $4, 'issued') RETURNING id`, [orderId, fromMinorUnits(amounts.subtotal), fromMinorUnits(amounts.discount), fromMinorUnits(amounts.total)])
  const invoiceId = invoice.rows[0].id
  const lines = [...[...selection.services.values()].filter((service) => !service.bundleId).map((service) => ({ description: service.name, price: service.price * service.quantity })), ...selection.bundles.map((bundle) => ({ description: bundle.name, price: bundle.price }))]
  for (const [index, line] of lines.entries()) await client.query('INSERT INTO invoice_items (invoice_id, item_index, description, quantity, unit_price) VALUES ($1, $2, $3, 1, $4)', [invoiceId, index, line.description, fromMinorUnits(line.price)])
  await insertReceptionPayments(client, invoiceId, actor, actorId, input, amounts)
  return invoiceId
}

async function insertReceptionPayments(client: PoolClient, invoiceId: string, actor: string, actorId: string | undefined, input: CreateReceptionOrderInput, amounts: ReceptionAmounts): Promise<void> {
  if (amounts.coverage > 0) {
    await client.query('INSERT INTO payments (invoice_id, amount, method, reference, received_by) VALUES ($1, $2, \'insurance\', $3, $4)', [invoiceId, fromMinorUnits(amounts.coverage), input.insuranceCompany?.trim() || 'Manual insurance coverage', actor])
    await client.query(`INSERT INTO audit_events (actor_id, action, entity_type, entity_id, metadata) VALUES ($1, 'invoice.insurance_coverage_recorded', 'invoice', $2, $3::jsonb)`, [actorId ?? actor, invoiceId, JSON.stringify({ amountPiastres: amounts.coverage })])
  }
  if (amounts.upfront > 0) {
    await client.query('INSERT INTO payments (invoice_id, amount, method, reference, received_by) VALUES ($1, $2, $3, $4, $5)', [invoiceId, fromMinorUnits(amounts.upfront), input.paymentMethod ?? 'cash', input.paymentReference?.trim() || null, actor])
    await client.query(`INSERT INTO audit_events (actor_id, action, entity_type, entity_id, metadata) VALUES ($1, 'invoice.initial_payment_recorded', 'invoice', $2, $3::jsonb)`, [actorId ?? actor, invoiceId, JSON.stringify({ amountPiastres: amounts.upfront, method: input.paymentMethod ?? 'cash' })])
  }
  const paid = amounts.coverage + amounts.upfront
  if (paid > 0) await client.query('UPDATE invoices SET status = $2, updated_at = now() WHERE id = $1', [invoiceId, paid >= amounts.total ? 'paid' : 'partially_paid'])
}

async function insertReceptionSpecimens(client: PoolClient, orderId: string, services: Map<string, ReceptionServiceSnapshot>): Promise<void> {
  for (const service of services.values()) {
    if (service.kind !== 'lab' || !service.orderItemId) continue
    await client.query('INSERT INTO specimens (order_id, order_item_id, specimen_type, tube, barcode) VALUES ($1, $2, $3, $4, $5)', [orderId, service.orderItemId, service.specimenType, service.tube, `AY${randomUUID().replaceAll('-', '').toUpperCase()}`])
  }
}

function calculatePractitionerCommission(practitioner: ReceptionPractitionerSnapshot | null, amounts: ReceptionAmounts): number {
  if (!practitioner) return 0
  const commission = practitioner.commission_type === 'fixed'
    ? Number(practitioner.commission_amount_piastres)
    : Math.round(amounts.total * Number(practitioner.commission_percent) / 100)
  if (!Number.isSafeInteger(commission) || commission < 0 || commission > 999_999_999_999) throw new RepositoryInputError('Practitioner commission is invalid.')
  return commission
}

async function insertReceptionCommission(client: PoolClient, orderId: string, practitioner: ReceptionPractitionerSnapshot | null, amount: number): Promise<void> {
  if (practitioner) await client.query('INSERT INTO practitioner_commissions (order_id, practitioner_id, amount_piastres) VALUES ($1, $2, $3)', [orderId, practitioner.id, amount])
}

async function createReceptionOrder(pool: Pool, input: CreateReceptionOrderInput): Promise<ReceptionOrder> {
  const request = assertReceptionInput(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const patient = await findPatient(client, input.patientId)
    const selection = await loadReceptionSelection(client, input, request.serviceIds, request.bundleIds)
    const amounts = calculatePostgresReceptionAmounts(selection, request.discount, request.coverage, request.upfront)
    const commission = calculatePractitionerCommission(selection.practitioner, amounts)
    const order = await insertReceptionOrder(client, input, patient.id, selection, amounts)
    const invoiceId = await insertReceptionInvoice(client, order.id, request.actor, input.actorId, input, selection, amounts)
    await insertReceptionSpecimens(client, order.id, selection.services)
    await insertReceptionCommission(client, order.id, selection.practitioner, commission)
    await client.query(`INSERT INTO audit_events (actor_id, action, entity_type, entity_id, metadata) VALUES ($1, 'order.created', 'order', $2, $3::jsonb)`, [input.actorId ?? request.actor, order.id, JSON.stringify({ invoiceId, subtotalPiastres: amounts.subtotal, discountPiastres: amounts.discount, insuranceCoveragePiastres: amounts.coverage, initialPaymentPiastres: amounts.upfront, commissionPiastres: commission })])
    await client.query('COMMIT')
    return findReceptionOrder(pool, order.id)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve the original repository error */ }
    if (error instanceof RepositoryNotFoundError || error instanceof RepositoryInputError || error instanceof RepositoryConflictError) throw error
    if (isPostgresError(error, '22P02')) throw new RepositoryInputError('Reception identifiers must be valid UUIDs.')
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('Duplicate service, order item, or barcode.')
    if (isPostgresError(error, '23503')) throw new RepositoryNotFoundError('Patient, practitioner, catalog test, or bundle was not found.')
    if (isPostgresError(error, '23514')) throw new RepositoryInputError('Reception data violates a database constraint.')
    throw error
  } finally {
    client.release()
  }
}

async function recordPayment(pool: Pool, invoiceId: string, amount: number, method: PaymentMethod, reference: string | undefined, receivedBy: string): Promise<Invoice> {
  if (typeof invoiceId !== 'string' || !UUID_PATTERN.test(invoiceId)) throw new RepositoryInputError('id must be a valid UUID.')
  if (!isPaymentMethod(method)) throw new RepositoryInputError('method is invalid.')
  const normalizedAmount = normalizePaymentAmount(amount)
  const receiver = normalizeActor(receivedBy)
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
    const balanceMinor = outstandingMinor(Number(invoice.total), [Number(paidResult.rows[0]?.paid ?? 0)])
    if (toMinorUnits(normalizedAmount) > balanceMinor) throw new RepositoryConflictError('Payment exceeds the invoice balance.')
    await client.query(
      `INSERT INTO payments (invoice_id, amount, method, reference, received_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, normalizedAmount, method, reference?.trim() || null, receiver],
    )
    await client.query(
      'UPDATE invoices SET status = $2, updated_at = now() WHERE id = $1',
      [invoiceId, toMinorUnits(normalizedAmount) >= balanceMinor ? 'paid' : 'partially_paid'],
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

const DEVICE_COLUMNS = 'id, name, manufacturer, model, protocol, endpoint, status, is_active, last_seen_at, created_at, updated_at'

async function findDevice(pool: Pool, id: string): Promise<LabDevice> {
  if (!isDeviceUuid(id)) throw new RepositoryInputError('id must be a valid UUID.')
  const result = await pool.query(`SELECT ${DEVICE_COLUMNS} FROM lab_devices WHERE id = $1`, [id])
  if (!result.rows[0]) throw new RepositoryNotFoundError('Device was not found.')
  return formatDevice(result.rows[0])
}

async function listDevices(pool: Pool, activeOnly: boolean | undefined): Promise<LabDevice[]> {
  const result = await pool.query(
    `SELECT ${DEVICE_COLUMNS}
     FROM lab_devices
     WHERE ($1::boolean IS NOT TRUE OR is_active = TRUE)
     ORDER BY name ASC`,
    [activeOnly === true],
  )
  return result.rows.map(formatDevice)
}

async function createDevice(pool: Pool, input: Parameters<OrderRepository['createDevice']>[0]): Promise<LabDevice> {
  const normalized = validateCreateDeviceInput(input)
  if (!normalized) throw new RepositoryInputError('Device input is invalid.')
  try {
    const result = await pool.query(
      `INSERT INTO lab_devices (name, manufacturer, model, protocol, endpoint, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${DEVICE_COLUMNS}`,
      [normalized.name, normalized.manufacturer ?? null, normalized.model ?? null, normalized.protocol, normalized.endpoint, normalized.status ?? 'unknown', normalized.isActive ?? true],
    )
    return formatDevice(result.rows[0])
  } catch (error) {
    if (isPostgresError(error, '23505')) throw new RepositoryConflictError('Device name already exists.')
    if (isPostgresError(error, '22P02') || isPostgresError(error, '23514')) throw new RepositoryInputError('Device input is invalid.')
    throw error
  }
}

async function checkDeviceConnection(pool: Pool, id: string): Promise<DeviceConnectionResult> {
  const device = await findDevice(pool, id)
  return evaluateDeviceConnection(device)
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
    getDashboard: () => getDashboard(pool),
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
    createOrder: (input) => createOrder(pool, input),
    createReceptionOrder: (input) => createReceptionOrder(pool, input),
    listReceptionOrders: (page) => listReceptionOrders(pool, resolvePage(page)),
    createCatalogTest: (input) => createCatalogTest(pool, input),
    updateCatalogTest: (id, update) => updateCatalogTest(pool, id, update),
    listSpecimens: (status, page) => listSpecimens(pool, status, resolvePage(page)),
    createSpecimen: (orderId, specimenType, barcode) => createSpecimen(pool, orderId, specimenType, barcode),
    collectSpecimen: (barcode) => collectSpecimen(pool, barcode, 'payment-required'),
    collectSpecimenWithPaymentOverride: (barcode) => collectSpecimen(pool, barcode, 'manager-override'),
    rejectSpecimen: (barcode, reason) => rejectSpecimen(pool, barcode, reason),
    receiveSpecimen: (barcode) => receiveSpecimen(pool, barcode),
    listResultWorklist: (page) => listResultWorklist(pool, resolvePage(page)),
    listResults: (orderId, page) => listResults(pool, orderId, resolvePage(page)),
    enterResult: (orderItemId, value, unit, referenceRange, flag, enteredBy, enteredById, parameterId, snapshot) => enterResult(pool, orderItemId, value, unit, referenceRange, flag, enteredBy, enteredById, parameterId, snapshot),
    reviewResult: (id, reviewedBy, reviewedById) => reviewResult(pool, id, reviewedBy, reviewedById),
    amendResult: (id, value, unit, referenceRange, flag, reason, enteredBy, enteredById, parameterId, snapshot) => amendResult(pool, id, value, unit, referenceRange, flag, reason, enteredBy, enteredById, parameterId, snapshot),
    releaseReport: (orderId, releasedById, content, settings) => releaseReport(pool, orderId, releasedById, content, settings),
    getReportRelease: (id) => getReportRelease(pool, id),
    listReportReleases: (orderId) => listReportReleases(pool, orderId),
    getPublicReportVerification: (token) => getPublicReportVerification(pool, token),
    listInvoices: (status, page) => listInvoices(pool, status, resolvePage(page)),
    createInvoice: (orderId, items, discount, tax) => createInvoice(pool, orderId, items, discount, tax),
    recordPayment: (invoiceId, amount, method, reference, receivedBy) => recordPayment(pool, invoiceId, amount, method, reference, receivedBy),
    listRadiologyStudies: (status, page) => listRadiologyStudies(pool, status, resolvePage(page)),
    listRadiologyOrderItems: (page) => listRadiologyOrderItems(pool, resolvePage(page)),
    createRadiologyStudy: (orderItemId, modality, bodyPart, priority, scheduledAt, referringProvider) => createRadiologyStudy(pool, orderItemId, modality, bodyPart, priority, scheduledAt, referringProvider),
    startRadiologyStudy: (id) => startRadiologyStudy(pool, id),
    reportRadiologyStudy: (id, reportText, impression) => reportRadiologyStudy(pool, id, reportText, impression),
    verifyRadiologyStudy: (id, verifiedBy) => verifyRadiologyStudy(pool, id, verifiedBy),
    listInventoryItems: (activeOnly) => listInventoryItems(pool, activeOnly),
    createInventoryItem: (sku, name, category, unit, reorderLevel) => createInventoryItem(pool, sku, name, category, unit, reorderLevel),
    recordInventoryMovement: (itemId, type, quantity, reason, reference, adjustmentDirection, createdBy) => recordInventoryMovement(
      pool, itemId, type, quantity, reason, reference, adjustmentDirection, createdBy,
    ),
    recordAuditEvent: (input) => recordAuditEvent(pool, input),
    listAuditEvents: (options) => listAuditEvents(pool, options),
    listInsurancePolicies: (patientId, page) => listInsurancePolicies(pool, patientId, resolvePage(page)),
    createInsurancePolicy: (patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo) => createInsurancePolicy(
      pool, patientId, payerName, memberNumber, planName, coveragePercent, validFrom, validTo,
    ),
    listInsuranceClaims: (status, page) => listInsuranceClaims(pool, status, resolvePage(page)),
    createInsuranceClaim: (policyId, orderId, amount) => createInsuranceClaim(pool, policyId, orderId, amount),
    transitionInsuranceClaim: (id, nextStatus) => transitionInsuranceClaim(pool, id, nextStatus),
    listHomeVisits: (patientId, status, page) => listHomeVisits(pool, patientId, status, resolvePage(page)),
    createHomeVisit: (patientId, orderId, address, contactPhone, scheduledAt, assignedTo, notes) => createHomeVisit(
      pool, patientId, orderId, address, contactPhone, scheduledAt, assignedTo, notes,
    ),
    transitionHomeVisit: (id, nextStatus) => transitionHomeVisit(pool, id, nextStatus),
    listDevices: (activeOnly) => listDevices(pool, activeOnly),
    createDevice: (input) => createDevice(pool, input),
    checkDeviceConnection: (id) => checkDeviceConnection(pool, id),
  }
}

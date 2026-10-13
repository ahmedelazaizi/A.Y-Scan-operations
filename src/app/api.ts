export const AUTH_TOKEN_STORAGE_KEY = 'ay-scan.auth.token'
export const AUTH_REQUIRED_EVENT = 'ay-scan-auth-required'

export type AuthRole = 'admin' | 'branch_manager' | 'receptionist' | 'lab_technician' | 'radiologist' | 'accountant'

export type AuthenticatedUser = {
  id: string
  email: string
  displayName: string
  role: AuthRole
}

export type LoginCredentials = {
  email: string
  password: string
}

export type LoginResponse = {
  user: AuthenticatedUser
  token: string
  expiresAt: string
}

export type CurrentUserResponse = {
  user: AuthenticatedUser
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

export function clearStoredAuthToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

function dispatchAuthRequired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export type OrderTone = 'info' | 'success' | 'warning'
export type OrderStatus = 'processing' | 'ready_for_review' | 'awaiting_sample' | 'completed'
export type OrderPriority = 'normal' | 'urgent'

export type Order = {
  id: string
  patient: string
  tests: string
  time: string
  status: OrderStatus
  state: string
  tone: OrderTone
  priority?: OrderPriority
}

export type DashboardMetric = {
  label: string
  value: string
  note: string
  icon: 'receipt' | 'flask' | 'check' | 'chart'
  tone: 'cyan' | 'orange' | 'lime' | 'navy'
}

export type Dashboard = {
  metrics: DashboardMetric[]
  recentOrders: Order[]
  samples: { total: number; completionRate: number; inProgress: number; completed: number; needsAttention: number }
}

export type NewOrder = { patientId?: string; patientName?: string; tests: string[]; priority: OrderPriority }
export type PatientSex = 'female' | 'male' | 'other' | 'unknown'

export type Patient = {
  id: string
  fullName: string
  phone?: string
  dateOfBirth?: string
  sex?: PatientSex
  createdAt: string
}

export type NewPatient = {
  fullName: string
  phone?: string
  dateOfBirth?: string
  sex?: PatientSex
}

export type CatalogItem = {
  id: string
  code: string
  name: string
  specimenType: string
  price: number
  isActive: boolean
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

export type NewSpecimen = {
  orderId: string
  specimenType: string
  barcode: string
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

export type NewLabResult = {
  orderItemId: string
  value: string
  unit?: string
  referenceRange?: string
  flag: ResultFlag
}

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void'
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'insurance'

export type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type Payment = {
  id: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paidAt: string
  receivedBy: string
}

export type Invoice = {
  id: string
  orderId: string
  invoiceNumber: string
  currency: string
  subtotal: number
  discount: number
  tax: number
  total: number
  status: InvoiceStatus
  items: InvoiceItem[]
  payments: Payment[]
  createdAt: string
  updatedAt: string
}

export type NewInvoiceItem = {
  description: string
  quantity: number
  unitPrice: number
}

export type NewInvoice = {
  orderId: string
  items: NewInvoiceItem[]
  discount?: number
  tax?: number
}

export type NewPayment = {
  amount: number
  method: PaymentMethod
  reference?: string
}

export type RadiologyModality = 'xray' | 'ct' | 'mri' | 'ultrasound' | 'mammography' | 'pet_ct' | 'other'
export type RadiologyPriority = 'normal' | 'urgent' | 'stat'
export type RadiologyStudyStatus = 'scheduled' | 'in_progress' | 'reported' | 'verified' | 'cancelled'

export type RadiologyStudy = {
  id: string
  accessionNumber: string
  patientId: string
  modality: RadiologyModality
  bodyPart: string
  priority: RadiologyPriority
  status: RadiologyStudyStatus
  scheduledAt: string | null
  performedAt: string | null
  reportText: string | null
  impression: string | null
  referringProvider: string | null
  verifiedBy: string | null
  createdAt: string
  updatedAt: string
}

export type NewRadiologyStudy = {
  patientId: string
  modality: RadiologyModality
  bodyPart: string
  priority?: RadiologyPriority
  scheduledAt?: string
  referringProvider?: string
}

export type NewRadiologyReport = {
  reportText: string
  impression: string
}

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

export type NewHomeVisit = {
  patientId: string
  orderId?: string
  address: string
  contactPhone: string
  scheduledAt: string
  assignedTo?: string
  notes?: string
}

export type HomeVisitTransition = { status: HomeVisitStatus }

export type InventoryMovementType = 'receipt' | 'issue' | 'adjustment'
export type InventoryAdjustmentDirection = 'increase' | 'decrease'

export type InventoryItem = {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  quantity: number
  reorderLevel: number
  isActive: boolean
}

export type NewInventoryItem = {
  sku: string
  name: string
  category: string
  unit: string
  reorderLevel: number
}

export type NewInventoryMovement = {
  type: InventoryMovementType
  quantity: number
  reason: string
  reference?: string
  adjustmentDirection?: InventoryAdjustmentDirection
}

export type InventoryMovement = {
  id: string
  itemId: string
  type: InventoryMovementType
  quantity: number
  reason: string
  reference?: string | null
  adjustmentDirection?: InventoryAdjustmentDirection | null
  createdAt?: string
}

export type InventoryMovementResponse = {
  item: InventoryItem
  movement: InventoryMovement
}

export type InsurancePolicyStatus = 'active' | 'expired' | 'suspended'
export type InsuranceClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'

export type InsurancePolicy = {
  id: string
  patientId: string
  payerName: string
  memberNumber: string
  planName: string
  status: InsurancePolicyStatus
  coveragePercent: number
  validFrom: string
  validTo: string | null
  createdAt: string
  updatedAt: string
}

export type InsuranceClaim = {
  id: string
  claimNumber: string
  policyId: string
  orderId: string | null
  amount: number
  status: InsuranceClaimStatus
  submittedAt: string | null
  responseCode: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type NewInsurancePolicy = {
  patientId: string
  payerName: string
  memberNumber: string
  planName: string
  coveragePercent: number
  validFrom: string
  validTo?: string | null
}

export type NewInsuranceClaim = {
  policyId: string
  orderId?: string | null
  amount: number
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getStoredAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, { ...options, headers })
  let payload: unknown = null
  if (response.status !== 204) {
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (response.status === 401) dispatchAuthRequired()
    const responseMessage = isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'تعذر إتمام الطلب.'
    throw new ApiError(responseMessage, response.status)
  }

  return payload as T
}

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: credentials.email.trim(), password: credentials.password }),
  })
}

export async function fetchCurrentUser(): Promise<AuthenticatedUser> {
  const response = await requestJson<CurrentUserResponse>('/api/auth/me')
  return response.user
}

export function logout(): Promise<void> {
  return requestJson<void>('/api/auth/logout', { method: 'POST' })
}

export function fetchDashboard(): Promise<Dashboard> {
  return requestJson<Dashboard>('/api/dashboard')
}

export function createOrder(order: NewOrder): Promise<Order> {
  return requestJson<Order>('/api/orders', { method: 'POST', body: JSON.stringify(order) })
}

export function fetchPatients(query = ''): Promise<Patient[]> {
  const params = new URLSearchParams({ q: query.trim() })
  return requestJson<Patient[]>(`/api/patients?${params.toString()}`)
}

export function createPatient(patient: NewPatient): Promise<Patient> {
  return requestJson<Patient>('/api/patients', { method: 'POST', body: JSON.stringify(patient) })
}

export function fetchCatalog(): Promise<CatalogItem[]> {
  return requestJson<CatalogItem[]>('/api/catalog')
}

export function fetchSpecimens(status?: SpecimenStatus): Promise<Specimen[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestJson<Specimen[]>(`/api/specimens${query}`)
}

export function createSpecimen(specimen: NewSpecimen): Promise<Specimen> {
  return requestJson<Specimen>('/api/specimens', { method: 'POST', body: JSON.stringify(specimen) })
}

export function collectSpecimen(barcode: string): Promise<Specimen> {
  return requestJson<Specimen>(`/api/specimens/${encodeURIComponent(barcode)}/collect`, { method: 'POST' })
}

export function fetchResults(orderId = ''): Promise<LabResult[]> {
  const query = orderId.trim() ? `?orderId=${encodeURIComponent(orderId.trim())}` : ''
  return requestJson<LabResult[]>(`/api/results${query}`)
}

export function createResult(resultInput: NewLabResult): Promise<LabResult> {
  return requestJson<LabResult>('/api/results', { method: 'POST', body: JSON.stringify(resultInput) })
}

export function reviewResult(id: string): Promise<LabResult> {
  return requestJson<LabResult>(`/api/results/${encodeURIComponent(id)}/review`, { method: 'POST' })
}

export function fetchInvoices(status?: InvoiceStatus): Promise<Invoice[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestJson<Invoice[]>(`/api/billing/invoices${query}`)
}

export function createInvoice(invoice: NewInvoice): Promise<Invoice> {
  return requestJson<Invoice>('/api/billing/invoices', { method: 'POST', body: JSON.stringify(invoice) })
}

export function recordInvoicePayment(invoiceId: string, payment: NewPayment): Promise<Invoice> {
  return requestJson<Invoice>(`/api/billing/invoices/${encodeURIComponent(invoiceId)}/payments`, { method: 'POST', body: JSON.stringify(payment) })
}

export function fetchRadiologyStudies(status?: RadiologyStudyStatus): Promise<RadiologyStudy[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestJson<RadiologyStudy[]>(`/api/radiology/studies${query}`)
}

export function createRadiologyStudy(study: NewRadiologyStudy): Promise<RadiologyStudy> {
  return requestJson<RadiologyStudy>('/api/radiology/studies', { method: 'POST', body: JSON.stringify(study) })
}

export function startRadiologyStudy(id: string): Promise<RadiologyStudy> {
  return requestJson<RadiologyStudy>(`/api/radiology/studies/${encodeURIComponent(id)}/start`, { method: 'POST' })
}

export function reportRadiologyStudy(id: string, report: NewRadiologyReport): Promise<RadiologyStudy> {
  return requestJson<RadiologyStudy>(`/api/radiology/studies/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify(report) })
}

export function verifyRadiologyStudy(id: string): Promise<RadiologyStudy> {
  return requestJson<RadiologyStudy>(`/api/radiology/studies/${encodeURIComponent(id)}/verify`, { method: 'POST' })
}

export function fetchInventoryItems(activeOnly = true): Promise<InventoryItem[]> {
  const query = new URLSearchParams({ activeOnly: String(activeOnly) })
  return requestJson<InventoryItem[]>(`/api/inventory/items?${query.toString()}`)
}

export function createInventoryItem(item: NewInventoryItem): Promise<InventoryItem> {
  return requestJson<InventoryItem>('/api/inventory/items', { method: 'POST', body: JSON.stringify(item) })
}

export function createInventoryMovement(itemId: string, movement: NewInventoryMovement): Promise<InventoryMovementResponse> {
  return requestJson<InventoryMovementResponse>(`/api/inventory/items/${encodeURIComponent(itemId)}/movements`, { method: 'POST', body: JSON.stringify(movement) })
}

export function fetchInsurancePolicies(patientId = ''): Promise<InsurancePolicy[]> {
  const query = patientId.trim() ? `?patientId=${encodeURIComponent(patientId.trim())}` : ''
  return requestJson<InsurancePolicy[]>(`/api/insurance/policies${query}`)
}

export function createInsurancePolicy(policy: NewInsurancePolicy): Promise<InsurancePolicy> {
  return requestJson<InsurancePolicy>('/api/insurance/policies', { method: 'POST', body: JSON.stringify(policy) })
}

export function fetchInsuranceClaims(status?: InsuranceClaimStatus): Promise<InsuranceClaim[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestJson<InsuranceClaim[]>(`/api/insurance/claims${query}`)
}

export function createInsuranceClaim(claim: NewInsuranceClaim): Promise<InsuranceClaim> {
  return requestJson<InsuranceClaim>('/api/insurance/claims', { method: 'POST', body: JSON.stringify(claim) })
}

export function transitionInsuranceClaim(id: string, status: InsuranceClaimStatus): Promise<InsuranceClaim> {
  return requestJson<InsuranceClaim>(`/api/insurance/claims/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function fetchHomeVisits(patientId = '', status?: HomeVisitStatus): Promise<HomeVisit[]> {
  const params = new URLSearchParams()
  if (patientId.trim()) params.set('patientId', patientId.trim())
  if (status) params.set('status', status)
  const query = params.toString()
  return requestJson<HomeVisit[]>(`/api/home-visits${query ? `?${query}` : ''}`)
}

export function createHomeVisit(visit: NewHomeVisit): Promise<HomeVisit> {
  return requestJson<HomeVisit>('/api/home-visits', { method: 'POST', body: JSON.stringify(visit) })
}

export function transitionHomeVisit(id: string, status: HomeVisitStatus): Promise<HomeVisit> {
  const transition: HomeVisitTransition = { status }
  return requestJson<HomeVisit>(`/api/home-visits/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    body: JSON.stringify(transition),
  })
}

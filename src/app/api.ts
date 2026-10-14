export const AUTH_TOKEN_STORAGE_KEY = 'ay-scan.auth.token'
export const AUTH_REQUIRED_EVENT = 'ay-scan-auth-required'

export const PASSWORD_CHANGE_REQUIRED_EVENT = 'ay-scan-password-change-required'

export const AUTH_ROLES = ['admin', 'branch_manager', 'receptionist', 'lab_technician', 'radiologist', 'accountant', 'lab_consultant'] as const
export type AuthRole = (typeof AUTH_ROLES)[number]

export const ROLE_LABELS: Record<AuthRole, string> = {
  admin: 'مدير النظام',
  branch_manager: 'مدير الفرع',
  receptionist: 'الاستقبال',
  lab_technician: 'فني المختبر',
  radiologist: 'أخصائي الأشعة',
  accountant: 'المحاسبة',
  lab_consultant: 'استشاري المعمل',
}

/** Mirrors server/permissions.ts. The server stays the authority; the client only hides what it would refuse. */
export type Capability =
  | 'dashboard.view'
  | 'patients.view'
  | 'patients.create'
  | 'orders.view'
  | 'orders.create'
  | 'catalog.view'
  | 'catalog.manage'
  | 'specimens.view'
  | 'specimens.manage'
  | 'results.view'
  | 'results.enter'
  | 'results.review'
  | 'billing.view'
  | 'billing.manage'
  | 'radiology.view'
  | 'radiology.schedule'
  | 'radiology.perform'
  | 'radiology.report'
  | 'inventory.view'
  | 'inventory.manageItems'
  | 'inventory.move'
  | 'insurance.view'
  | 'insurance.policies'
  | 'insurance.claims'
  | 'homeVisits.view'
  | 'homeVisits.schedule'
  | 'homeVisits.update'
  | 'devices.view'
  | 'devices.manage'
  | 'devices.check'
  | 'reports.view'
  | 'audit.view'
  | 'users.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'practitioners.view'
  | 'practitioners.manage'
  | 'bundles.view'
  | 'bundles.manage'
  | 'catalog.price'
  | 'ranges.view'
  | 'ranges.manage'
  | 'ranges.approve'

export type AuthenticatedUser = {
  id: string
  username: string
  displayName: string
  role: AuthRole
  mustChangePassword: boolean
}

export type UserAccount = AuthenticatedUser & {
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type NewUserAccount = {
  username: string
  displayName: string
  role: AuthRole
  password: string
}

export type UserAccountUpdate = {
  displayName?: string
  role?: AuthRole
  isActive?: boolean
}

export type LoginCredentials = {
  username: string
  password: string
}

export type LoginResponse = {
  user: AuthenticatedUser
  token: string
  expiresAt: string
  capabilities: Capability[]
}

export type CurrentUserResponse = {
  user: AuthenticatedUser
  capabilities: Capability[]
}

export type PasswordChange = {
  currentPassword: string
  newPassword: string
}

export const MIN_PASSWORD_LENGTH = 4

/** Client-side copy of the server password policy (server/auth/passwords.ts). Returns an Arabic message or ''. */
export function passwordPolicyError(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) return `يجب ألا تقل كلمة المرور عن ${MIN_PASSWORD_LENGTH} أحرف.`
  if (password.length > 200) return 'يجب ألا تزيد كلمة المرور عن 200 حرف.'
  return ''
}

/** Arabic wording for messages the server is known to send; anything else is shown as the server wrote it. */
const KNOWN_SERVER_MESSAGES: Record<string, string> = {
  'Your role does not allow this action.': 'لا تملك صلاحية تنفيذ هذا الإجراء.',
  'Change your password before continuing.': 'يجب تغيير كلمة المرور قبل المتابعة.',
  'Authentication required.': 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
  'Invalid credentials.': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'Current password is incorrect.': 'كلمة المرور الحالية غير صحيحة.',
  'New password must differ from the current password.': 'يجب أن تختلف كلمة المرور الجديدة عن الحالية.',
  'Password must be at least 4 characters.': 'يجب ألا تقل كلمة المرور عن 4 أحرف.',
  'At least one active admin account must remain.': 'يجب أن يبقى حساب مدير نظام نشط واحد على الأقل.',
  'You cannot deactivate your own account or change your own role.': 'لا يمكنك تعطيل حسابك أو تغيير دورك بنفسك.',
  'Username is already taken.': 'اسم المستخدم مستخدم بالفعل.',
  'username is invalid.': 'اسم المستخدم غير صالح: حروف وأرقام فقط (يمكن . _ - @)، من حرفين إلى 64 حرفًا، بدون مسافات.',
  'displayName must be 1-200 characters.': 'الاسم المعروض مطلوب (حتى 200 حرف).',
  'User was not found.': 'لم يتم العثور على المستخدم.',
  'A test with this code already exists.': 'يوجد تحليل آخر بنفس الكود.',
  'Catalog test was not found.': 'لم يتم العثور على التحليل.',
  'One or more tests are not in the active catalog.': 'تحليل أو أكثر غير مفعّل في الدليل. حدّث القائمة وحاول مرة أخرى.',
  'patientId does not reference an existing patient.': 'المريض المحدد غير موجود في السجل.',
}

export class ApiError extends Error {
  readonly status: number
  /** The server's `error` field (e.g. 'Forbidden', 'Password Change Required'), when present. */
  readonly code: string
  /** The server's raw `message` field, when present. */
  readonly serverMessage: string
  readonly retryAfterSeconds: number | null

  constructor(message: string, status: number, details: { code?: string; serverMessage?: string; retryAfterSeconds?: number | null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = details.code ?? ''
    this.serverMessage = details.serverMessage ?? ''
    this.retryAfterSeconds = details.retryAfterSeconds ?? null
  }
}

/** A user-facing message for any thrown value. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
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

function dispatchPasswordChangeRequired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT))
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

export type NewOrder = { patientId: string; testIds: string[]; priority: OrderPriority }
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

export type Phase1CatalogItem = {
  id: string
  code: string
  kind: 'lab' | 'radiology'
  sectionAr: string | null
  sectionEn: string | null
  nameAr: string
  nameEn: string | null
  specimen: string | null
  tube: string | null
  resultType: 'numeric' | 'qualitative' | 'text'
  contractPricePiastres: number
  pricePiastres: number
  insurancePricePiastres: number | null
  isActive: boolean
  requiresReview: boolean
  sourceMetadata: Record<string, unknown>
}

export type NewCatalogItem = {
  code: string
  name: string
  specimenType: string
  price: number
  isActive: boolean
}

export type CatalogItemUpdate = Partial<Omit<NewCatalogItem, 'code'>>

export type DeviceProtocol = 'hl7' | 'astm' | 'tcp_ip' | 'serial'
export type DeviceStatus = 'configured' | 'online' | 'offline' | 'unknown'

export type LabDevice = {
  id: string
  name: string
  manufacturer: string | null
  model: string | null
  protocol: DeviceProtocol
  endpoint: string
  status: DeviceStatus
  isActive: boolean
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export type NewDevice = {
  name: string
  manufacturer?: string
  model?: string
  protocol: DeviceProtocol
  endpoint: string
  status?: DeviceStatus
  isActive?: boolean
}

export type DeviceConnectionResult = {
  device: LabDevice
  status: DeviceStatus
  adapterConfigured: false
  message: string
  lastCheckedAt: string
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

export type ReportDateRange = { from?: string; to?: string }

export type OperationsReport = {
  period: { from: string | null; to: string | null }
  orders: { total: number; completed: number; awaitingSample: number; inProgress: number }
  specimens: { total: number; collected: number; processing: number; completed: number }
  results: { total: number; draft: number; reviewed: number }
  billing: { invoiced: number; paid: number; open: number }
  radiology: { total: number; scheduled: number; inProgress: number; reported: number; verified: number }
  inventory: { items: number; lowStock: number }
  insurance: { claimsTotal: number; submitted: number; approved: number; paid: number }
  homeVisits: { total: number; scheduled: number; inProgress: number; completed: number }
}

function statusFallbackMessage(status: number): string {
  if (status === 401) return 'انتهت الجلسة. سجّل الدخول مرة أخرى.'
  if (status === 403) return 'لا تملك صلاحية تنفيذ هذا الإجراء.'
  if (status === 404) return 'العنصر المطلوب غير موجود.'
  if (status === 409) return 'تعارض مع بيانات موجودة.'
  if (status === 429) return 'محاولات كثيرة. حاول مرة أخرى لاحقًا.'
  if (status >= 500) return 'الخدمة غير متاحة حاليًا. حاول مرة أخرى لاحقًا.'
  return 'تعذر إتمام الطلب.'
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (options?.body !== undefined && options.body !== null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getStoredAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم. تحقق من الشبكة ثم حاول مرة أخرى.', 0)
  }

  let payload: unknown = null
  if (response.status !== 204) {
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : ''
    const serverMessage = isRecord(payload) && typeof payload.message === 'string' ? payload.message : ''
    const retryAfterSeconds = isRecord(payload) && typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : null
    if (response.status === 401) dispatchAuthRequired()
    if (response.status === 403 && code === 'Password Change Required') dispatchPasswordChangeRequired()
    const message = KNOWN_SERVER_MESSAGES[serverMessage] ?? (response.status < 500 && serverMessage ? serverMessage : statusFallbackMessage(response.status))
    throw new ApiError(message, response.status, { code, serverMessage, retryAfterSeconds })
  }

  return payload as T
}

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: credentials.username.trim(), password: credentials.password }),
  })
}

export function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return requestJson<CurrentUserResponse>('/api/auth/me')
}

export function changePassword(change: PasswordChange): Promise<{ user: AuthenticatedUser }> {
  return requestJson<{ user: AuthenticatedUser }>('/api/auth/password', { method: 'POST', body: JSON.stringify(change) })
}

export function fetchUsers(): Promise<UserAccount[]> {
  return requestJson<UserAccount[]>('/api/users')
}

export function createUser(user: NewUserAccount): Promise<UserAccount> {
  return requestJson<UserAccount>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ ...user, username: user.username.trim(), displayName: user.displayName.trim() }),
  })
}

export function updateUser(id: string, update: UserAccountUpdate): Promise<UserAccount> {
  return requestJson<UserAccount>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(update) })
}

export function resetUserPassword(id: string, password: string): Promise<void> {
  return requestJson<void>(`/api/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
}

export function logout(): Promise<void> {
  return requestJson<void>('/api/auth/logout', { method: 'POST' })
}

export function fetchDashboard(): Promise<Dashboard> {
  return requestJson<Dashboard>('/api/dashboard')
}

export function fetchOperationsReport(range: ReportDateRange = {}): Promise<OperationsReport> {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const query = params.toString()
  return requestJson<OperationsReport>(`/api/reports/operations${query ? `?${query}` : ''}`)
}

export function createOrder(order: NewOrder): Promise<Order> {
  return requestJson<Order>('/api/orders', { method: 'POST', body: JSON.stringify(order) })
}

export function fetchPatients(query = '', limit?: number): Promise<Patient[]> {
  const params = new URLSearchParams({ q: query.trim() })
  if (limit !== undefined) params.set('limit', String(limit))
  return requestJson<Patient[]>(`/api/patients?${params.toString()}`)
}

export function createPatient(patient: NewPatient): Promise<Patient> {
  return requestJson<Patient>('/api/patients', { method: 'POST', body: JSON.stringify(patient) })
}

export function fetchCatalog(): Promise<CatalogItem[]> {
  return requestJson<CatalogItem[]>('/api/catalog')
}

export function createCatalogItem(item: NewCatalogItem): Promise<CatalogItem> {
  return requestJson<CatalogItem>('/api/catalog', { method: 'POST', body: JSON.stringify(item) })
}

export function updateCatalogItem(id: string, update: CatalogItemUpdate): Promise<CatalogItem> {
  return requestJson<CatalogItem>(`/api/catalog/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(update) })
}

export function fetchDevices(activeOnly = false): Promise<LabDevice[]> {
  const query = new URLSearchParams({ activeOnly: String(activeOnly) })
  return requestJson<LabDevice[]>(`/api/devices?${query.toString()}`)
}

export function createDevice(device: NewDevice): Promise<LabDevice> {
  return requestJson<LabDevice>('/api/devices', { method: 'POST', body: JSON.stringify(device) })
}

export function checkDeviceConnection(id: string): Promise<DeviceConnectionResult> {
  return requestJson<DeviceConnectionResult>(`/api/devices/${encodeURIComponent(id)}/check-connection`, { method: 'POST' })
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

export type Phase1Settings = { nameAr: string; nameEn: string; licenseNumber: string | null; phone: string | null; addressAr: string | null; addressEn: string | null; currencyCode: string; reportFooterAr: string | null; reportFooterEn: string | null; logoPath: string | null; sealPath: string | null; signaturePath: string | null; logoMetadata: Record<string, unknown>; sealMetadata: Record<string, unknown>; signatureMetadata: Record<string, unknown>; updatedAt: string }
export type Phase1Practitioner = { id: string; nameAr: string; nameEn: string | null; specialty: string | null; phone: string | null; commissionType: 'percentage' | 'fixed'; commissionPercent: number | null; commissionAmountPiastres: number | null; isActive: boolean; createdAt: string; updatedAt: string }
export type Phase1Bundle = { id: string; code: string; nameAr: string; nameEn: string | null; pricePiastres: number; isActive: boolean; items: Array<{ catalogId: string; code: string; nameAr: string; quantity: number }>; createdAt: string; updatedAt: string }
export type Phase1PriceHistory = { id: string; catalogId: string; oldPricePiastres: number; newPricePiastres: number; actorId: string | null; source: string; createdAt: string }
export type Phase1Parameter = { id: string; catalogId: string; code: string; nameAr: string; nameEn: string | null; sortOrder: number; resultType: 'numeric' | 'qualitative' | 'text'; unit: string | null; specimen: string | null; tube: string | null }
export type Phase1Range = { id: string; parameterId: string; parameterCode: string | null; parameterNameAr: string | null; parameterNameEn: string | null; catalogId: string | null; catalogCode: string | null; catalogNameAr: string | null; catalogNameEn: string | null; version: number; resultType: 'numeric' | 'qualitative' | 'text'; sex: 'all' | 'male' | 'female'; ageFromYears: number; ageToYears: number | null; low: number | null; high: number | null; criticalLow: number | null; criticalHigh: number | null; normalText: string | null; textValue: string | null; specimen: string | null; tube: string | null; note: string | null; status: 'proposed' | 'approved' | 'stopped'; proposedBy: string | null; approvedBy: string | null; approvedAt: string | null; sourceMetadata: Record<string, unknown>; createdAt: string; updatedAt: string }
export type Phase1BulkPreview = { percentage: number; filter: { kind?: 'lab' | 'radiology'; sectionAr?: string; includeReviewRequired?: boolean }; count: number; changes: Array<{ id: string; code: string; oldPricePiastres: number; newPricePiastres: number }> }
export type Phase1ImportReport = { priceRowsSeen: number; priceRowsInserted: number; priceRowsExisting: number; reviewRows: number; rangeRowsSeen: number; rangeRowsInserted: number; importedAt: string }

export function fetchPhase1Settings(): Promise<Phase1Settings> { return requestJson<Phase1Settings>('/api/phase1/settings') }
export function updatePhase1Settings(settings: Omit<Phase1Settings, 'updatedAt' | 'logoMetadata' | 'sealMetadata' | 'signatureMetadata'> & Partial<Pick<Phase1Settings, 'logoMetadata' | 'sealMetadata' | 'signatureMetadata'>>): Promise<Phase1Settings> { return requestJson<Phase1Settings>('/api/phase1/settings', { method: 'PATCH', body: JSON.stringify(settings) }) }
export function fetchPhase1Practitioners(): Promise<Phase1Practitioner[]> { return requestJson<Phase1Practitioner[]>('/api/phase1/practitioners') }
export function createPhase1Practitioner(input: Omit<Phase1Practitioner, 'id' | 'createdAt' | 'updatedAt'>): Promise<Phase1Practitioner> { return requestJson<Phase1Practitioner>('/api/phase1/practitioners', { method: 'POST', body: JSON.stringify(input) }) }
export function fetchPhase1Catalog(): Promise<Phase1CatalogItem[]> { return requestJson<Phase1CatalogItem[]>('/api/phase1/catalog') }
export function updatePhase1Price(id: string, pricePiastres: number): Promise<Phase1CatalogItem> { return requestJson<Phase1CatalogItem>(`/api/phase1/catalog/${encodeURIComponent(id)}/price`, { method: 'PATCH', body: JSON.stringify({ pricePiastres }) }) }
export function fetchPhase1PriceHistory(id: string): Promise<Phase1PriceHistory[]> { return requestJson<Phase1PriceHistory[]>(`/api/phase1/catalog/${encodeURIComponent(id)}/price-history`) }
export function previewPhase1BulkPrice(percentage: number, filter: Phase1BulkPreview['filter'] = {}): Promise<Phase1BulkPreview> { return requestJson<Phase1BulkPreview>('/api/phase1/catalog/bulk-price/preview', { method: 'POST', body: JSON.stringify({ percentage, filter }) }) }
export function applyPhase1BulkPrice(percentage: number, filter: Phase1BulkPreview['filter'] = {}): Promise<{ preview: Phase1BulkPreview; updated: number }> { return requestJson<{ preview: Phase1BulkPreview; updated: number }>('/api/phase1/catalog/bulk-price/apply', { method: 'POST', body: JSON.stringify({ percentage, filter }) }) }
export function fetchPhase1Bundles(): Promise<Phase1Bundle[]> { return requestJson<Phase1Bundle[]>('/api/phase1/bundles') }
export type NewPhase1Bundle = { code: string; nameAr: string; nameEn?: string; pricePiastres: number; isActive?: boolean; items: Array<{ catalogId: string; quantity: number }> }
export function createPhase1Bundle(input: NewPhase1Bundle): Promise<Phase1Bundle> { return requestJson<Phase1Bundle>('/api/phase1/bundles', { method: 'POST', body: JSON.stringify(input) }) }
export function fetchPhase1Parameters(catalogId?: string): Promise<Phase1Parameter[]> { return requestJson<Phase1Parameter[]>(`/api/phase1/parameters${catalogId ? `?catalogId=${encodeURIComponent(catalogId)}` : ''}`) }
export type NewPhase1Parameter = Omit<Phase1Parameter, 'id'>
export function createPhase1Parameter(input: NewPhase1Parameter): Promise<Phase1Parameter> { return requestJson<Phase1Parameter>('/api/phase1/parameters', { method: 'POST', body: JSON.stringify(input) }) }
export type NewPhase1Range = { parameterId: string; resultType: Phase1Range['resultType']; sex: Phase1Range['sex']; ageFromYears: number; ageToYears: number | null; low: number | null; high: number | null; criticalLow: number | null; criticalHigh: number | null; normalText: string | null; textValue: string | null; specimen: string | null; tube: string | null; note: string | null; sourceMetadata?: Record<string, unknown> }
export function createPhase1Range(input: NewPhase1Range): Promise<Phase1Range> { return requestJson<Phase1Range>('/api/phase1/ranges', { method: 'POST', body: JSON.stringify(input) }) }
export function updatePhase1Range(id: string, input: Partial<NewPhase1Range>): Promise<Phase1Range> { return requestJson<Phase1Range>(`/api/phase1/ranges/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) }
export function fetchPhase1Ranges(catalogId?: string): Promise<Phase1Range[]> { return requestJson<Phase1Range[]>(`/api/phase1/ranges${catalogId ? `?catalogId=${encodeURIComponent(catalogId)}` : ''}`) }
export function approvePhase1Range(id: string): Promise<Phase1Range> { return requestJson<Phase1Range>(`/api/phase1/ranges/${encodeURIComponent(id)}/approve`, { method: 'POST' }) }
export function importPhase1Seed(): Promise<Phase1ImportReport> { return requestJson<Phase1ImportReport>('/api/phase1/import', { method: 'POST', body: '{}' }) }

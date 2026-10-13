import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, AUTH_REQUIRED_EVENT, clearStoredAuthToken, createOrder, fetchCatalog, fetchCurrentUser, fetchPatients, fetchDashboard, getStoredAuthToken, logout, setStoredAuthToken, type AuthenticatedUser, type CatalogItem, type Dashboard, type LoginResponse, type NewOrder, type Order, type Patient } from './api'
import BillingView from './BillingView'
import LoginView from './LoginView'
import CatalogView from './CatalogView'
import InventoryView from './InventoryView'
import InsuranceView from './InsuranceView'
import HomeVisitsView from './HomeVisitsView'
import OperationsView from './OperationsView'
import PatientsView from './PatientsView'
import RadiologyView from './RadiologyView'
import ReportsView from './ReportsView'

type IconName = 'grid' | 'users' | 'flask' | 'chart' | 'receipt' | 'scan' | 'box' | 'home' | 'settings' | 'bell' | 'plus' | 'arrow' | 'clock' | 'check' | 'alert' | 'menu' | 'x'
type IconProps = { name: IconName; size?: number }

function Icon({ name, size = 20 }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    flask: <><path d="M9 3h6M10 3v6.3L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.3V3" /><path d="M7 16h10" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 16 3-4 3 2 5-7" /></>,
    receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 4-2V2l-4 2-3-2-3 2-3-2Z" /><path d="M8 9h8M8 13h6" /></>,
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>,
    box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8 9 5 9-5M3 16l9 5 9-5M3 12l9 5 9-5" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.41 1.41-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-2v-.5a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-1.41-1.41.06-.06A1.7 1.7 0 0 0 8.6 15a1.7 1.7 0 0 0-1.55-1H6v-2h1.05a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.41-1.41.06.06A1.7 1.7 0 0 0 8.6 9a1.7 1.7 0 0 0 1.55-1H11V6h2v.5a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.41 1.41-.06.06A1.7 1.7 0 0 0 19.4 11a1.7 1.7 0 0 0 1.55 1H22v2h-1.05a1.7 1.7 0 0 0-1.55 1Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    alert: <><path d="M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const FALLBACK_DASHBOARD: Dashboard = {
  metrics: [
    { label: 'طلبات اليوم', value: '128', note: 'بيانات تجريبية', icon: 'receipt', tone: 'cyan' },
    { label: 'عينات قيد المعالجة', value: '36', note: 'بيانات تجريبية', icon: 'flask', tone: 'orange' },
    { label: 'نتائج جاهزة', value: '84', note: 'بيانات تجريبية', icon: 'check', tone: 'lime' },
    { label: 'إيرادات اليوم', value: '18,420', note: 'جنيه مصري · تجريبي', icon: 'chart', tone: 'navy' },
  ],
  recentOrders: [
    { id: 'AY-10482', patient: 'مريض تجريبي 01', tests: 'صورة دم كاملة · سكر تراكمي', time: 'منذ 12 دقيقة', status: 'processing', state: 'قيد التحليل', tone: 'info' },
    { id: 'AY-10481', patient: 'مريض تجريبي 02', tests: 'وظائف كبد · دهون الدم', time: 'منذ 28 دقيقة', status: 'ready_for_review', state: 'جاهز للمراجعة', tone: 'success' },
  ],
  samples: { total: 128, completionRate: 68, inProgress: 36, completed: 84, needsAttention: 8 },
}

type AppView = 'dashboard' | 'patients' | 'catalog' | 'operations' | 'radiology' | 'home-visits' | 'billing' | 'inventory' | 'insurance' | 'reports'
type ToastTone = 'success' | 'error'
const VIEW_LABELS: Record<AppView, string> = { dashboard: 'نظرة عامة', patients: 'المرضى', catalog: 'دليل التحاليل', operations: 'عمليات المختبر', radiology: 'الأشعة', 'home-visits': 'الزيارات المنزلية', billing: 'الفوترة', inventory: 'المخزون', insurance: 'التأمين', reports: 'التقارير' }
const NAV_ITEMS: { label: string; icon: IconName; view: AppView }[] = [
  { label: 'نظرة عامة', icon: 'grid', view: 'dashboard' }, { label: 'المرضى', icon: 'users', view: 'patients' }, { label: 'دليل التحاليل', icon: 'flask', view: 'catalog' }, { label: 'عمليات المختبر', icon: 'scan', view: 'operations' }, { label: 'الأشعة', icon: 'scan', view: 'radiology' }, { label: 'الزيارات المنزلية', icon: 'home', view: 'home-visits' }, { label: 'الفوترة', icon: 'receipt', view: 'billing' }, { label: 'التأمين', icon: 'receipt', view: 'insurance' }, { label: 'المخزون', icon: 'box', view: 'inventory' }, { label: 'التقارير', icon: 'chart', view: 'reports' },
]

const ROLE_LABELS: Record<AuthenticatedUser['role'], string> = {
  admin: 'مدير النظام',
  branch_manager: 'مدير الفرع',
  receptionist: 'الاستقبال',
  lab_technician: 'فني المختبر',
  radiologist: 'اختصاصي الأشعة',
  accountant: 'المحاسبة',
}

function StatusBadge({ state, tone }: { state: string; tone: string }) { return <span className={`status status-${tone}`}><span className="status-dot" aria-hidden="true" />{state}</span> }

type PatientMode = 'registered' | 'unregistered'

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (order: Order) => void }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [patientMode, setPatientMode] = useState<PatientMode>('registered')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientName, setPatientName] = useState('')
  const [selectedTests, setSelectedTests] = useState<string[]>([])
  const [isCustomTestSelected, setCustomTestSelected] = useState(false)
  const [customTest, setCustomTest] = useState('')
  const [priority, setPriority] = useState<NewOrder['priority']>('normal')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true)
    setPatientsError('')
    try {
      setPatients(await fetchPatients())
    } catch (requestError) {
      setPatientsError(requestError instanceof Error ? requestError.message : 'تعذر تحميل قائمة المرضى.')
    } finally {
      setPatientsLoading(false)
    }
  }, [])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError('')
    try {
      const nextCatalog = await fetchCatalog()
      setCatalog(nextCatalog)
      if (!nextCatalog.some((item) => item.isActive)) setCatalogError('لا توجد فحوصات نشطة في الدليل؛ استخدم فحصًا مخصصًا مؤقتًا.')
    } catch (requestError) {
      setCatalogError(requestError instanceof Error ? requestError.message : 'تعذر تحميل دليل التحاليل؛ استخدم فحصًا مخصصًا.')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPatients()
      void loadCatalog()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCatalog, loadPatients])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const activeCatalog = useMemo(() => catalog.filter((item) => item.isActive), [catalog])
  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => `${patient.fullName} ${patient.phone ?? ''}`.toLowerCase().includes(query))
  }, [patientSearch, patients])
  const dataLoading = patientsLoading || catalogLoading

  const toggleTest = (test: string) => setSelectedTests((current) => current.includes(test) ? current.filter((item) => item !== test) : [...current, test])
  const submitOrder = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedPatientName = patientName.trim()
    const trimmedCustomTest = customTest.trim()
    if (patientMode === 'registered' && !selectedPatientId) { setError('اختر مريضًا مسجلًا من السجل، أو اختر مريضًا غير مسجل لاستخدام compatibility fallback.'); return }
    if (patientMode === 'unregistered' && !trimmedPatientName) { setError('اكتب اسم المريض غير المسجل لاستخدام compatibility fallback.'); return }
    if (isCustomTestSelected && !trimmedCustomTest) { setError('اكتب اسم الفحص المخصص أو ألغِ اختياره.'); return }
    const tests = Array.from(new Set([...selectedTests, ...(isCustomTestSelected ? [trimmedCustomTest] : [])].filter(Boolean)))
    if (tests.length === 0) { setError('اختر فحصًا واحدًا على الأقل من الدليل أو اختر فحصًا مخصصًا.'); return }
    setSaving(true); setError('')
    const order: NewOrder = patientMode === 'registered'
      ? { patientId: selectedPatientId, tests, priority }
      : { patientName: trimmedPatientName, tests, priority }
    try { onCreated(await createOrder(order)); onClose() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'تعذر حفظ الطلب.') } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title" aria-describedby="new-order-description" aria-busy={saving || dataLoading}><div className="modal-heading"><div><h2 id="new-order-title">طلب تحليل جديد</h2><p id="new-order-description">اختر من السجلات المعتمدة أولًا. البيانات المعروضة تجريبية فقط.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق النافذة"><Icon name="x" size={18} /></button></div><form onSubmit={submitOrder} noValidate><fieldset className="order-section"><legend className="form-label">المريض <span className="required-mark">*</span></legend><div className="patient-mode-options" role="radiogroup" aria-label="طريقة ربط المريض"><label className={`mode-option ${patientMode === 'registered' ? 'mode-option-active' : ''}`}><input type="radio" name="patient-mode" value="registered" checked={patientMode === 'registered'} onChange={() => { setPatientMode('registered'); setError('') }} /><span><strong>مريض مسجل</strong><small>المسار الموصى به؛ يرسل patientId ويمنع إنشاء سجل مكرر.</small></span></label><label className={`mode-option ${patientMode === 'unregistered' ? 'mode-option-active' : ''}`}><input type="radio" name="patient-mode" value="unregistered" checked={patientMode === 'unregistered'} onChange={() => { setPatientMode('unregistered'); setError('') }} /><span><strong>مريض غير مسجل — compatibility fallback</strong><small>استخدمه فقط عند الحاجة؛ يرسل patientName وقد يؤدي إلى سجل توافق غير مرتبط.</small></span></label></div>{patientMode === 'registered' ? <><label className="form-label" htmlFor="patient-search">البحث في المرضى المسجلين</label><input id="patient-search" className="form-input" type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="ابحث بالاسم أو الهاتف…" autoFocus />{patientsLoading && <p className="field-status" role="status">جارٍ تحميل سجل المرضى…</p>}{!patientsLoading && patientsError && <p className="field-status field-status-error" id="patient-load-error" role="alert">{patientsError} <button className="text-button" type="button" onClick={() => void loadPatients()}>إعادة المحاولة</button></p>}{!patientsLoading && !patientsError && patients.length === 0 && <p className="field-status" role="status">لا يوجد مرضى مسجلون بعد. يمكنك استخدام compatibility fallback أو تسجيل مريض من قسم المرضى.</p>}<label className="form-label" htmlFor="registered-patient">المريض المسجل</label><select id="registered-patient" className="form-input patient-select" value={selectedPatientId} onChange={(event) => { setSelectedPatientId(event.target.value); setError('') }} disabled={patientsLoading || Boolean(patientsError) || patients.length === 0}><option value="">اختر مريضًا من السجل…</option>{filteredPatients.map((patient) => <option value={patient.id} key={patient.id}>{patient.fullName}{patient.phone ? ` · ${patient.phone}` : ''}</option>)}</select>{!patientsLoading && !patientsError && patients.length > 0 && filteredPatients.length === 0 && <p className="field-status" role="status">لا توجد نتائج مطابقة لهذا البحث.</p>}</> : <><div className="compatibility-warning" role="note"><strong>تنبيه التوافق</strong><span>هذا الخيار لا يربط الطلب بمريض مسجل. استخدمه للبيانات التجريبية أو عند تعذر التسجيل فقط.</span></div><label className="form-label" htmlFor="patient-name">اسم المريض غير المسجل</label><input id="patient-name" className="form-input" value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="مثال: مريض تجريبي 05" /></>}</fieldset><fieldset className="order-section test-picker"><legend className="form-label">الفحوصات <span className="required-mark">*</span></legend>{catalogLoading && <p className="field-status" role="status">جارٍ تحميل الفحوصات النشطة…</p>}{!catalogLoading && catalogError && <p className="field-status field-status-warning" role="alert">{catalogError} <button className="text-button" type="button" onClick={() => void loadCatalog()}>إعادة المحاولة</button></p>}{!catalogLoading && !catalogError && activeCatalog.map((test) => <label className="check-option" key={test.id}><input type="checkbox" checked={selectedTests.includes(test.name)} onChange={() => toggleTest(test.name)} />{test.name}</label>)}<label className={`check-option custom-test-option ${isCustomTestSelected ? 'check-option-active' : ''}`}><input type="checkbox" checked={isCustomTestSelected} onChange={() => { setCustomTestSelected((current) => !current); setError('') }} />فحص مخصص</label>{isCustomTestSelected && <><label className="form-label" htmlFor="custom-test">اسم الفحص المخصص</label><input id="custom-test" className="form-input" value={customTest} onChange={(event) => setCustomTest(event.target.value)} placeholder="اكتب اسم الفحص…" /></>}</fieldset><label className="form-label" htmlFor="priority">الأولوية</label><select id="priority" className="form-input" value={priority} onChange={(event) => setPriority(event.target.value as NewOrder['priority'])}><option value="normal">عادية</option><option value="urgent">عاجلة</option></select>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>إلغاء</button><button className="primary-button" type="submit" disabled={saving || dataLoading}>{saving ? 'جارٍ الحفظ…' : dataLoading ? 'جارٍ تحميل البيانات…' : 'حفظ الطلب'}</button></div></form></section></div>
}

function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')
  const [isModalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [authRequired, setAuthRequired] = useState(false)

  const refreshDashboard = useCallback(async () => {
    setLoading(true)
    try {
      setDashboard(await fetchDashboard())
      setApiError('')
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return
      setDashboard(FALLBACK_DASHBOARD)
      setApiError('تعذر الاتصال بالخادم؛ المعروض الآن بيانات تجريبية للتطوير.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handleAuthRequired = () => {
      clearStoredAuthToken()
      setUser(null)
      setAuthRequired(true)
      setModalOpen(false)
      setLoading(false)
    }
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
  }, [])

  useEffect(() => {
    if (getStoredAuthToken()) void fetchCurrentUser().then(setUser).catch((requestError: unknown) => {
      if (!(requestError instanceof ApiError && requestError.status === 401)) clearStoredAuthToken()
    })
    const timer = window.setTimeout(() => { void refreshDashboard() }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshDashboard])

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(timer) }, [toast])
  const showToast = (message: string, tone: ToastTone = 'success') => setToast({ message, tone })
  const selectAction = (label: string) => showToast(label)
  const addOrder = (order: Order) => { setDashboard((current) => current ? { ...current, recentOrders: [order, ...current.recentOrders], metrics: current.metrics.map((metric, index) => index === 0 ? { ...metric, value: String(Number(metric.value.replace(',', '')) + 1) } : metric), samples: { ...current.samples, total: current.samples.total + 1, needsAttention: current.samples.needsAttention + 1 } } : current); showToast('تم إنشاء طلب التحليل بنجاح') }
  const handleLoginSuccess = useCallback(async (session: LoginResponse) => {
    setStoredAuthToken(session.token)
    setUser(session.user)
    setAuthRequired(false)
    setCurrentView('dashboard')
    setApiError('')
    setDashboard(null)
    await refreshDashboard()
  }, [refreshDashboard])
  const handleLogout = useCallback(async () => {
    try { await logout() } catch { /* The local session must still be cleared. */ }
    clearStoredAuthToken()
    setUser(null)
    setAuthRequired(true)
    setModalOpen(false)
  }, [])
  const currentDashboard = dashboard ?? FALLBACK_DASHBOARD
  const profileName = user?.displayName ?? 'مدير الفرع'
  const profileRole = user ? ROLE_LABELS[user.role] : 'الفرع الرئيسي'
  const profileInitial = profileName.slice(0, 1)

  if (authRequired) return <LoginView onSuccess={handleLoginSuccess} />

  return <div className="app-shell">
    <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`} aria-label="التنقل الرئيسي"><div className="brand-lockup"><img src="/brand/ay-scan-logo.svg" alt="A.Y Scan" className="brand-logo" /><span className="brand-version">مركز التحاليل والأشعة</span></div><nav className="nav-section" aria-label="أقسام النظام"><p className="nav-label">مساحة العمل</p>{NAV_ITEMS.map((item) => <button className={`nav-item ${currentView === item.view ? 'nav-item-active' : ''}`} key={item.label} type="button" onClick={() => { setCurrentView(item.view); setSidebarOpen(false); setModalOpen(false) }}><Icon name={item.icon} /><span>{item.label}</span>{currentView === item.view && <span className="active-marker" aria-label="القسم الحالي" />}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item" type="button"><Icon name="settings" /><span>الإعدادات</span></button><div className="support-card"><span className="support-icon"><Icon name="bell" size={18} /></span><div><strong>تحتاج مساعدة؟</strong><span>تواصل مع الدعم الفني</span></div><Icon name="arrow" size={16} /></div><div className="sidebar-user"><span className="avatar avatar-cyan">{profileInitial}</span><div><strong>{profileName}</strong><span>{profileRole}</span></div><button type="button" onClick={() => void handleLogout()} aria-label="تسجيل الخروج من الحساب">•••</button></div></div></aside>
    <main className="main-content"><header className="topbar"><button className="mobile-menu" type="button" aria-label="فتح قائمة التنقل" onClick={() => setSidebarOpen(!isSidebarOpen)}><Icon name="menu" /></button><div className="breadcrumbs"><span>الرئيسية</span><span className="breadcrumb-separator">/</span><strong>{VIEW_LABELS[currentView]}</strong></div><div className="topbar-actions"><span className="today-label">الأربعاء، 21 مايو 2025</span><button className="icon-button" type="button" aria-label="الإشعارات"><Icon name="bell" /><span className="notification-dot" /></button><span className="topbar-divider" /><button className="profile-chip" type="button" onClick={() => void handleLogout()} aria-label="تسجيل الخروج من الحساب"><span className="avatar avatar-navy">{profileInitial}</span><span className="profile-name">{profileName}</span><span className="chevron">⌄</span></button></div></header>
      <div className={`content-wrap ${currentView === 'dashboard' ? '' : 'dashboard-content-hidden'}`}><section className="welcome-row" aria-labelledby="dashboard-title"><div><h1 id="dashboard-title">صباح الخير، {profileName} <span className="wave" aria-hidden="true">✦</span></h1><p>إليك ملخص أداء المركز لهذا اليوم.</p></div><button className="primary-button" type="button" onClick={() => setModalOpen(true)}><Icon name="plus" size={18} />طلب تحليل جديد</button></section>
        {apiError && <div className="api-notice" role="status"><Icon name="alert" size={16} />{apiError}</div>}
        {loading ? <div className="state-card" role="status">جارٍ تحميل بيانات لوحة التحكم…</div> : <><section className="metrics-grid" aria-label="مؤشرات اليوم">{currentDashboard.metrics.map((metric) => <article className={`metric-card metric-${metric.tone}`} key={metric.label}><div className="metric-icon"><Icon name={metric.icon} size={21} /></div><div className="metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></div><span className="metric-kebab" aria-hidden="true">•••</span></article>)}</section><div className="dashboard-grid"><section className="panel orders-panel" aria-labelledby="orders-title"><div className="panel-heading"><div><h2 id="orders-title">آخر طلبات التحاليل</h2><p>تتابع لحظي للطلبات الأخيرة في المركز</p></div><button className="text-button" type="button" onClick={() => selectAction('عرض كل الطلبات')}>عرض الكل <Icon name="arrow" size={16} /></button></div><div className="orders-table-wrap">{currentDashboard.recentOrders.length === 0 ? <div className="empty-state">لا توجد طلبات بعد.</div> : <table><thead><tr><th scope="col">رقم الطلب</th><th scope="col">المريض</th><th scope="col">الفحوصات</th><th scope="col">الوقت</th><th scope="col">الحالة</th><th scope="col"><span className="sr-only">إجراء</span></th></tr></thead><tbody>{currentDashboard.recentOrders.map((order) => <tr key={order.id}><td><span className="order-id" dir="ltr">{order.id}</span></td><td><strong>{order.patient}</strong></td><td><span className="test-name">{order.tests}</span></td><td><span className="muted-with-icon"><Icon name="clock" size={14} />{order.time}</span></td><td><StatusBadge state={order.state} tone={order.tone} /></td><td><button className="row-action" type="button" aria-label={`فتح تفاصيل الطلب ${order.id}`} onClick={() => selectAction(`تفاصيل ${order.id}`)}>•••</button></td></tr>)}</tbody></table>}</div></section><section className="panel samples-panel" aria-labelledby="samples-title"><div className="panel-heading"><div><h2 id="samples-title">حالة العينات</h2><p>التوزيع الحالي للعينات</p></div><button className="icon-button subtle" type="button" aria-label="تحديث حالة العينات"><Icon name="arrow" size={17} /></button></div><div className="sample-summary"><div className="donut" aria-label={`نسبة العينات المكتملة ${currentDashboard.samples.completionRate} بالمئة`}><span>{currentDashboard.samples.completionRate}<small>%</small></span></div><div className="sample-total"><strong>{currentDashboard.samples.total}</strong><span>إجمالي العينات</span></div></div><div className="legend"><div><span className="legend-mark mark-cyan" /><span>قيد الفحص</span><strong>{currentDashboard.samples.inProgress}</strong></div><div><span className="legend-mark mark-lime" /><span>مكتملة</span><strong>{currentDashboard.samples.completed}</strong></div><div><span className="legend-mark mark-orange" /><span>تحتاج متابعة</span><strong>{currentDashboard.samples.needsAttention}</strong></div></div></section></div></>}</div>
       {toast && <div className={`toast ${toast.tone === 'error' ? 'toast-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}><Icon name={toast.tone === 'error' ? 'alert' : 'check'} size={17} />{toast.message}</div>}{currentView === 'patients' && <div className="content-wrap"><PatientsView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'catalog' && <div className="content-wrap"><CatalogView onBack={() => setCurrentView('dashboard')} /></div>}{currentView === 'operations' && <div className="content-wrap"><OperationsView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'radiology' && <div className="content-wrap"><RadiologyView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'home-visits' && <div className="content-wrap"><HomeVisitsView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'billing' && <div className="content-wrap"><BillingView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'insurance' && <div className="content-wrap"><InsuranceView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'inventory' && <div className="content-wrap"><InventoryView onBack={() => setCurrentView('dashboard')} onToast={showToast} /></div>}{currentView === 'reports' && <div className="content-wrap"><ReportsView onBack={() => setCurrentView('dashboard')} /></div>}
    </main>{isModalOpen && <NewOrderModal onClose={() => setModalOpen(false)} onCreated={addOrder} />}
  </div>
}

export default App

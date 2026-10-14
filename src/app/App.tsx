import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  AUTH_REQUIRED_EVENT,
  clearStoredAuthToken,
  fetchCurrentUser,
  fetchDashboard,
  getStoredAuthToken,
  logout,
  PASSWORD_CHANGE_REQUIRED_EVENT,
  ROLE_LABELS,
  setStoredAuthToken,
  type AuthenticatedUser,
  type Capability,
  type Dashboard,
  type LoginResponse,
} from './api'
import { ChangePasswordDialog, RequiredPasswordChangeView } from './ChangePasswordView'
import BillingView from './BillingView'
import CatalogView from './CatalogView'
import DashboardView from './DashboardView'
import DevicesView from './DevicesView'
import HomeVisitsView from './HomeVisitsView'
import { Icon, type IconName } from './Icon'
import InsuranceView from './InsuranceView'
import InventoryView from './InventoryView'
import LoginView from './LoginView'
import NewOrderModal from './NewOrderModal'
import OperationsView from './OperationsView'
import PatientsView from './PatientsView'
import RadiologyView from './RadiologyView'
import ReportsView from './ReportsView'
import Phase1View from './Phase1View'
import { createSession, SessionContext, type Session } from './session'
import { PublicReportVerification } from './LabReportView'
import UsersView from './UsersView'

type AppView = 'dashboard' | 'patients' | 'catalog' | 'phase1' | 'operations' | 'radiology' | 'home-visits' | 'billing' | 'inventory' | 'insurance' | 'devices' | 'reports' | 'users'
type ToastTone = 'success' | 'error'
type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'ready'; user: AuthenticatedUser; capabilities: Capability[] }

type NavItem = { label: string; icon: IconName; view: AppView; /** The user needs at least one of these. */ anyOf: Capability[] }

const NAV_ITEMS: NavItem[] = [
  { label: 'نظرة عامة', icon: 'grid', view: 'dashboard', anyOf: ['dashboard.view'] },
  { label: 'المرضى', icon: 'users', view: 'patients', anyOf: ['patients.view'] },
  { label: 'دليل التحاليل', icon: 'flask', view: 'catalog', anyOf: ['catalog.view'] },
  { label: 'إعدادات Phase 1', icon: 'settings', view: 'phase1', anyOf: ['settings.view', 'practitioners.view', 'bundles.view', 'ranges.view'] },
  { label: 'عمليات المختبر', icon: 'scan', view: 'operations', anyOf: ['specimens.view', 'results.view'] },
  { label: 'الأشعة', icon: 'scan', view: 'radiology', anyOf: ['radiology.view'] },
  { label: 'الزيارات المنزلية', icon: 'home', view: 'home-visits', anyOf: ['homeVisits.view'] },
  { label: 'الطلبات والفواتير', icon: 'receipt', view: 'billing', anyOf: ['billing.view'] },
  { label: 'التأمين', icon: 'receipt', view: 'insurance', anyOf: ['insurance.view'] },
  { label: 'المخزون', icon: 'box', view: 'inventory', anyOf: ['inventory.view'] },
  { label: 'الأجهزة', icon: 'settings', view: 'devices', anyOf: ['devices.view'] },
  { label: 'التقارير', icon: 'chart', view: 'reports', anyOf: ['reports.view'] },
  { label: 'المستخدمون', icon: 'key', view: 'users', anyOf: ['users.manage'] },
]

function viewLabel(view: AppView): string {
  return NAV_ITEMS.find((item) => item.view === view)?.label ?? ''
}

function Toast({ toast }: { toast: { message: string; tone: ToastTone } | null }) {
  if (!toast) return null
  return <div className={`toast ${toast.tone === 'error' ? 'toast-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
    <Icon name={toast.tone === 'error' ? 'alert' : 'check'} size={17} />{toast.message}
  </div>
}

function UserMenu({ user, onChangePassword, onLogout }: { user: AuthenticatedUser; onChangePassword: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (container.current && !container.current.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return <div className="user-menu" ref={container}>
    <button className="profile-chip" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="avatar avatar-navy">{user.displayName.slice(0, 1)}</span>
      <span className="profile-name">{user.displayName}</span>
      <span className="chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="user-menu-popover" role="menu">
      <div className="user-menu-identity"><strong>{user.displayName}</strong><span>{ROLE_LABELS[user.role]}</span><span dir="ltr">{user.username}</span></div>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onChangePassword() }}><Icon name="key" size={16} />تغيير كلمة المرور</button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout() }}><Icon name="logout" size={16} />تسجيل الخروج</button>
    </div>}
  </div>
}

function AuthenticatedApp({ session, onSessionUserChange, onLogout }: { session: Session; onSessionUserChange: (user: AuthenticatedUser) => void; onLogout: () => void }) {
  const { user, can } = session
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [isOrderModalOpen, setOrderModalOpen] = useState(false)
  const [isPasswordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)

  const visibleNav = useMemo(() => NAV_ITEMS.filter((item) => item.anyOf.some((capability) => can(capability))), [can])

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      setDashboard(await fetchDashboard())
      setDashboardError('')
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return
      setDashboardError(requestError instanceof Error ? requestError.message : 'تعذر تحميل لوحة التحكم.')
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!can('dashboard.view')) return
    const timer = window.setTimeout(() => { void refreshDashboard() }, 0)
    return () => window.clearTimeout(timer)
  }, [can, refreshDashboard])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => setToast({ message, tone }), [])
  const goTo = useCallback((view: AppView) => { setCurrentView(view); setSidebarOpen(false); setOrderModalOpen(false) }, [])
  const backToDashboard = useCallback(() => goTo('dashboard'), [goTo])

  const activeView = visibleNav.some((item) => item.view === currentView) ? currentView : (visibleNav[0]?.view ?? 'dashboard')

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView displayName={user.displayName} dashboard={dashboard} loading={dashboardLoading} error={dashboardError} canCreateOrder={can('orders.create')} onRetry={() => void refreshDashboard()} onNewOrder={() => setOrderModalOpen(true)} />
      case 'patients': return <div className="content-wrap"><PatientsView onBack={backToDashboard} onToast={showToast} /></div>
      case 'catalog': return <div className="content-wrap"><CatalogView onBack={backToDashboard} onToast={showToast} /></div>
      case 'phase1': return <div className="content-wrap"><Phase1View onBack={backToDashboard} onToast={showToast} /></div>
       case 'operations': return <div className="content-wrap"><OperationsView onBack={backToDashboard} onToast={showToast} /></div>
      case 'radiology': return <div className="content-wrap"><RadiologyView onBack={backToDashboard} onToast={showToast} /></div>
      case 'home-visits': return <div className="content-wrap"><HomeVisitsView onBack={backToDashboard} onToast={showToast} /></div>
      case 'billing': return <div className="content-wrap"><BillingView onBack={backToDashboard} onToast={showToast} /></div>
      case 'insurance': return <div className="content-wrap"><InsuranceView onBack={backToDashboard} onToast={showToast} /></div>
      case 'inventory': return <div className="content-wrap"><InventoryView onBack={backToDashboard} onToast={showToast} /></div>
      case 'devices': return <div className="content-wrap"><DevicesView onBack={backToDashboard} onToast={showToast} /></div>
      case 'reports': return <div className="content-wrap"><ReportsView onBack={backToDashboard} /></div>
      case 'users': return <div className="content-wrap"><UsersView onBack={backToDashboard} onToast={showToast} /></div>
    }
  }

  return <SessionContext.Provider value={session}>
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`} aria-label="التنقل الرئيسي">
        <div className="brand-lockup"><img src="/brand/ay-scan-logo.svg" alt="A.Y Scan" className="brand-logo" /><span className="brand-version">مركز التحاليل والأشعة</span></div>
        <nav className="nav-section" aria-label="أقسام النظام">
          <p className="nav-label">مساحة العمل</p>
          {visibleNav.map((item) => <button className={`nav-item ${activeView === item.view ? 'nav-item-active' : ''}`} key={item.view} type="button" aria-current={activeView === item.view ? 'page' : undefined} onClick={() => goTo(item.view)}>
            <Icon name={item.icon} /><span>{item.label}</span>{activeView === item.view && <span className="active-marker" aria-hidden="true" />}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user"><span className="avatar avatar-cyan">{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><span>{ROLE_LABELS[user.role]}</span></div></div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="فتح قائمة التنقل" aria-expanded={isSidebarOpen} onClick={() => setSidebarOpen((current) => !current)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>الرئيسية</span><span className="breadcrumb-separator">/</span><strong>{viewLabel(activeView)}</strong></div>
          <div className="topbar-actions">
            <UserMenu user={user} onChangePassword={() => setPasswordDialogOpen(true)} onLogout={onLogout} />
          </div>
        </header>
        {renderView()}
        <Toast toast={toast} />
      </main>
      {isOrderModalOpen && can('orders.create') && <NewOrderModal
        onClose={() => setOrderModalOpen(false)}
        onCreated={() => { showToast('تم إنشاء طلب التحليل بنجاح'); void refreshDashboard() }}
        onRegisterPatient={can('patients.create') ? () => goTo('patients') : undefined}
      />}
      {isPasswordDialogOpen && <ChangePasswordDialog
        onClose={() => setPasswordDialogOpen(false)}
        onChanged={(updated) => { onSessionUserChange(updated); setPasswordDialogOpen(false); showToast('تم تغيير كلمة المرور') }}
      />}
    </div>
  </SessionContext.Provider>
}

function App() {
  const [auth, setAuth] = useState<AuthState>(() => (getStoredAuthToken() ? { status: 'loading' } : { status: 'anonymous' }))

  useEffect(() => {
    const handleAuthRequired = () => {
      clearStoredAuthToken()
      setAuth({ status: 'anonymous' })
    }
    const handlePasswordChangeRequired = () => {
      setAuth((current) => current.status === 'ready' ? { ...current, user: { ...current.user, mustChangePassword: true } } : current)
    }
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handlePasswordChangeRequired)
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
      window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handlePasswordChangeRequired)
    }
  }, [])

  useEffect(() => {
    if (auth.status !== 'loading') return
    let cancelled = false
    fetchCurrentUser()
      .then(({ user, capabilities }) => { if (!cancelled) setAuth({ status: 'ready', user, capabilities }) })
      .catch((requestError: unknown) => {
        if (cancelled) return
        // Only a rejected token ends the session; a stopped server keeps the token so a reload can recover.
        if (requestError instanceof ApiError && requestError.status === 401) clearStoredAuthToken()
        setAuth({ status: 'anonymous' })
      })
    return () => { cancelled = true }
  }, [auth.status])

  const handleLoginSuccess = useCallback((response: LoginResponse) => {
    setStoredAuthToken(response.token)
    setAuth({ status: 'ready', user: response.user, capabilities: response.capabilities })
  }, [])

  const handleLogout = useCallback(async () => {
    try { await logout() } catch { /* The local session must still be cleared. */ }
    clearStoredAuthToken()
    setAuth({ status: 'anonymous' })
  }, [])

  const handleUserChange = useCallback((user: AuthenticatedUser) => {
    setAuth((current) => current.status === 'ready' ? { ...current, user } : current)
  }, [])

  const session = useMemo(() => auth.status === 'ready' ? createSession(auth.user, auth.capabilities) : null, [auth])

  const verificationMatch = window.location.pathname.match(/^\/report-verification\/([^/]+)\/?$/)
  if (verificationMatch) return <PublicReportVerification token={decodeURIComponent(verificationMatch[1])} />
  if (auth.status === 'loading') return <div className="boot-screen" role="status" aria-live="polite">جارٍ التحميل…</div>
  if (auth.status === 'anonymous' || !session) return <LoginView onSuccess={handleLoginSuccess} />
  if (auth.user.mustChangePassword) return <RequiredPasswordChangeView user={auth.user} onChanged={handleUserChange} onLogout={() => void handleLogout()} />
  return <AuthenticatedApp session={session} onSessionUserChange={handleUserChange} onLogout={() => void handleLogout()} />
}

export default App

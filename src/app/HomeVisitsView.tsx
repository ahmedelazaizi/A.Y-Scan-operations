import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createHomeVisit,
  fetchHomeVisits,
  transitionHomeVisit,
  type HomeVisit,
  type HomeVisitStatus,
  type NewHomeVisit,
} from './api'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type HomeVisitsViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type VisitFilter = HomeVisitStatus | 'all'
type HomeVisitDraft = { patientId: string; orderId: string; address: string; contactPhone: string; scheduledAt: string; assignedTo: string; notes: string }
type StatusTone = 'info' | 'success' | 'warning' | 'danger'

const EMPTY_DRAFT: HomeVisitDraft = { patientId: '', orderId: '', address: '', contactPhone: '', scheduledAt: '', assignedTo: '', notes: '' }
const HOME_VISIT_STATUS_LABELS: Record<HomeVisitStatus, string> = { scheduled: 'مجدولة', confirmed: 'مؤكدة', in_progress: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغاة' }
const HOME_VISIT_STATUS_TONES: Record<HomeVisitStatus, StatusTone> = { scheduled: 'info', confirmed: 'success', in_progress: 'warning', completed: 'success', cancelled: 'danger' }
const STATUS_FILTER_OPTIONS: Array<{ value: VisitFilter; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  ...Object.entries(HOME_VISIT_STATUS_LABELS).map(([value, label]) => ({ value: value as HomeVisitStatus, label })),
]
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORDER_ID_PATTERN = /^AY-\d+$/
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'غير محدد' : dateTimeFormatter.format(date)
}

function getNextStatuses(status: HomeVisitStatus): HomeVisitStatus[] {
  if (status === 'scheduled') return ['confirmed', 'cancelled']
  if (status === 'confirmed') return ['in_progress', 'cancelled']
  if (status === 'in_progress') return ['completed', 'cancelled']
  return []
}

function StatusBadge({ status }: { status: HomeVisitStatus }) {
  return <span className={`status status-${HOME_VISIT_STATUS_TONES[status]}`}><span className="status-dot" aria-hidden="true" />{HOME_VISIT_STATUS_LABELS[status]}</span>
}

function CreateHomeVisitPanel({ onCreated, onToast }: { onCreated: () => Promise<void>; onToast: HomeVisitsViewProps['onToast'] }) {
  const [draft, setDraft] = useState<HomeVisitDraft>(EMPTY_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateDraft = (field: keyof HomeVisitDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const patientId = draft.patientId.trim()
    const orderId = draft.orderId.trim().toUpperCase()
    const homeVisit: NewHomeVisit = {
      patientId,
      address: draft.address.trim(),
      contactPhone: draft.contactPhone.trim(),
      scheduledAt: draft.scheduledAt,
      ...(orderId ? { orderId } : {}),
      ...(draft.assignedTo.trim() ? { assignedTo: draft.assignedTo.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    }
    if (!UUID_PATTERN.test(patientId)) { setError('أدخل معرّف مريض صحيحًا بصيغة UUID.'); return }
    if (orderId && !ORDER_ID_PATTERN.test(orderId)) { setError('رقم الطلب الاختياري يجب أن يكون بصيغة AY-12345.'); return }
    if (!homeVisit.address || !homeVisit.contactPhone || !homeVisit.scheduledAt) { setError('أكمل العنوان والهاتف وموعد الزيارة.'); return }
    if (Number.isNaN(new Date(homeVisit.scheduledAt).getTime())) { setError('أدخل موعدًا صحيحًا للزيارة.'); return }
    setSaving(true)
    setError('')
    try {
      await createHomeVisit(homeVisit)
      setDraft(EMPTY_DRAFT)
      await onCreated()
      onToast('تم إنشاء الزيارة المنزلية بنجاح')
    } catch (requestError) {
      const message = getErrorMessage(requestError, 'تعذر إنشاء الزيارة المنزلية.')
      setError(message)
      onToast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel home-visit-create-panel" aria-labelledby="create-home-visit-title">
    <div className="panel-heading"><div><h2 id="create-home-visit-title">إنشاء زيارة منزلية</h2><p>أدخل بيانات الزيارة؛ لا تستخدم بيانات حقيقية في بيئة التطوير.</p></div></div>
    <form className="home-visit-form" onSubmit={submit} noValidate aria-describedby={error ? 'home-visit-form-error' : 'home-visit-form-note'}>
      <p id="home-visit-form-note" className="form-note">يجب أن يكون `patientId` بصيغة UUID، والطلب الاختياري بصيغة `AY-*`.</p>
      <div className="home-visit-form-grid">
        <div><label className="form-label" htmlFor="home-visit-patient-id">معرّف المريض <span className="required-mark">*</span></label><input id="home-visit-patient-id" className="form-input" value={draft.patientId} onChange={(event) => updateDraft('patientId', event.target.value)} placeholder="UUID المريض" dir="ltr" required /></div>
        <div><label className="form-label" htmlFor="home-visit-order-id">طلب AY <span className="optional-label">اختياري</span></label><input id="home-visit-order-id" className="form-input" value={draft.orderId} onChange={(event) => updateDraft('orderId', event.target.value)} placeholder="AY-10482" dir="ltr" /></div>
        <div className="home-visit-field-full"><label className="form-label" htmlFor="home-visit-address">العنوان <span className="required-mark">*</span></label><input id="home-visit-address" className="form-input" value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} placeholder="العنوان التفصيلي للزيارة" required /></div>
        <div><label className="form-label" htmlFor="home-visit-phone">هاتف التواصل <span className="required-mark">*</span></label><input id="home-visit-phone" className="form-input" type="tel" value={draft.contactPhone} onChange={(event) => updateDraft('contactPhone', event.target.value)} placeholder="01000000000" dir="ltr" required /></div>
        <div><label className="form-label" htmlFor="home-visit-scheduled-at">موعد الزيارة <span className="required-mark">*</span></label><input id="home-visit-scheduled-at" className="form-input" type="datetime-local" value={draft.scheduledAt} onChange={(event) => updateDraft('scheduledAt', event.target.value)} dir="ltr" required /></div>
        <div className="home-visit-field-full"><label className="form-label" htmlFor="home-visit-assignee">المكلّف بالزيارة <span className="optional-label">اختياري</span></label><input id="home-visit-assignee" className="form-input" value={draft.assignedTo} onChange={(event) => updateDraft('assignedTo', event.target.value)} placeholder="اسم المكلّف أو معرّفه" /></div>
        <div className="home-visit-field-full"><label className="form-label" htmlFor="home-visit-notes">ملاحظات <span className="optional-label">اختياري</span></label><textarea id="home-visit-notes" className="form-input home-visit-notes" rows={3} value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="تعليمات أو ملاحظات للفريق" /></div>
      </div>
      {error && <p id="home-visit-form-error" className="form-error" role="alert">{error}</p>}
      <button className="primary-button home-visit-submit" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'إنشاء الزيارة'}</button>
    </form>
  </section>
}

function HomeVisitActions({ visit, busy, onTransition }: { visit: HomeVisit; busy: boolean; onTransition: (visit: HomeVisit, status: HomeVisitStatus) => void }) {
  const nextStatuses = getNextStatuses(visit.status)
  if (!nextStatuses.length) return <span className="muted-note">لا توجد خطوة تالية</span>
  return <div className="home-visit-actions">{nextStatuses.map((status) => <button className="secondary-button row-action-button" type="button" key={status} onClick={() => onTransition(visit, status)} disabled={busy}>{busy ? 'جارٍ التحديث…' : `نقل إلى ${HOME_VISIT_STATUS_LABELS[status]}`}</button>)}</div>
}

type HomeVisitListProps = { visits: HomeVisit[]; loading: boolean; error: string; filterError: string; patientFilterDraft: string; statusFilter: VisitFilter; onPatientFilterChange: (value: string) => void; onApplyPatientFilter: () => void; onClearPatientFilter: () => void; onStatusFilterChange: (value: VisitFilter) => void; onRetry: () => void; busyVisitId: string | null; onTransition: (visit: HomeVisit, status: HomeVisitStatus) => void }

function HomeVisitList({ visits, loading, error, filterError, patientFilterDraft, statusFilter, onPatientFilterChange, onApplyPatientFilter, onClearPatientFilter, onStatusFilterChange, onRetry, busyVisitId, onTransition }: HomeVisitListProps) {
  return <section className="panel home-visit-list-panel" aria-labelledby="home-visit-list-title">
    <div className="panel-heading home-visits-list-heading"><div><h2 id="home-visit-list-title">الزيارات المنزلية</h2><p>تابع المواعيد وطبّق الانتقالات القانونية للحالة.</p></div><form className="home-visits-filter" onSubmit={(event) => { event.preventDefault(); onApplyPatientFilter() }}><label className="form-label" htmlFor="home-visit-patient-filter">تصفية بمعرّف المريض</label><div className="home-visits-filter-controls"><input id="home-visit-patient-filter" className="form-input" value={patientFilterDraft} onChange={(event) => onPatientFilterChange(event.target.value)} placeholder="UUID اختياري" dir="ltr" /><button className="secondary-button" type="submit">تطبيق</button>{patientFilterDraft && <button className="text-button" type="button" onClick={onClearPatientFilter}>مسح</button>}</div>{filterError && <p className="form-error" role="alert">{filterError}</p>}</form><label className="filter-field home-visits-status-filter" htmlFor="home-visit-status-filter"><span>تصفية الحالة</span><select id="home-visit-status-filter" className="form-input" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as VisitFilter)}>{STATUS_FILTER_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div>
    {loading && <div className="state-card" role="status">جارٍ تحميل الزيارات المنزلية…</div>}
    {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الزيارات</strong><span>{error}</span><button className="secondary-button" type="button" onClick={onRetry}>إعادة المحاولة</button></div>}
    {!loading && !error && visits.length === 0 && <div className="state-card" role="status">لا توجد زيارات مطابقة للفلاتر الحالية.</div>}
    {!loading && !error && visits.length > 0 && <div className="home-visits-table-wrap"><table className="home-visits-table"><caption className="sr-only">قائمة الزيارات المنزلية</caption><thead><tr><th scope="col">المعرّف</th><th scope="col">المريض / الطلب</th><th scope="col">العنوان / التواصل</th><th scope="col">الموعد</th><th scope="col">المكلّف</th><th scope="col">الحالة</th><th scope="col">إجراءات الانتقال</th></tr></thead><tbody>{visits.map((visit) => <tr key={visit.id}><td data-label="المعرّف"><span className="home-visit-code" dir="ltr">{visit.id}</span></td><td data-label="المريض / الطلب"><span className="home-visit-code" dir="ltr">{visit.patientId}</span><span className="table-subtext">{visit.orderId ? `طلب ${visit.orderId}` : 'بدون طلب'}</span></td><td data-label="العنوان / التواصل"><strong>{visit.address}</strong><span className="table-subtext" dir="ltr">{visit.contactPhone}</span>{visit.notes && <span className="table-subtext">{visit.notes}</span>}</td><td data-label="الموعد" dir="ltr">{formatDateTime(visit.scheduledAt)}</td><td data-label="المكلّف">{visit.assignedTo || <span className="muted-note">غير معيّن</span>}</td><td data-label="الحالة"><StatusBadge status={visit.status} /></td><td data-label="إجراءات الانتقال"><HomeVisitActions visit={visit} busy={busyVisitId === visit.id} onTransition={onTransition} /></td></tr>)}</tbody></table></div>}
  </section>
}

function HomeVisitsView({ onBack, onToast }: HomeVisitsViewProps) {
  const [visits, setVisits] = useState<HomeVisit[]>([])
  const [patientFilterDraft, setPatientFilterDraft] = useState('')
  const [patientFilter, setPatientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<VisitFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterError, setFilterError] = useState('')
  const [busyVisitId, setBusyVisitId] = useState<string | null>(null)

  const loadVisits = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setVisits(await fetchHomeVisits(patientFilter, statusFilter === 'all' ? undefined : statusFilter))
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'تعذر تحميل الزيارات المنزلية.'))
    } finally {
      setLoading(false)
    }
  }, [patientFilter, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadVisits(), 0)
    return () => window.clearTimeout(timer)
  }, [loadVisits])

  const applyPatientFilter = () => {
    const nextFilter = patientFilterDraft.trim()
    if (nextFilter && !UUID_PATTERN.test(nextFilter)) { setFilterError('أدخل معرّف مريض صحيحًا بصيغة UUID أو اترك الفلتر فارغًا.'); return }
    setFilterError('')
    setPatientFilter(nextFilter)
  }

  const clearPatientFilter = () => { setPatientFilterDraft(''); setPatientFilter(''); setFilterError('') }
  const transitionVisit = async (visit: HomeVisit, status: HomeVisitStatus) => {
    setBusyVisitId(visit.id)
    try {
      await transitionHomeVisit(visit.id, status)
      await loadVisits()
      onToast(`تم نقل الزيارة إلى حالة ${HOME_VISIT_STATUS_LABELS[status]}`)
    } catch (requestError) {
      onToast(getErrorMessage(requestError, 'تعذر تحديث حالة الزيارة المنزلية.'), 'error')
    } finally {
      setBusyVisitId(null)
    }
  }

  return <div dir="rtl" className="home-visits-view"><ViewHeader title="الزيارات المنزلية" description="أنشئ الزيارات المنزلية وتابع حالتها ضمن مسار تشغيلي واضح. تُحمّل البيانات من API؛ لا تستخدم بيانات حقيقية في بيئة التطوير." onBack={onBack} /><div className="home-visits-layout"><CreateHomeVisitPanel onCreated={loadVisits} onToast={onToast} /><div className="home-visits-list-stack"><HomeVisitList visits={visits} loading={loading} error={error} filterError={filterError} patientFilterDraft={patientFilterDraft} statusFilter={statusFilter} onPatientFilterChange={(value) => { setPatientFilterDraft(value); if (filterError) setFilterError('') }} onApplyPatientFilter={applyPatientFilter} onClearPatientFilter={clearPatientFilter} onStatusFilterChange={setStatusFilter} onRetry={() => void loadVisits()} busyVisitId={busyVisitId} onTransition={(visit, status) => void transitionVisit(visit, status)} /></div></div></div>
}

export default HomeVisitsView

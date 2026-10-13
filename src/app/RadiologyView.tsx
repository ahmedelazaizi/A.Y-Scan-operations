import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createRadiologyStudy,
  fetchPatients,
  fetchRadiologyStudies,
  reportRadiologyStudy,
  startRadiologyStudy,
  verifyRadiologyStudy,
  type NewRadiologyStudy,
  type Patient,
  type RadiologyModality,
  type RadiologyPriority,
  type RadiologyStudy,
  type RadiologyStudyStatus,
} from './api'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type RadiologyViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type StudyFilter = RadiologyStudyStatus | 'all'
type StudyDraft = { patientId: string; modality: RadiologyModality; bodyPart: string; priority: RadiologyPriority; scheduledAt: string; referringProvider: string }
type ReportDraft = { reportText: string; impression: string }
type StatusTone = 'info' | 'success' | 'warning' | 'danger'

const EMPTY_STUDY_DRAFT: StudyDraft = { patientId: '', modality: 'xray', bodyPart: '', priority: 'normal', scheduledAt: '', referringProvider: '' }
const EMPTY_REPORT_DRAFT: ReportDraft = { reportText: '', impression: '' }
const STATUS_LABELS: Record<RadiologyStudyStatus, string> = { scheduled: 'مجدولة', in_progress: 'قيد التنفيذ', reported: 'تم التقرير', verified: 'تم التحقق', cancelled: 'ملغاة' }
const STATUS_TONES: Record<RadiologyStudyStatus, StatusTone> = { scheduled: 'warning', in_progress: 'info', reported: 'success', verified: 'success', cancelled: 'danger' }
const MODALITY_LABELS: Record<RadiologyModality, string> = { xray: 'أشعة سينية', ct: 'أشعة مقطعية CT', mri: 'رنين مغناطيسي MRI', ultrasound: 'موجات فوق صوتية', mammography: 'ماموغرام', pet_ct: 'PET/CT', other: 'أخرى' }
const PRIORITY_LABELS: Record<RadiologyPriority, string> = { normal: 'عادية', urgent: 'عاجلة', stat: 'فورية STAT' }
const STATUS_OPTIONS: Array<{ value: StudyFilter; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'scheduled', label: STATUS_LABELS.scheduled },
  { value: 'in_progress', label: STATUS_LABELS.in_progress },
  { value: 'reported', label: STATUS_LABELS.reported },
  { value: 'verified', label: STATUS_LABELS.verified },
  { value: 'cancelled', label: STATUS_LABELS.cancelled },
]
const MODALITY_OPTIONS: RadiologyModality[] = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'pet_ct', 'other']
const PRIORITY_OPTIONS: RadiologyPriority[] = ['normal', 'urgent', 'stat']
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

function formatStudyDate(value: string | null) {
  if (!value) return 'غير محدد'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'غير محدد' : dateFormatter.format(date)
}

function StatusBadge({ status }: { status: RadiologyStudyStatus }) {
  return <span className={`status status-${STATUS_TONES[status]}`}><span className="status-dot" aria-hidden="true" />{STATUS_LABELS[status]}</span>
}

function CreateStudyPanel({ patients, patientsLoading, patientsError, onCreated, onToast }: { patients: Patient[]; patientsLoading: boolean; patientsError: string; onCreated: () => Promise<void>; onToast: RadiologyViewProps['onToast'] }) {
  const [draft, setDraft] = useState<StudyDraft>(EMPTY_STUDY_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateDraft = (field: keyof StudyDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const submitStudy = async (event: FormEvent) => {
    event.preventDefault()
    const patientId = draft.patientId.trim()
    const bodyPart = draft.bodyPart.trim()
    if (!patientId || !bodyPart) { setError('أكمل patientId والجزء المراد تصويره.'); return }
    const study: NewRadiologyStudy = { patientId, modality: draft.modality, bodyPart, priority: draft.priority, ...(draft.scheduledAt && { scheduledAt: new Date(draft.scheduledAt).toISOString() }), ...(draft.referringProvider.trim() && { referringProvider: draft.referringProvider.trim() }) }
    setSaving(true)
    setError('')
    try {
      await createRadiologyStudy(study)
      setDraft(EMPTY_STUDY_DRAFT)
      await onCreated()
      onToast('تم إنشاء دراسة الأشعة بحالة مجدولة')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر إنشاء دراسة الأشعة.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel radiology-create-panel" aria-labelledby="create-radiology-title">
    <div className="panel-heading"><div><h2 id="create-radiology-title">دراسة أشعة جديدة</h2><p>ابدأ دائمًا من patientId مسجل في السجل.</p></div></div>
    <form className="radiology-form" onSubmit={submitStudy} noValidate aria-describedby={error ? 'radiology-form-error' : undefined}>
      <div className="radiology-form-grid">
        <div className="radiology-field-full"><label className="form-label" htmlFor="radiology-patient-id">patientId <span className="required-mark">*</span></label>{patientsLoading ? <p className="field-status" role="status">جارٍ تحميل سجل المرضى…</p> : patients.length > 0 ? <select id="radiology-patient-id" className="form-input" value={draft.patientId} onChange={(event) => updateDraft('patientId', event.target.value)} required><option value="">اختر مريضًا من السجل</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.fullName} — {patient.id}</option>)}</select> : <input id="radiology-patient-id" className="form-input" value={draft.patientId} onChange={(event) => updateDraft('patientId', event.target.value)} placeholder="UUID المريض — تجريبي" dir="ltr" required />}{patientsError && <p className="field-status field-status-error">تعذر تحميل السجل؛ أدخل patientId يدويًا.</p>}</div>
        <div><label className="form-label" htmlFor="radiology-modality">نوع التصوير <span className="required-mark">*</span></label><select id="radiology-modality" className="form-input" value={draft.modality} onChange={(event) => updateDraft('modality', event.target.value as RadiologyModality)}>{MODALITY_OPTIONS.map((modality) => <option value={modality} key={modality}>{MODALITY_LABELS[modality]}</option>)}</select></div>
        <div><label className="form-label" htmlFor="radiology-body-part">الجزء المراد تصويره <span className="required-mark">*</span></label><input id="radiology-body-part" className="form-input" value={draft.bodyPart} onChange={(event) => updateDraft('bodyPart', event.target.value)} placeholder="الصدر — تجريبي" required /></div>
        <div><label className="form-label" htmlFor="radiology-priority">الأولوية</label><select id="radiology-priority" className="form-input" value={draft.priority} onChange={(event) => updateDraft('priority', event.target.value as RadiologyPriority)}>{PRIORITY_OPTIONS.map((priority) => <option value={priority} key={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></div>
        <div><label className="form-label" htmlFor="radiology-scheduled-at">الموعد المجدول</label><input id="radiology-scheduled-at" className="form-input" type="datetime-local" value={draft.scheduledAt} onChange={(event) => updateDraft('scheduledAt', event.target.value)} dir="ltr" /></div>
        <div className="radiology-field-full"><label className="form-label" htmlFor="radiology-referring-provider">الطبيب المُحيل</label><input id="radiology-referring-provider" className="form-input" value={draft.referringProvider} onChange={(event) => updateDraft('referringProvider', event.target.value)} placeholder="د. أحمد — تجريبي" /></div>
      </div>
      {error && <p id="radiology-form-error" className="form-error" role="alert">{error}</p>}
      <button className="primary-button radiology-submit" type="submit" disabled={saving}>{saving ? 'جارٍ إنشاء الدراسة…' : 'إنشاء دراسة الأشعة'}</button>
    </form>
  </section>
}

function ReportForm({ study, onCompleted, onToast }: { study: RadiologyStudy; onCompleted: () => Promise<void>; onToast: RadiologyViewProps['onToast'] }) {
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_REPORT_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateDraft = (field: keyof ReportDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const submitReport = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.reportText.trim() || !draft.impression.trim()) { setError('أكمل نص التقرير والانطباع قبل الحفظ.'); return }
    setSaving(true)
    setError('')
    try {
      await reportRadiologyStudy(study.id, { reportText: draft.reportText.trim(), impression: draft.impression.trim() })
      await onCompleted()
      onToast('تم حفظ التقرير ونقل الدراسة إلى تم التقرير')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر حفظ تقرير الأشعة.')
    } finally {
      setSaving(false)
    }
  }

  return <tr className="radiology-report-row"><td colSpan={8}><form className="radiology-report-form" onSubmit={submitReport} noValidate aria-label={`كتابة تقرير ${study.accessionNumber}`}><div><label className="form-label" htmlFor={`report-text-${study.id}`}>نص التقرير <span className="required-mark">*</span></label><textarea id={`report-text-${study.id}`} className="form-input radiology-textarea" value={draft.reportText} onChange={(event) => updateDraft('reportText', event.target.value)} rows={3} required /></div><div><label className="form-label" htmlFor={`impression-${study.id}`}>الانطباع <span className="required-mark">*</span></label><textarea id={`impression-${study.id}`} className="form-input radiology-textarea" value={draft.impression} onChange={(event) => updateDraft('impression', event.target.value)} rows={3} required /></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button row-action-button" type="submit" disabled={saving}>{saving ? 'جارٍ حفظ التقرير…' : 'حفظ التقرير'}</button></form></td></tr>
}

function RadiologyView({ onBack, onToast }: RadiologyViewProps) {
  const [studies, setStudies] = useState<RadiologyStudy[]>([])
  const [filter, setFilter] = useState<StudyFilter>('all')
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportingStudyId, setReportingStudyId] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)

  const loadStudies = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setStudies(await fetchRadiologyStudies(filter === 'all' ? undefined : filter)) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل دراسات الأشعة.') } finally { setLoading(false) }
  }, [filter])

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true)
    setPatientsError('')
    try { setPatients(await fetchPatients()) } catch (requestError) { setPatientsError(requestError instanceof Error ? requestError.message : 'تعذر تحميل سجل المرضى.') } finally { setPatientsLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStudies(); void loadPatients() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadPatients, loadStudies])

  const runStudyAction = async (study: RadiologyStudy, action: 'start' | 'verify') => {
    const key = `${study.id}:${action}`
    setActionKey(key)
    try {
      const updatedStudy = action === 'start' ? await startRadiologyStudy(study.id) : await verifyRadiologyStudy(study.id)
      onToast(`تم تحديث الدراسة إلى ${STATUS_LABELS[updatedStudy.status]}`)
      await loadStudies()
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : 'تعذر تحديث حالة الدراسة.', 'error')
    } finally { setActionKey(null) }
  }

  return <><ViewHeader title="الأشعة" description="أنشئ دراسات الأشعة وتابع مسارها من الجدولة إلى التحقق." onBack={onBack} /><div className="radiology-layout"><CreateStudyPanel patients={patients} patientsLoading={patientsLoading} patientsError={patientsError} onCreated={loadStudies} onToast={onToast} /><section className="panel radiology-list-panel" aria-labelledby="radiology-list-title"><div className="panel-heading radiology-list-heading"><div><h2 id="radiology-list-title">دراسات الأشعة</h2><p>كل انتقال متاح فقط من الحالة السابقة الصحيحة.</p></div><label className="filter-field" htmlFor="radiology-status-filter"><span>تصفية الحالة</span><select id="radiology-status-filter" className="form-input" value={filter} onChange={(event) => { setFilter(event.target.value as StudyFilter); setReportingStudyId(null) }}>{STATUS_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div><p className="workflow-note radiology-workflow"><strong>مسار العمل:</strong> مجدولة <span>→</span> قيد التنفيذ <span>→</span> تم التقرير <span>→</span> تم التحقق. لا يمكن تجاوز مرحلة أو التحقق قبل حفظ التقرير.</p>{loading && <div className="state-card" role="status">جارٍ تحميل دراسات الأشعة…</div>}{!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الدراسات</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadStudies()}>إعادة المحاولة</button></div>}{!loading && !error && studies.length === 0 && <div className="state-card" role="status">لا توجد دراسات بهذه الحالة. أنشئ دراسة جديدة أو غيّر الفلتر.</div>}{!loading && !error && studies.length > 0 && <div className="radiology-table-wrap"><table className="radiology-table"><caption className="sr-only">قائمة دراسات الأشعة</caption><thead><tr><th scope="col">الحالة</th><th scope="col">رقم الوصول</th><th scope="col">patientId</th><th scope="col">نوع التصوير</th><th scope="col">الجزء</th><th scope="col">الأولوية</th><th scope="col">الموعد</th><th scope="col"><span className="sr-only">إجراء</span></th></tr></thead><tbody>{studies.map((study) => <Fragment key={study.id}><tr><td><StatusBadge status={study.status} /></td><td><strong className="operation-code" dir="ltr">{study.accessionNumber}</strong></td><td><span className="operation-code" dir="ltr">{study.patientId}</span></td><td>{MODALITY_LABELS[study.modality]}</td><td>{study.bodyPart}</td><td><span className={`priority-label priority-${study.priority}`}>{PRIORITY_LABELS[study.priority]}</span></td><td dir="ltr">{formatStudyDate(study.scheduledAt)}</td><td className="radiology-actions">{study.status === 'scheduled' && <button className="secondary-button row-action-button" type="button" onClick={() => void runStudyAction(study, 'start')} disabled={actionKey !== null}>{actionKey === `${study.id}:start` ? 'جارٍ البدء…' : 'بدء الدراسة'}</button>}{study.status === 'in_progress' && <button className="secondary-button row-action-button" type="button" onClick={() => setReportingStudyId((current) => current === study.id ? null : study.id)}>{reportingStudyId === study.id ? 'إغلاق التقرير' : 'كتابة التقرير'}</button>}{study.status === 'reported' && <button className="primary-button row-action-button" type="button" onClick={() => void runStudyAction(study, 'verify')} disabled={actionKey !== null}>{actionKey === `${study.id}:verify` ? 'جارٍ التحقق…' : 'تحقق من الدراسة'}</button>}{study.status === 'verified' && <span className="completed-note">مكتملة</span>}{study.status === 'cancelled' && <span className="muted-note">لا إجراء</span>}</td></tr>{reportingStudyId === study.id && study.status === 'in_progress' && <ReportForm key={`${study.id}-report`} study={study} onCompleted={async () => { setReportingStudyId(null); await loadStudies() }} onToast={onToast} />}</Fragment>)}</tbody></table></div>}</section></div></>
}

export default RadiologyView

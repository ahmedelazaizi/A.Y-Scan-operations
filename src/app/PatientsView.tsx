import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPatient, fetchPatients, type NewPatient, type Patient, type PatientSex } from './api'
import { useCan } from './session'
import { ViewHeader } from './ViewHeader'

type PatientsViewProps = { onBack: () => void; onToast: (message: string) => void }
type PatientFormState = { fullName: string; phone: string; dateOfBirth: string; sex: PatientSex | '' }

const EMPTY_FORM: PatientFormState = { fullName: '', phone: '', dateOfBirth: '', sex: '' }
const SEX_LABELS: Record<PatientSex, string> = { female: 'أنثى', male: 'ذكر', other: 'آخر', unknown: 'غير محدد' }

function formatDate(value?: string) {
  if (!value) return 'غير محدد'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? 'غير محدد' : new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

function getSexLabel(sex?: PatientSex) { return sex ? SEX_LABELS[sex] : 'غير محدد' }

function validatePatientForm(form: PatientFormState) {
  if (!form.fullName.trim()) return 'اكتب الاسم الكامل للمريض.'
  if (form.phone && !/^[0-9+()\-\s]{7,20}$/.test(form.phone.trim())) return 'أدخل رقم هاتف صحيحًا أو اترك الحقل فارغًا.'
  if (form.dateOfBirth) {
    const birthDate = new Date(`${form.dateOfBirth}T00:00:00`)
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) return 'اختر تاريخ ميلاد صحيحًا غير مستقبلي.'
  }
  return ''
}

function PatientFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<PatientFormState>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const updateField = (field: keyof PatientFormState, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const submitPatient = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validatePatientForm(form)
    if (validationError) { setError(validationError); return }
    const patient: NewPatient = { fullName: form.fullName.trim(), ...(form.phone.trim() && { phone: form.phone.trim() }), ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }), ...(form.sex && { sex: form.sex }) }
    setSaving(true); setError('')
    try { await createPatient(patient); onCreated() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'تعذر تسجيل المريض.') } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="modal patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-patient-title" aria-describedby="new-patient-description"><div className="modal-heading"><div><h2 id="new-patient-title">تسجيل مريض</h2><p id="new-patient-description">أدخل البيانات المتاحة. الحقول الاختيارية يمكن تركها فارغة.</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="إغلاق النافذة">إغلاق</button></div><form onSubmit={submitPatient} noValidate><label className="form-label" htmlFor="patient-full-name">الاسم الكامل <span className="required-mark">*</span></label><input id="patient-full-name" className="form-input" value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} placeholder="مثال: مريض تجريبي" autoFocus required /><div className="form-grid"><div><label className="form-label" htmlFor="patient-phone">الهاتف</label><input id="patient-phone" className="form-input" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="مثال: 01XXXXXXXXX" inputMode="tel" autoComplete="tel" /></div><div><label className="form-label" htmlFor="patient-birth-date">تاريخ الميلاد</label><input id="patient-birth-date" className="form-input" type="date" value={form.dateOfBirth} onChange={(event) => updateField('dateOfBirth', event.target.value)} /></div></div><label className="form-label" htmlFor="patient-sex">الجنس</label><select id="patient-sex" className="form-input" value={form.sex} onChange={(event) => updateField('sex', event.target.value)}><option value="">اختر إن رغبت</option><option value="female">أنثى</option><option value="male">ذكر</option><option value="other">آخر</option><option value="unknown">غير محدد</option></select>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>إلغاء</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'تسجيل المريض'}</button></div></form></section></div>
}

function PatientsView({ onBack, onToast }: PatientsViewProps) {
  const can = useCan()
  const canCreate = can('patients.create')
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setModalOpen] = useState(false)
  const requestNumber = useRef(0)

  const loadPatients = useCallback(async (query: string) => {
    const currentRequest = ++requestNumber.current
    setLoading(true); setError('')
    try {
      const nextPatients = await fetchPatients(query)
      if (currentRequest === requestNumber.current) setPatients(nextPatients)
    } catch (requestError) {
      if (currentRequest === requestNumber.current) setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل قائمة المرضى.')
    } finally {
      if (currentRequest === requestNumber.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatients(search), 250)
    return () => window.clearTimeout(timer)
  }, [loadPatients, search])

  const handlePatientCreated = () => {
    setModalOpen(false)
    onToast('تم تسجيل المريض بنجاح')
    void loadPatients(search)
  }

  return <><ViewHeader title="المرضى" description={canCreate ? 'ابحث في سجل المرضى أو أضف ملفًا جديدًا.' : 'ابحث في سجل المرضى.'} onBack={onBack} action={canCreate ? <button className="primary-button" type="button" onClick={() => setModalOpen(true)}>تسجيل مريض</button> : undefined} /><section className="panel patients-panel" aria-labelledby="patients-list-title"><div className="patient-toolbar"><div><h2 id="patients-list-title">سجل المرضى</h2><p>ابحث بالاسم أو رقم الهاتف.</p></div><label className="search-field"><span className="sr-only">البحث في المرضى</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن اسم أو هاتف…" /></label></div>{loading && <div className="state-card" role="status">جارٍ تحميل قائمة المرضى…</div>}{!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل قائمة المرضى</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadPatients(search)}>إعادة المحاولة</button></div>}{!loading && !error && patients.length === 0 && <div className="state-card" role="status">لا توجد نتائج مطابقة. جرّب بحثًا مختلفًا{canCreate ? ' أو سجّل مريضًا جديدًا' : ''}.</div>}{!loading && !error && patients.length > 0 && <div className="patients-table-wrap"><table className="patients-table"><caption className="sr-only">قائمة المرضى</caption><thead><tr><th scope="col">الاسم</th><th scope="col">الهاتف</th><th scope="col">تاريخ الميلاد</th><th scope="col">الجنس</th><th scope="col">تاريخ التسجيل</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.id}><td><strong>{patient.fullName}</strong></td><td dir="ltr">{patient.phone || 'غير محدد'}</td><td>{formatDate(patient.dateOfBirth)}</td><td>{getSexLabel(patient.sex)}</td><td>{formatDate(patient.createdAt)}</td></tr>)}</tbody></table></div>}</section>{canCreate && isModalOpen && <PatientFormModal onClose={() => setModalOpen(false)} onCreated={handlePatientCreated} />}</>
}

export default PatientsView

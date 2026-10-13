import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createOrder, errorMessage, fetchCatalog, fetchPatients, type CatalogItem, type NewOrder, type Order, type Patient } from './api'
import { formatCount, formatEgp } from './format'
import { Icon } from './Icon'

type NewOrderModalProps = {
  onClose: () => void
  onCreated: (order: Order) => void
  /** Opens the Patients view so the patient can be registered; omitted when the user cannot register patients. */
  onRegisterPatient?: () => void
}

const PATIENT_SEARCH_LIMIT = 50
const SEARCH_DEBOUNCE_MS = 300

function NewOrderModal({ onClose, onCreated, onRegisterPatient }: NewOrderModalProps) {
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([])
  const [priority, setPriority] = useState<NewOrder['priority']>('normal')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const searchRequest = useRef(0)

  const searchPatients = useCallback(async (term: string) => {
    const request = ++searchRequest.current
    setPatientsLoading(true)
    setPatientsError('')
    try {
      const results = await fetchPatients(term, PATIENT_SEARCH_LIMIT)
      if (request === searchRequest.current) setPatients(results)
    } catch (requestError) {
      if (request === searchRequest.current) setPatientsError(errorMessage(requestError, 'تعذر البحث في سجل المرضى.'))
    } finally {
      if (request === searchRequest.current) setPatientsLoading(false)
    }
  }, [])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError('')
    try {
      setCatalog(await fetchCatalog())
    } catch (requestError) {
      setCatalogError(errorMessage(requestError, 'تعذر تحميل دليل التحاليل.'))
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void searchPatients(patientSearch), patientSearch ? SEARCH_DEBOUNCE_MS : 0)
    return () => window.clearTimeout(timer)
  }, [patientSearch, searchPatients])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0)
    return () => window.clearTimeout(timer)
  }, [loadCatalog])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const activeCatalog = useMemo(() => catalog.filter((item) => item.isActive), [catalog])
  const selectedTests = useMemo(() => activeCatalog.filter((item) => selectedTestIds.includes(item.id)), [activeCatalog, selectedTestIds])
  const total = useMemo(() => selectedTests.reduce((sum, item) => sum + item.price, 0), [selectedTests])

  const toggleTest = (id: string) => {
    setError('')
    setSelectedTestIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPatient) { setError('اختر مريضًا مسجلًا من نتائج البحث.'); return }
    const testIds = selectedTests.map((item) => item.id)
    if (testIds.length === 0) { setError('اختر تحليلًا واحدًا على الأقل من الدليل.'); return }
    setSaving(true)
    setError('')
    try {
      onCreated(await createOrder({ patientId: selectedPatient.id, testIds, priority }))
      onClose()
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر حفظ الطلب.'))
      setSaving(false)
    }
  }

  const visiblePatients = selectedPatient && !patients.some((patient) => patient.id === selectedPatient.id) ? [selectedPatient, ...patients] : patients
  const registerHint = onRegisterPatient
    ? <>لم تجد المريض؟ <button className="text-button" type="button" onClick={onRegisterPatient}>سجّل مريضًا جديدًا من قسم المرضى</button></>
    : <>لم تجد المريض؟ اطلب من الاستقبال تسجيله أولًا.</>

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title" aria-describedby="new-order-description" aria-busy={saving}>
      <div className="modal-heading">
        <div><h2 id="new-order-title">طلب تحليل جديد</h2><p id="new-order-description">اختر مريضًا مسجلًا والتحاليل المطلوبة من الدليل المعتمد.</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق النافذة"><Icon name="x" size={18} /></button>
      </div>
      <form onSubmit={submitOrder} noValidate>
        <fieldset className="order-section">
          <legend className="form-label">المريض <span className="required-mark">*</span></legend>
          <label className="form-label" htmlFor="patient-search">ابحث بالاسم أو رقم الهاتف</label>
          <input id="patient-search" className="form-input" type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="اكتب جزءًا من الاسم أو الهاتف…" autoComplete="off" aria-controls="patient-results" autoFocus />
          <div id="patient-results" className="patient-results" role="radiogroup" aria-label="نتائج البحث عن المرضى" aria-busy={patientsLoading}>
            {patientsLoading && <p className="field-status" role="status">جارٍ البحث…</p>}
            {!patientsLoading && patientsError && <p className="field-status field-status-error" role="alert">{patientsError} <button className="text-button" type="button" onClick={() => void searchPatients(patientSearch)}>إعادة المحاولة</button></p>}
            {!patientsLoading && !patientsError && visiblePatients.length === 0 && <p className="field-status" role="status">{patientSearch.trim() ? 'لا يوجد مريض مطابق لهذا البحث.' : 'لا يوجد مرضى مسجلون بعد.'} {registerHint}</p>}
            {!patientsLoading && !patientsError && visiblePatients.map((patient) => <label className={`mode-option ${selectedPatient?.id === patient.id ? 'mode-option-active' : ''}`} key={patient.id}>
              <input type="radio" name="order-patient" value={patient.id} checked={selectedPatient?.id === patient.id} onChange={() => { setSelectedPatient(patient); setError('') }} />
              <span><strong>{patient.fullName}</strong><small dir="ltr">{patient.phone || 'بدون هاتف'}</small></span>
            </label>)}
          </div>
          {!patientsLoading && !patientsError && visiblePatients.length > 0 && <p className="field-status order-hint">{patients.length >= PATIENT_SEARCH_LIMIT ? 'تظهر أول 50 نتيجة فقط؛ حدّد البحث أكثر. ' : ''}{registerHint}</p>}
        </fieldset>
        <fieldset className="order-section test-picker">
          <legend className="form-label">التحاليل <span className="required-mark">*</span></legend>
          {catalogLoading && <p className="field-status" role="status">جارٍ تحميل التحاليل المفعّلة…</p>}
          {!catalogLoading && catalogError && <p className="field-status field-status-error" role="alert">{catalogError} <button className="text-button" type="button" onClick={() => void loadCatalog()}>إعادة المحاولة</button></p>}
          {!catalogLoading && !catalogError && activeCatalog.length === 0 && <p className="field-status field-status-warning" role="status">لا توجد تحاليل مفعّلة في الدليل. يجب على مدير الفرع تسعير التحاليل وتفعيلها من «دليل التحاليل» أولًا.</p>}
          {!catalogLoading && !catalogError && activeCatalog.map((test) => <label className={`check-option ${selectedTestIds.includes(test.id) ? 'check-option-active' : ''}`} key={test.id}>
            <input type="checkbox" checked={selectedTestIds.includes(test.id)} onChange={() => toggleTest(test.id)} />
            <span>{test.name} <span className="catalog-code" dir="ltr">{test.code}</span></span>
            <span className="check-option-price" dir="ltr">{formatEgp(test.price)}</span>
          </label>)}
          {selectedTests.length > 0 && <p className="order-total" aria-live="polite"><span>الإجمالي ({formatCount(selectedTests.length)} تحليل)</span><strong dir="ltr">{formatEgp(total)}</strong></p>}
        </fieldset>
        <label className="form-label" htmlFor="priority">الأولوية</label>
        <select id="priority" className="form-input" value={priority} onChange={(event) => setPriority(event.target.value as NewOrder['priority'])}><option value="normal">عادية</option><option value="urgent">عاجلة</option></select>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>إلغاء</button>
          <button className="primary-button" type="submit" disabled={saving || catalogLoading}>{saving ? 'جارٍ الحفظ…' : 'حفظ الطلب'}</button>
        </div>
      </form>
    </section>
  </div>
}

export default NewOrderModal

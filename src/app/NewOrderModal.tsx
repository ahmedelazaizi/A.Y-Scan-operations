import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createOrder, errorMessage, fetchPatients, fetchPhase1Bundles, fetchPhase1Catalog, fetchPhase1Practitioners, type NewReceptionOrder, type Order, type Patient, type Phase1Bundle, type Phase1CatalogItem, type Phase1Practitioner } from './api'
import { formatEgp } from './format'
import { Icon } from './Icon'
import { useCan } from './session'

type NewOrderModalProps = { onClose: () => void; onCreated: (order: Order) => void; onRegisterPatient?: () => void }
type PaymentMethod = NonNullable<NewReceptionOrder['paymentMethod']>
const PATIENT_SEARCH_LIMIT = 50
const toPiastres = (pounds: string) => Math.round((Number(pounds) || 0) * 100)
const toPounds = (piastres: number) => piastres / 100

function NewOrderModal({ onClose, onCreated, onRegisterPatient }: NewOrderModalProps) {
  const canSetDiscount = useCan()('catalog.price')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [catalog, setCatalog] = useState<Phase1CatalogItem[]>([])
  const [bundles, setBundles] = useState<Phase1Bundle[]>([])
  const [practitioners, setPractitioners] = useState<Phase1Practitioner[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [testIds, setTestIds] = useState<string[]>([])
  const [bundleIds, setBundleIds] = useState<string[]>([])
  const [priority, setPriority] = useState<NewReceptionOrder['priority']>('normal')
  const [practitionerId, setPractitionerId] = useState('')
  const [fasting, setFasting] = useState(false)
  const [diagnosis, setDiagnosis] = useState('')
  const [discount, setDiscount] = useState('0')
  const [coverage, setCoverage] = useState('0')
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [payment, setPayment] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const searchRequest = useRef(0)

  const searchPatients = useCallback(async (term: string) => {
    const request = ++searchRequest.current
    setPatientsLoading(true); setPatientsError('')
    try { const found = await fetchPatients(term, PATIENT_SEARCH_LIMIT); if (request === searchRequest.current) setPatients(found) }
    catch (requestError) { if (request === searchRequest.current) setPatientsError(errorMessage(requestError, 'تعذر البحث في سجل المرضى.')) }
    finally { if (request === searchRequest.current) setPatientsLoading(false) }
  }, [])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true); setCatalogError('')
    try {
      const [tests, loadedBundles, doctors] = await Promise.all([fetchPhase1Catalog(), fetchPhase1Bundles(), fetchPhase1Practitioners()])
      setCatalog(tests); setBundles(loadedBundles); setPractitioners(doctors)
    } catch (requestError) { setCatalogError(errorMessage(requestError, 'تعذر تحميل دليل التحاليل والباقات والأطباء.')) }
    finally { setCatalogLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => void searchPatients(patientSearch), patientSearch ? 300 : 0); return () => window.clearTimeout(timer) }, [patientSearch, searchPatients])
  useEffect(() => { const timer = window.setTimeout(() => void loadCatalog(), 0); return () => window.clearTimeout(timer) }, [loadCatalog])
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }; document.addEventListener('keydown', onKeyDown); return () => document.removeEventListener('keydown', onKeyDown) }, [onClose, saving])

  const activeCatalog = useMemo(() => catalog.filter((entry) => entry.isActive), [catalog])
  const activeBundles = useMemo(() => bundles.filter((entry) => entry.isActive), [bundles])
  const chosenBundles = activeBundles.filter((bundle) => bundleIds.includes(bundle.id))
  const bundleTestIds = new Set(chosenBundles.flatMap((bundle) => bundle.items.map((entry) => entry.catalogId)))
  const selectedTests = activeCatalog.filter((test) => testIds.includes(test.id))
  const subtotalPiastres = selectedTests.reduce((sum, test) => sum + test.pricePiastres, 0) + chosenBundles.reduce((sum, bundle) => sum + bundle.pricePiastres, 0)
  const discountPiastres = canSetDiscount ? toPiastres(discount) : 0
  const coveragePiastres = toPiastres(coverage)
  const totalPiastres = Math.max(0, subtotalPiastres - discountPiastres - coveragePiastres)

  const toggleTest = (id: string) => { setError(''); setTestIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]) }
  const toggleBundle = (bundle: Phase1Bundle) => {
    setError('')
    setBundleIds((current) => current.includes(bundle.id) ? current.filter((id) => id !== bundle.id) : [...current, bundle.id])
  }
  const submitOrder = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPatient) { setError('اختر مريضًا مسجلًا من نتائج البحث.'); return }
    if (!testIds.length && !bundleIds.length) { setError('اختر تحليلًا واحدًا على الأقل أو باقة.'); return }
    const payload: NewReceptionOrder = { patientId: selectedPatient.id, testIds, bundleIds, priority, fasting, ...(practitionerId && { practitionerId }), ...(diagnosis.trim() && { diagnosis: diagnosis.trim() }), ...(canSetDiscount && discountPiastres > 0 && { discountPiastres }), ...(coveragePiastres > 0 && { insuranceCoveragePiastres: coveragePiastres, insuranceCompany: insuranceCompany.trim() }), initialPaymentPiastres: toPiastres(payment), paymentMethod, ...(paymentReference.trim() && { paymentReference: paymentReference.trim() }) }
    setSaving(true); setError('')
    try { onCreated(await createOrder(payload)); onClose() }
    catch (requestError) { setError(errorMessage(requestError, 'تعذر حفظ الطلب.')); setSaving(false) }
  }

  const visiblePatients = selectedPatient && !patients.some((entry) => entry.id === selectedPatient.id) ? [selectedPatient, ...patients] : patients
  const registerHint = onRegisterPatient ? <>لم تجد المريض؟ <button className="text-button" type="button" onClick={onRegisterPatient}>سجّل مريضًا جديدًا من قسم المرضى</button></> : <>لم تجد المريض؟ اطلب من الاستقبال تسجيله أولًا.</>

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose() }}>
    <section className="modal order-modal reception-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title" aria-busy={saving}>
      <div className="modal-heading"><div><h2 id="new-order-title">طلب استقبال جديد</h2><p>طلب واحد ينشئ الفاتورة والعينات وعمولة الطبيب معًا.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق النافذة" disabled={saving}><Icon name="x" size={18} /></button></div>
      <form onSubmit={submitOrder} noValidate><div className="reception-columns">
        <section className="reception-column"><h3>بيانات المريض والطلب</h3><label className="form-label" htmlFor="patient-search">ابحث عن المريض <span className="required-mark">*</span></label><input id="patient-search" className="form-input" type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="الاسم أو رقم الهاتف" autoComplete="off" aria-controls="patient-results" autoFocus />
          <div id="patient-results" className="patient-results" role="radiogroup" aria-label="نتائج البحث عن المرضى" aria-busy={patientsLoading}>{patientsLoading && <p className="field-status" role="status">جارٍ البحث…</p>}{!patientsLoading && patientsError && <p className="field-status field-status-error" role="alert">{patientsError} <button className="text-button" type="button" onClick={() => void searchPatients(patientSearch)}>إعادة المحاولة</button></p>}{!patientsLoading && !patientsError && !visiblePatients.length && <p className="field-status" role="status">لا يوجد مريض مطابق. {registerHint}</p>}{!patientsLoading && !patientsError && visiblePatients.map((patient) => <label className={`mode-option ${selectedPatient?.id === patient.id ? 'mode-option-active' : ''}`} key={patient.id}><input type="radio" name="order-patient" checked={selectedPatient?.id === patient.id} onChange={() => { setSelectedPatient(patient); setError('') }} /><span><strong>{patient.fullName}</strong><small dir="ltr">{patient.phone || 'بدون هاتف'}</small></span></label>)}</div>
          <label className="form-label" htmlFor="practitioner">الطبيب المحوّل</label><select id="practitioner" className="form-input" value={practitionerId} onChange={(event) => setPractitionerId(event.target.value)}><option value="">بدون طبيب محوّل</option>{practitioners.filter((entry) => entry.isActive).map((doctor) => <option value={doctor.id} key={doctor.id}>{doctor.nameAr}</option>)}</select>
          <label className="form-label" htmlFor="priority">الأولوية</label><select id="priority" className="form-input" value={priority} onChange={(event) => setPriority(event.target.value as NewReceptionOrder['priority'])}><option value="normal">عادية</option><option value="urgent">عاجلة</option></select>
          <label className="check-option reception-check"><input type="checkbox" checked={fasting} onChange={(event) => setFasting(event.target.checked)} /><span>المريض صائم</span></label>
          <label className="form-label" htmlFor="diagnosis">التشخيص أو الملاحظة</label><textarea id="diagnosis" className="form-input reception-textarea" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} maxLength={1000} />
        </section>
        <section className="reception-column"><h3>التحاليل والباقات</h3>{catalogLoading && <p className="field-status" role="status">جارٍ تحميل الدليل…</p>}{!catalogLoading && catalogError && <div className="field-status field-status-error" role="alert">{catalogError}<button className="text-button" type="button" onClick={() => void loadCatalog()}>إعادة المحاولة</button></div>}{!catalogLoading && !catalogError && <><fieldset className="test-picker reception-picker"><legend className="form-label">التحاليل الفردية</legend>{activeCatalog.filter((test) => test.kind === 'lab').map((test) => { const inBundle = bundleTestIds.has(test.id); return <label className={`check-option ${testIds.includes(test.id) ? 'check-option-active' : ''}`} key={test.id}><input type="checkbox" checked={testIds.includes(test.id)} disabled={inBundle} onChange={() => toggleTest(test.id)} /><span>{test.nameAr} <span className="catalog-code" dir="ltr">{test.code}</span>{inBundle && <small> ضمن باقة محددة</small>}</span><span className="check-option-price" dir="ltr">{formatEgp(toPounds(test.pricePiastres))}</span></label>})}</fieldset><fieldset className="test-picker reception-picker"><legend className="form-label">الباقات</legend>{activeBundles.map((bundle) => { const overlaps = bundle.items.some((entry) => testIds.includes(entry.catalogId) || (bundleIds.includes(bundle.id) ? false : chosenBundles.some((selected) => selected.items.some((active) => active.catalogId === entry.catalogId)))); return <label className={`check-option ${bundleIds.includes(bundle.id) ? 'check-option-active' : ''}`} key={bundle.id}><input type="checkbox" checked={bundleIds.includes(bundle.id)} disabled={!bundleIds.includes(bundle.id) && overlaps} onChange={() => toggleBundle(bundle)} /><span>{bundle.nameAr} <span className="catalog-code" dir="ltr">{bundle.code}</span></span><span className="check-option-price" dir="ltr">{formatEgp(toPounds(bundle.pricePiastres))}</span></label>})}</fieldset></>}
        </section>
        <section className="reception-column reception-financial"><h3>الملخص المالي</h3><div className="reception-total"><span>إجمالي الخدمات</span><strong dir="ltr">{formatEgp(toPounds(subtotalPiastres))}</strong></div>
          {canSetDiscount && <><label className="form-label" htmlFor="reception-discount">الخصم (جنيه)</label><input id="reception-discount" className="form-input" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} dir="ltr" /></>}
          <label className="form-label" htmlFor="reception-coverage">تغطية التأمين (جنيه)</label><input id="reception-coverage" className="form-input" type="number" min="0" step="0.01" value={coverage} onChange={(event) => setCoverage(event.target.value)} dir="ltr" />{Number(coverage) > 0 && <><label className="form-label" htmlFor="insurance-company">شركة التأمين</label><input id="insurance-company" className="form-input" value={insuranceCompany} onChange={(event) => setInsuranceCompany(event.target.value)} /></>}
          <label className="form-label" htmlFor="initial-payment">الدفعة الأولى (جنيه)</label><input id="initial-payment" className="form-input" type="number" min="0" step="0.01" value={payment} onChange={(event) => setPayment(event.target.value)} dir="ltr" />
          <label className="form-label" htmlFor="initial-payment-method">طريقة الدفع</label><select id="initial-payment-method" className="form-input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="bank_transfer">تحويل بنكي</option></select>
          {paymentMethod !== 'cash' && <><label className="form-label" htmlFor="payment-reference">مرجع الدفع</label><input id="payment-reference" className="form-input" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} dir="ltr" /></>}
          <div className="reception-total reception-grand-total"><span>المطلوب بعد الخصم والتغطية</span><strong dir="ltr">{formatEgp(toPounds(totalPiastres))}</strong></div>
        </section></div>
        {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>إلغاء</button><button className="primary-button" type="submit" disabled={saving || catalogLoading || (!activeCatalog.length && !activeBundles.length)}>{saving ? 'جارٍ الحفظ…' : 'حفظ الطلب والفاتورة'}</button></div>
      </form>
    </section></div>
}

export default NewOrderModal

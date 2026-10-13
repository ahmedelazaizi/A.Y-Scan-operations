import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  collectSpecimen,
  createResult,
  createSpecimen,
  fetchResults,
  fetchSpecimens,
  reviewResult,
  type LabResult,
  type NewLabResult,
  type NewSpecimen,
  type ResultFlag,
  type ResultStatus,
  type Specimen,
  type SpecimenStatus,
} from './api'
import { useCan } from './session'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type OperationsViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type SpecimenFormState = NewSpecimen
type ResultFormState = { orderItemId: string; value: string; unit: string; referenceRange: string; flag: ResultFlag }
type SpecimenFilter = SpecimenStatus | 'all'
type StatusTone = 'info' | 'success' | 'warning' | 'danger'

const EMPTY_SPECIMEN_FORM: SpecimenFormState = { orderId: '', specimenType: '', barcode: '' }
const EMPTY_RESULT_FORM: ResultFormState = { orderItemId: '', value: '', unit: '', referenceRange: '', flag: 'normal' }
const SPECIMEN_STATUS_LABELS: Record<SpecimenStatus, string> = { pending: 'قيد الانتظار', collected: 'تم السحب', received: 'تم الاستلام', processing: 'قيد المعالجة', rejected: 'مرفوضة', completed: 'مكتملة' }
const RESULT_STATUS_LABELS: Record<ResultStatus, string> = { draft: 'مسودة', in_review: 'قيد المراجعة', approved: 'معتمدة', released: 'مُصدرة', amended: 'معدّلة' }
const RESULT_FLAG_LABELS: Record<ResultFlag, string> = { normal: 'طبيعي', low: 'منخفض', high: 'مرتفع', critical: 'حرج', not_applicable: 'غير منطبق' }
const SPECIMEN_STATUS_TONES: Record<SpecimenStatus, StatusTone> = { pending: 'warning', collected: 'success', received: 'info', processing: 'info', rejected: 'danger', completed: 'success' }
const RESULT_STATUS_TONES: Record<ResultStatus, StatusTone> = { draft: 'warning', in_review: 'info', approved: 'success', released: 'success', amended: 'warning' }
const timestampFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '—' : timestampFormatter.format(date)
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return <span className={`status status-${tone}`}><span className="status-dot" aria-hidden="true" />{label}</span>
}

function SpecimensPanel({ onToast }: { onToast: OperationsViewProps['onToast'] }) {
  const canManage = useCan()('specimens.manage')
  const [specimens, setSpecimens] = useState<Specimen[]>([])
  const [specimenFilter, setSpecimenFilter] = useState<SpecimenFilter>('all')
  const [specimensLoading, setSpecimensLoading] = useState(true)
  const [specimensError, setSpecimensError] = useState('')
  const [specimenForm, setSpecimenForm] = useState<SpecimenFormState>(EMPTY_SPECIMEN_FORM)
  const [specimenFormError, setSpecimenFormError] = useState('')
  const [creatingSpecimen, setCreatingSpecimen] = useState(false)
  const [collectingBarcode, setCollectingBarcode] = useState<string | null>(null)

  const loadSpecimens = useCallback(async () => {
    setSpecimensLoading(true)
    setSpecimensError('')
    try {
      setSpecimens(await fetchSpecimens(specimenFilter === 'all' ? undefined : specimenFilter))
    } catch (requestError) {
      setSpecimensError(requestError instanceof Error ? requestError.message : 'تعذر تحميل قائمة العينات.')
    } finally {
      setSpecimensLoading(false)
    }
  }, [specimenFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSpecimens(), 0)
    return () => window.clearTimeout(timer)
  }, [loadSpecimens])

  const updateSpecimenField = (field: keyof SpecimenFormState, value: string) => setSpecimenForm((current) => ({ ...current, [field]: value }))
  const submitSpecimen = async (event: FormEvent) => {
    event.preventDefault()
    const specimenInput: NewSpecimen = { orderId: specimenForm.orderId.trim(), specimenType: specimenForm.specimenType.trim(), barcode: specimenForm.barcode.trim() }
    if (!specimenInput.orderId || !specimenInput.specimenType || !specimenInput.barcode) { setSpecimenFormError('أكمل رقم الطلب ونوع العينة والباركود.'); return }
    setCreatingSpecimen(true); setSpecimenFormError('')
    try {
      await createSpecimen(specimenInput)
      setSpecimenForm(EMPTY_SPECIMEN_FORM); onToast('تم إنشاء العينة بنجاح'); void loadSpecimens()
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : 'تعذر إنشاء العينة.', 'error')
    } finally { setCreatingSpecimen(false) }
  }

  const collectPendingSpecimen = async (barcode: string) => {
    setCollectingBarcode(barcode)
    try {
      await collectSpecimen(barcode); onToast('تم تسجيل سحب العينة بنجاح'); void loadSpecimens()
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : 'تعذر تسجيل سحب العينة.', 'error')
    } finally { setCollectingBarcode(null) }
  }

  return (
    <section className="panel operation-panel" aria-labelledby="specimens-title">
      <div className="panel-heading operation-panel-heading"><div><h2 id="specimens-title">العينات</h2><p>{canManage ? 'أنشئ العينة ثم سجّل سحب العينات المعلّقة.' : 'تابع حالة العينات.'}</p></div><span className="operation-count">{specimens.length}</span></div>
      {canManage && <form className="operation-form" onSubmit={submitSpecimen} noValidate aria-describedby={specimenFormError ? 'specimen-form-error' : undefined}>
        <div className="operation-fields operation-fields-specimen">
          <div><label className="form-label" htmlFor="specimen-order-id">رقم الطلب <span className="required-mark">*</span></label><input id="specimen-order-id" className="form-input" value={specimenForm.orderId} onChange={(event) => updateSpecimenField('orderId', event.target.value)} placeholder="AY-10482" dir="ltr" required /></div>
          <div><label className="form-label" htmlFor="specimen-type">نوع العينة <span className="required-mark">*</span></label><input id="specimen-type" className="form-input" value={specimenForm.specimenType} onChange={(event) => updateSpecimenField('specimenType', event.target.value)} placeholder="blood" required /></div>
          <div><label className="form-label" htmlFor="specimen-barcode">الباركود <span className="required-mark">*</span></label><input id="specimen-barcode" className="form-input" value={specimenForm.barcode} onChange={(event) => updateSpecimenField('barcode', event.target.value)} placeholder="LAB-001" dir="ltr" required /></div>
        </div>
        {specimenFormError && <p id="specimen-form-error" className="form-error" role="alert">{specimenFormError}</p>}
        <button className="primary-button operation-submit" type="submit" disabled={creatingSpecimen}>{creatingSpecimen ? 'جارٍ إنشاء العينة…' : 'إنشاء عينة'}</button>
      </form>}
      <div className="operation-toolbar"><label className="filter-field" htmlFor="specimen-status-filter"><span>تصفية الحالة</span><select id="specimen-status-filter" className="form-input" value={specimenFilter} onChange={(event) => setSpecimenFilter(event.target.value as SpecimenFilter)}><option value="all">كل الحالات</option>{Object.entries(SPECIMEN_STATUS_LABELS).map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select></label></div>
      {specimensLoading && <div className="state-card" role="status">جارٍ تحميل العينات…</div>}
      {!specimensLoading && specimensError && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل العينات</strong><span>{specimensError}</span><button className="secondary-button" type="button" onClick={() => void loadSpecimens()}>إعادة المحاولة</button></div>}
      {!specimensLoading && !specimensError && specimens.length === 0 && <div className="state-card" role="status">لا توجد عينات بهذه الحالة. {canManage ? 'أنشئ عينة جديدة أو غيّر الفلتر.' : 'غيّر الفلتر.'}</div>}
      {!specimensLoading && !specimensError && specimens.length > 0 && <div className="operation-table-wrap"><table className="operation-table specimens-table"><caption className="sr-only">قائمة العينات</caption><thead><tr><th scope="col">الباركود</th><th scope="col">رقم الطلب</th><th scope="col">نوع العينة</th><th scope="col">الحالة</th><th scope="col">تاريخ الإنشاء</th><th scope="col">تاريخ السحب</th><th scope="col"><span className="sr-only">إجراء</span></th></tr></thead><tbody>{specimens.map((specimen) => <tr key={specimen.id}><td><strong className="operation-code" dir="ltr">{specimen.barcode}</strong></td><td><span className="operation-code" dir="ltr">{specimen.orderId}</span></td><td>{specimen.specimenType}</td><td><StatusBadge label={SPECIMEN_STATUS_LABELS[specimen.status]} tone={SPECIMEN_STATUS_TONES[specimen.status]} /></td><td dir="ltr">{formatTimestamp(specimen.createdAt)}</td><td dir="ltr">{formatTimestamp(specimen.collectedAt)}</td><td>{canManage && specimen.status === 'pending' && <button className="secondary-button row-action-button" type="button" onClick={() => void collectPendingSpecimen(specimen.barcode)} disabled={collectingBarcode !== null}>{collectingBarcode === specimen.barcode ? 'جارٍ التسجيل…' : 'تسجيل السحب'}</button>}</td></tr>)}</tbody></table></div>}
    </section>
  )
}

function ResultsPanel({ onToast }: { onToast: OperationsViewProps['onToast'] }) {
  const can = useCan()
  const canEnter = can('results.enter')
  const canReview = can('results.review')
  const [labResults, setLabResults] = useState<LabResult[]>([])
  const [resultsLoading, setResultsLoading] = useState(true)
  const [resultsError, setResultsError] = useState('')
  const [resultForm, setResultForm] = useState<ResultFormState>(EMPTY_RESULT_FORM)
  const [resultFormError, setResultFormError] = useState('')
  const [creatingResult, setCreatingResult] = useState(false)
  const [reviewingResultId, setReviewingResultId] = useState<string | null>(null)

  const loadResults = useCallback(async () => {
    setResultsLoading(true); setResultsError('')
    try { setLabResults(await fetchResults()) } catch (requestError) { setResultsError(requestError instanceof Error ? requestError.message : 'تعذر تحميل قائمة النتائج.') } finally { setResultsLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadResults(), 0)
    return () => window.clearTimeout(timer)
  }, [loadResults])

  const updateResultField = (field: keyof ResultFormState, value: string) => setResultForm((current) => ({ ...current, [field]: value }))
  const submitResult = async (event: FormEvent) => {
    event.preventDefault()
    const resultInput: NewLabResult = { orderItemId: resultForm.orderItemId.trim(), value: resultForm.value.trim(), ...(resultForm.unit.trim() && { unit: resultForm.unit.trim() }), ...(resultForm.referenceRange.trim() && { referenceRange: resultForm.referenceRange.trim() }), flag: resultForm.flag }
    if (!resultInput.orderItemId || !resultInput.value) { setResultFormError('أكمل رقم بند الطلب والقيمة على الأقل.'); return }
    setCreatingResult(true); setResultFormError('')
    try {
      await createResult(resultInput)
      setResultForm(EMPTY_RESULT_FORM); onToast('تم حفظ النتيجة كمسودة'); void loadResults()
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : 'تعذر حفظ النتيجة.', 'error')
    } finally { setCreatingResult(false) }
  }

  const reviewLabResult = async (labResult: LabResult) => {
    setReviewingResultId(labResult.id)
    try {
      const reviewedLabResult = await reviewResult(labResult.id)
      onToast(`تم نقل النتيجة إلى ${RESULT_STATUS_LABELS[reviewedLabResult.status]}`); void loadResults()
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : 'تعذر تطبيق المراجعة.', 'error')
    } finally { setReviewingResultId(null) }
  }

  return (
    <section className="panel operation-panel" aria-labelledby="results-title">
      <div className="panel-heading operation-panel-heading"><div><h2 id="results-title">النتائج</h2><p>{canEnter ? 'أدخل النتيجة كمسودة ثم مرّرها للمراجعة على مرحلتين.' : 'تابع حالة النتائج ومراجعتها.'}</p></div><span className="operation-count">{labResults.length}</span></div>
      <p className="workflow-note"><strong>مسار المراجعة:</strong> تنتقل النتيجة من <span>مسودة</span> إلى <span>قيد المراجعة</span> ثم إلى <span>معتمدة</span> عبر ضغط زر المراجعة مرتين.</p>
      {canEnter && <form className="operation-form" onSubmit={submitResult} noValidate aria-describedby={resultFormError ? 'result-form-error' : undefined}>
        <div className="operation-fields operation-fields-result">
          <div><label className="form-label" htmlFor="result-order-item-id">رقم بند الطلب <span className="required-mark">*</span></label><input id="result-order-item-id" className="form-input" value={resultForm.orderItemId} onChange={(event) => updateResultField('orderItemId', event.target.value)} placeholder="order-item-id" dir="ltr" required /></div>
          <div><label className="form-label" htmlFor="result-value">القيمة <span className="required-mark">*</span></label><input id="result-value" className="form-input" value={resultForm.value} onChange={(event) => updateResultField('value', event.target.value)} placeholder="5.4" dir="ltr" required /></div>
          <div><label className="form-label" htmlFor="result-unit">الوحدة</label><input id="result-unit" className="form-input" value={resultForm.unit} onChange={(event) => updateResultField('unit', event.target.value)} placeholder="mmol/L" dir="ltr" /></div>
          <div><label className="form-label" htmlFor="result-reference-range">المدى المرجعي</label><input id="result-reference-range" className="form-input" value={resultForm.referenceRange} onChange={(event) => updateResultField('referenceRange', event.target.value)} placeholder="3.9-5.5" dir="ltr" /></div>
          <div><label className="form-label" htmlFor="result-flag">التصنيف</label><select id="result-flag" className="form-input" value={resultForm.flag} onChange={(event) => updateResultField('flag', event.target.value as ResultFlag)}>{Object.entries(RESULT_FLAG_LABELS).map(([flag, label]) => <option value={flag} key={flag}>{label}</option>)}</select></div>
        </div>
        {resultFormError && <p id="result-form-error" className="form-error" role="alert">{resultFormError}</p>}
        <button className="primary-button operation-submit" type="submit" disabled={creatingResult}>{creatingResult ? 'جارٍ حفظ النتيجة…' : 'حفظ كمسودة'}</button>
      </form>}
      {resultsLoading && <div className="state-card" role="status">جارٍ تحميل النتائج…</div>}
      {!resultsLoading && resultsError && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل النتائج</strong><span>{resultsError}</span><button className="secondary-button" type="button" onClick={() => void loadResults()}>إعادة المحاولة</button></div>}
      {!resultsLoading && !resultsError && labResults.length === 0 && <div className="state-card" role="status">لا توجد نتائج بعد.{canEnter ? ' أدخل نتيجة جديدة لتظهر هنا كمسودة.' : ''}</div>}
      {!resultsLoading && !resultsError && labResults.length > 0 && <div className="operation-table-wrap"><table className="operation-table results-table"><caption className="sr-only">قائمة نتائج المختبر</caption><thead><tr><th scope="col">رقم بند الطلب</th><th scope="col">القيمة</th><th scope="col">الوحدة</th><th scope="col">المدى المرجعي</th><th scope="col">التصنيف</th><th scope="col">الحالة</th><th scope="col">أدخلها</th><th scope="col">راجعها</th>{canReview && <th scope="col"><span className="sr-only">إجراء</span></th>}</tr></thead><tbody>{labResults.map((labResult) => <tr key={labResult.id}><td><span className="operation-code" dir="ltr">{labResult.orderItemId}</span></td><td><strong dir="ltr">{labResult.resultValue}</strong></td><td dir="ltr">{labResult.unit || '—'}</td><td dir="ltr">{labResult.referenceRange || '—'}</td><td>{RESULT_FLAG_LABELS[labResult.flag]}</td><td><StatusBadge label={RESULT_STATUS_LABELS[labResult.status]} tone={RESULT_STATUS_TONES[labResult.status]} /></td><td>{labResult.enteredBy}</td><td>{labResult.reviewedBy || '—'}</td>{canReview && <td>{(labResult.status === 'draft' || labResult.status === 'in_review') && <button className="secondary-button row-action-button" type="button" onClick={() => void reviewLabResult(labResult)} disabled={reviewingResultId !== null}>{labResult.status === 'draft' ? 'إرسال للمراجعة' : 'اعتماد النتيجة'}</button>}</td>}</tr>)}</tbody></table></div>}
    </section>
  )
}

function OperationsView({ onBack, onToast }: OperationsViewProps) {
  return <><ViewHeader title="عمليات المختبر" description="إدارة العينات وإدخال النتائج ومراجعتها." onBack={onBack} /><div className="operations-grid"><SpecimensPanel onToast={onToast} /><ResultsPanel onToast={onToast} /></div></>
}

export default OperationsView

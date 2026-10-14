import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  collectSpecimen,
  collectSpecimenWithOverride,
  rejectSpecimen,
  receiveSpecimen,
  createResult,
  fetchResultWorklist,
  issueLabReport,
  fetchLabReportRelease,
  amendResult,
  fetchSpecimens,
  reviewResult,
  type ResultFlag,
  type ResultStatus,
  type Specimen,
  type SpecimenStatus,
} from './api'
import { useCan, useSession } from './session'
import { ViewHeader } from './ViewHeader'
import { Barcode } from './Barcode'
import { LabReportView } from './LabReportView'

type ToastTone = 'success' | 'error'
type OperationsViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type SpecimenFilter = SpecimenStatus | 'all'
type StatusTone = 'info' | 'success' | 'warning' | 'danger'

const SPECIMEN_STATUS_LABELS: Record<SpecimenStatus, string> = { pending: 'قيد الانتظار', collected: 'تم السحب', received: 'تم الاستلام', processing: 'قيد المعالجة', rejected: 'مرفوضة', completed: 'مكتملة' }
const RESULT_STATUS_LABELS: Record<ResultStatus, string> = { draft: 'مسودة', in_review: 'قيد المراجعة', approved: 'معتمدة', released: 'مُصدرة', amended: 'معدّلة' }
const RESULT_FLAG_LABELS: Record<ResultFlag, string> = { normal: 'طبيعي', low: 'منخفض', high: 'مرتفع', critical: 'حرج', not_applicable: 'غير منطبق' }
const SPECIMEN_STATUS_TONES: Record<SpecimenStatus, StatusTone> = { pending: 'warning', collected: 'success', received: 'info', processing: 'info', rejected: 'danger', completed: 'success' }
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
  const canOverride = useCan()('specimens.overridePayment')
  const [specimens, setSpecimens] = useState<Specimen[]>([])
  const [specimenFilter, setSpecimenFilter] = useState<SpecimenFilter>('all')
  const [specimensLoading, setSpecimensLoading] = useState(true)
  const [specimensError, setSpecimensError] = useState('')
  const [busyBarcode, setBusyBarcode] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, { kind: 'override' | 'reject'; reason: string }>>({})
  const [labelSpecimen, setLabelSpecimen] = useState<Specimen | null>(null)
  const loadSpecimens = useCallback(async () => {
    setSpecimensLoading(true); setSpecimensError('')
    try { setSpecimens(await fetchSpecimens(specimenFilter === 'all' ? undefined : specimenFilter)) }
    catch (error) { setSpecimensError(error instanceof Error ? error.message : 'تعذر تحميل قائمة العينات.') }
    finally { setSpecimensLoading(false) }
  }, [specimenFilter])
  useEffect(() => { const timer = window.setTimeout(() => void loadSpecimens(), 0); return () => window.clearTimeout(timer) }, [loadSpecimens])
  useEffect(() => { const cleanup = () => setLabelSpecimen(null); window.addEventListener('afterprint', cleanup); return () => window.removeEventListener('afterprint', cleanup) }, [])
  const runAction = async (specimen: Specimen, action: 'collect' | 'override' | 'reject' | 'receive') => {
    const form = forms[specimen.barcode]
    if ((action === 'override' || action === 'reject') && !form?.reason.trim()) return
    setBusyBarcode(specimen.barcode)
    try {
      if (action === 'collect') await collectSpecimen(specimen.barcode)
      if (action === 'override') await collectSpecimenWithOverride(specimen.barcode, form.reason.trim())
      if (action === 'reject') await rejectSpecimen(specimen.barcode, form.reason.trim())
      if (action === 'receive') await receiveSpecimen(specimen.barcode)
      setForms((current) => { const next = { ...current }; delete next[specimen.barcode]; return next })
      onToast(action === 'reject' ? 'تم رفض العينة' : action === 'receive' ? 'تم استلام العينة' : 'تم تسجيل سحب العينة بنجاح')
      await loadSpecimens()
    } catch (error) { onToast(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.', 'error') }
    finally { setBusyBarcode(null) }
  }
  const printLabel = (specimen: Specimen) => { setLabelSpecimen(specimen); window.setTimeout(() => window.print(), 60) }
  return <section className="panel operation-panel" aria-labelledby="specimens-title">
    <div className="panel-heading operation-panel-heading"><div><h2 id="specimens-title">العينات</h2><p>عينة مستقلة لكل فحص — راجع بيانات الطلب والدفع قبل السحب.</p></div><span className="operation-count">{specimens.length}</span></div>
    <div className="operation-toolbar"><label className="filter-field" htmlFor="specimen-status-filter"><span>تصفية الحالة</span><select id="specimen-status-filter" className="form-input" value={specimenFilter} onChange={(event) => setSpecimenFilter(event.target.value as SpecimenFilter)}><option value="all">كل الحالات</option>{Object.entries(SPECIMEN_STATUS_LABELS).map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select></label><button className="secondary-button" type="button" onClick={() => void loadSpecimens()} disabled={specimensLoading}>تحديث</button></div>
    {specimensLoading && <div className="state-card" role="status">جارٍ تحميل العينات…</div>}
    {!specimensLoading && specimensError && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل العينات</strong><span>{specimensError}</span><button className="secondary-button" type="button" onClick={() => void loadSpecimens()}>إعادة المحاولة</button></div>}
    {!specimensLoading && !specimensError && specimens.length === 0 && <div className="state-card" role="status">لا توجد عينات بهذه الحالة. اختر حالة أخرى أو أنشئ طلبًا جديدًا.</div>}
    {!specimensLoading && !specimensError && specimens.length > 0 && <div className="specimen-work-list">{specimens.map((specimen) => {
      const form = forms[specimen.barcode]; const terminal = ['rejected', 'completed'].includes(specimen.status); const pending = specimen.status === 'pending'; const collected = specimen.status === 'collected'
      const invoiceText = specimen.invoiceStatus ? ({ draft: 'مسودة', issued: 'مستحقة', partially_paid: 'مدفوعة جزئيًا', paid: 'مدفوعة', void: 'ملغاة' }[specimen.invoiceStatus]) : 'لا توجد فاتورة'
      return <article className="specimen-work-item" key={specimen.id}>
        <div className="specimen-work-heading"><div><strong>{specimen.patientName || 'مريض غير محدد'}</strong><span className="operation-code" dir="ltr">{specimen.orderId}</span></div><StatusBadge label={SPECIMEN_STATUS_LABELS[specimen.status]} tone={SPECIMEN_STATUS_TONES[specimen.status]} /></div>
        <dl className="specimen-work-details"><div><dt>الفحص</dt><dd>{specimen.testName || '—'}</dd></div><div><dt>نوع العينة</dt><dd>{specimen.specimenType}</dd></div><div><dt>الأنبوبة</dt><dd>{specimen.tube || '—'}</dd></div><div><dt>الباركود</dt><dd className="operation-code" dir="ltr">{specimen.barcode}</dd></div><div><dt>الفاتورة</dt><dd>{invoiceText}</dd></div><div><dt>حالة الدفع</dt><dd><StatusBadge label={specimen.paymentCleared ? 'مستوفى' : 'غير مستوفى'} tone={specimen.paymentCleared ? 'success' : 'warning'} /></dd></div><div><dt>إنشاء</dt><dd>{formatTimestamp(specimen.createdAt)}</dd></div><div><dt>السحب</dt><dd>{formatTimestamp(specimen.collectedAt)}</dd></div><div><dt>الاستلام</dt><dd>{formatTimestamp(specimen.receivedAt)}</dd></div>{specimen.rejectedReason && <div><dt>سبب الرفض</dt><dd>{specimen.rejectedReason}</dd></div>}</dl>
        <div className="specimen-actions"><button className="secondary-button row-action-button" type="button" onClick={() => printLabel(specimen)}>طباعة ملصق</button>
          {canManage && pending && specimen.paymentCleared && <button className="primary-button row-action-button" type="button" disabled={busyBarcode !== null} onClick={() => void runAction(specimen, 'collect')}>{busyBarcode === specimen.barcode ? 'جارٍ التسجيل…' : 'تأكيد السحب'}</button>}
          {pending && !specimen.paymentCleared && <span className="specimen-payment-gate" role="status">السحب متوقف: يجب استيفاء الدفع أو التغطية.</span>}
          {canManage && pending && !specimen.paymentCleared && canOverride && <button className="secondary-button row-action-button" type="button" onClick={() => setForms((current) => ({ ...current, [specimen.barcode]: { kind: 'override', reason: '' } }))}>استثناء بموافقة المدير</button>}
          {canManage && (pending || collected) && <button className="secondary-button row-action-button" type="button" onClick={() => setForms((current) => ({ ...current, [specimen.barcode]: { kind: 'reject', reason: '' } }))}>رفض العينة</button>}
          {canManage && collected && <button className="secondary-button row-action-button" type="button" disabled={busyBarcode !== null} onClick={() => void runAction(specimen, 'receive')}>{busyBarcode === specimen.barcode ? 'جارٍ التسجيل…' : 'تأكيد الاستلام'}</button>}
          {terminal && <span className="muted-note">لا توجد إجراءات متاحة لهذه الحالة.</span>}
        </div>
        {form && <form className="specimen-reason-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runAction(specimen, form.kind) }}><label className="form-label" htmlFor={`specimen-reason-${specimen.id}`}>{form.kind === 'override' ? 'سبب الاستثناء' : 'سبب رفض العينة'} <span className="required-mark">*</span></label><textarea id={`specimen-reason-${specimen.id}`} className="form-input" value={form.reason} onChange={(event) => setForms((current) => ({ ...current, [specimen.barcode]: { ...form, reason: event.target.value } }))} maxLength={500} required aria-required="true" /><div className="specimen-actions"><button className="primary-button row-action-button" type="submit" disabled={!form.reason.trim() || busyBarcode !== null}>{busyBarcode === specimen.barcode ? 'جارٍ التنفيذ…' : form.kind === 'override' ? 'تأكيد الاستثناء والسحب' : 'تأكيد الرفض'}</button><button className="secondary-button row-action-button" type="button" onClick={() => setForms((current) => { const next = { ...current }; delete next[specimen.barcode]; return next })}>إلغاء</button></div></form>}
      </article>
    })}</div>}
    {labelSpecimen && <div className="specimen-label-print-list"><article className="specimen-label" aria-label={`ملصق عينة ${labelSpecimen.barcode}`}><strong>{labelSpecimen.patientName || 'مريض غير محدد'}</strong><span>{labelSpecimen.orderId} · {labelSpecimen.testName || 'فحص'}</span><span>الأنبوبة: {labelSpecimen.tube || '—'} · {labelSpecimen.specimenType}</span><Barcode value={labelSpecimen.barcode} className="specimen-label-barcode" label={`باركود العينة ${labelSpecimen.barcode}`} /><b dir="ltr">{labelSpecimen.barcode}</b></article></div>}
  </section>
}
function ResultsPanel({ onToast }: { onToast: OperationsViewProps['onToast'] }) {
  const can = useCan()
  const userId = useSession().user.id
  const [items, setItems] = useState<import('./api').ResultWorklistItem[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [release, setRelease] = useState<import('./api').ReportRelease | null>(null)
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const all = await fetchResultWorklist()
      setItems(all)
      setSelected(current => current || all[0]?.orderId || '')
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل قائمة العمل.') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  const orders = [...new Map(items.map(item => [item.orderId, item])).values()]
  const order = orders.find(item => item.orderId === selected)
  const rows = items.filter(item => item.orderId === selected)
  const refreshMutation = async (action: () => Promise<unknown>, message: string) => {
    try { await action(); onToast(message); await load() }
    catch (e) { onToast(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء.', 'error') }
  }
  const submit = (item: import('./api').ResultWorklistItem, parameterId?: string) => {
    const key = `${item.orderItemId}:${parameterId ?? ''}`
    const value = values[key]?.trim()
    if (!value) return
    void refreshMutation(() => createResult({ orderItemId: item.orderItemId, ...(parameterId ? { parameterId } : {}), value }), 'تم حفظ النتيجة كمسودة')
  }
  const openRelease = async (id: string) => {
    try { setRelease(await fetchLabReportRelease(id)) }
    catch (e) { onToast(e instanceof Error ? e.message : 'تعذر فتح التقرير.', 'error') }
  }
  if (release) return <LabReportView release={release} onClose={() => setRelease(null)} />
  return <section className="panel operation-panel" aria-labelledby="results-title">
    <div className="panel-heading operation-panel-heading"><div><h2 id="results-title">النتائج والتقارير</h2><p>قائمة عمل مرتبة حسب الطلب، مع تحميل جميع الصفحات.</p></div><button className="secondary-button" type="button" onClick={() => void load()}>تحديث</button></div>
    {busy && <div className="state-card" role="status">جارٍ تحميل قائمة العمل…</div>}
    {!busy && error && <div className="state-card state-card-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => void load()}>إعادة المحاولة</button></div>}
    {!busy && !error && !orders.length && <div className="state-card">لا توجد عينات مستلمة أو قيد المعالجة.</div>}
    {!busy && !error && orders.length > 0 && <>
      <div className="operation-toolbar"><label className="filter-field">الطلب<select className="form-input" value={selected} onChange={event => setSelected(event.target.value)}>{orders.map(item => <option key={item.orderId} value={item.orderId}>{item.patientName} · {item.publicOrderId}</option>)}</select></label></div>
      {order && <div className="specimen-work-list">
        <h3>{order.patientName} · {order.patientSex || '—'} · {order.patientDateOfBirth || '—'}</h3><p>الطلب <b dir="ltr">{order.publicOrderId}</b> · {formatTimestamp(order.orderDate)}</p>
        {rows.map(item => {
          const parameters = item.parameters.length ? item.parameters : [null]
          return <article className="specimen-work-item" key={item.orderItemId}>
            <h3>{item.catalogName} · {item.specimenType}</h3>
            <div className="operation-table-wrap result-grid-wrap">
              <table className="operation-table result-work-table">
                <caption className="sr-only">نتائج {item.catalogName}</caption>
                <thead><tr><th scope="col">الفحص / المؤشر</th><th scope="col">النتيجة</th><th scope="col">الوحدة</th><th scope="col">المدى المرجعي المعتمد</th><th scope="col">الحالة</th><th scope="col">الإجراءات والسجل</th></tr></thead>
                <tbody>{parameters.map(parameter => {
                  const parameterId = parameter?.id ?? null
                  const history = item.results.filter(result => result.parameterId === parameterId).sort((a, b) => b.version - a.version)
                  const latest = history[0]
                  const key = `${item.orderItemId}:${parameterId ?? ''}`
                  const range = parameter?.selectedRange
                  const rangeLabel = !range ? 'لا يوجد مدى معتمد' : range.resultType === 'numeric' ? `${range.low ?? '—'} – ${range.high ?? '—'} ${parameter?.unit ?? ''}` : (range.normalText ?? range.textValue ?? 'مدى معتمد')
                  const amendable = latest && (latest.status === 'approved' || latest.status === 'released')
                  return <tr key={key}>
                    <td><strong>{parameter?.nameAr || 'نتيجة الفحص'}</strong><small>{parameter?.nameEn || item.catalogCode}</small></td>
                    <td>{latest ? <b dir="ltr">{latest.resultValue}</b> : can('results.enter') ? <input className="form-input" dir="ltr" aria-label={`نتيجة ${parameter?.nameAr || item.catalogName}`} value={values[key] || ''} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /> : '—'}</td>
                    <td dir="ltr">{parameter?.unit || latest?.unit || '—'}</td>
                    <td dir="ltr">{rangeLabel}</td>
                    <td>{latest ? <span>{RESULT_STATUS_LABELS[latest.status]} · {RESULT_FLAG_LABELS[latest.flag]}</span> : 'لم تُدخل'}</td>
                    <td><div className="result-row-actions">
                      {can('results.enter') && !latest && <button className="primary-button row-action-button" type="button" disabled={!values[key]?.trim()} onClick={() => submit(item, parameter?.id)}>حفظ كمسودة</button>}
                      {latest && can('results.review') && latest.status === 'draft' && <button className="secondary-button row-action-button" type="button" onClick={() => void refreshMutation(() => reviewResult(latest.id), 'أُرسلت النتيجة للمراجعة')}>إرسال للمراجعة</button>}
                      {latest && can('results.review') && latest.status === 'in_review' && latest.enteredById !== userId && <button className="secondary-button row-action-button" type="button" onClick={() => void refreshMutation(() => reviewResult(latest.id), 'تم اعتماد النتيجة')}>اعتماد بواسطة مراجع آخر</button>}
                      {latest && can('results.enter') && amendable && <div className="result-entry"><input className="form-input" placeholder="القيمة المعدلة" aria-label="القيمة المعدلة" dir="ltr" value={values[`amend:${latest.id}`] || ''} onChange={event => setValues(current => ({ ...current, [`amend:${latest.id}`]: event.target.value }))} /><input className="form-input" placeholder="سبب التعديل (إلزامي)" aria-label="سبب التعديل" required value={reasons[latest.id] || ''} onChange={event => setReasons(current => ({ ...current, [latest.id]: event.target.value }))} /><button className="secondary-button row-action-button" type="button" disabled={!values[`amend:${latest.id}`]?.trim() || !reasons[latest.id]?.trim()} onClick={() => void refreshMutation(() => amendResult(latest.id, { value: values[`amend:${latest.id}`], reason: reasons[latest.id] }), 'تم إنشاء نسخة معدلة')}>اعتماد تعديل</button></div>}
                      {history.length > 0 && <details className="result-history"><summary>السجل والإصدارات ({history.length})</summary>{history.map(result => <p key={result.id}>v{result.version} · {result.enteredBy} / {result.reviewedBy || '—'} · {RESULT_FLAG_LABELS[result.flag]} · {result.amendmentReason || ''}</p>)}</details>}
                    </div></td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          </article>
        })}        <div className="specimen-actions">{can('labReports.issue') && <button className="primary-button" type="button" onClick={() => void (async () => { try { const issued = await issueLabReport(selected); setRelease(issued); await load() } catch (e) { onToast(e instanceof Error ? e.message : 'تعذر إصدار التقرير.', 'error') } })()}>إصدار التقرير</button>}{can('labReports.view') && order.releases.map(report => <button className="secondary-button" type="button" key={report.id} onClick={() => void openRelease(report.id)}>فتح التقرير v{report.version}</button>)}</div>
      </div>}
    </>}
  </section>
}
function OperationsView({ onBack, onToast }: OperationsViewProps) {
  return <><ViewHeader title="عمليات المختبر" description="إدارة العينات وإدخال النتائج ومراجعتها." onBack={onBack} /><div className="operations-grid"><SpecimensPanel onToast={onToast} /><ResultsPanel onToast={onToast} /></div></>
}

export default OperationsView

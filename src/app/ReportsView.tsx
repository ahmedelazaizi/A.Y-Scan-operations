import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { fetchOperationsReport, type OperationsReport, type ReportDateRange } from './api'
import { ViewHeader } from './ViewHeader'

type ReportsViewProps = { onBack: () => void }
type ReportMetric = { label: string; value: number; money?: boolean }
type ReportSectionProps = { title: string; description: string; metrics: ReportMetric[] }

const numberFormatter = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 })
const currencyFormatter = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 })

function formatMetric(value: number, money = false): string {
  return (money ? currencyFormatter : numberFormatter).format(value)
}

function formatPeriod(period: OperationsReport['period']): string {
  if (!period.from && !period.to) return 'كل الفترات المتاحة'
  return `${period.from ?? 'البداية'} — ${period.to ?? 'اليوم'}`
}

function hasActivity(report: OperationsReport): boolean {
  return [
    report.orders.total, report.specimens.total, report.results.total, report.billing.invoiced,
    report.billing.paid, report.radiology.total, report.inventory.items, report.insurance.claimsTotal,
    report.homeVisits.total,
  ].some((count) => count > 0)
}

function ReportSection({ title, description, metrics }: ReportSectionProps) {
  return <section className="panel reports-section" aria-labelledby={`${title}-report-title`}><div className="panel-heading"><div><h2 id={`${title}-report-title`}>{title}</h2><p>{description}</p></div></div><div className="reports-metric-grid">{metrics.map((metric) => <article className="reports-metric" key={metric.label}><span>{metric.label}</span><strong dir="ltr">{formatMetric(metric.value, metric.money)}</strong></article>)}</div></section>
}

function ReportsView({ onBack }: ReportsViewProps) {
  const [dateRange, setDateRange] = useState<ReportDateRange>({})
  const [report, setReport] = useState<OperationsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const loadReport = useCallback(async (range: ReportDateRange = {}) => {
    setLoading(true)
    setError('')
    try {
      setReport(await fetchOperationsReport(range))
    } catch (requestError) {
      setReport(null)
      setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل تقرير العمليات.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0)
    return () => window.clearTimeout(timer)
  }, [loadReport])

  const updateDate = (field: 'from' | 'to', value: string) => setDateRange((current) => ({ ...current, [field]: value || undefined }))
  const submitDateRange = (event: FormEvent) => {
    event.preventDefault()
    if (dateRange.from && dateRange.to && dateRange.from > dateRange.to) {
      setFormError('يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.')
      return
    }
    setFormError('')
    void loadReport(dateRange)
  }

  return <>
    <ViewHeader
      title="التقارير"
      description="ملخص تشغيلي مجمّع لجميع الوحدات، بلا بيانات تعريفية أو تفاصيل مرضى."
      onBack={onBack}
      action={<button className="secondary-button reports-print-button" type="button" onClick={() => window.print()}>طباعة التقرير</button>}
    />
    <section className="panel reports-controls" aria-labelledby="reports-filter-title">
      <div><h2 id="reports-filter-title">نطاق التقرير</h2><p>اختر فترة اختيارية لتصفية المؤشرات التشغيلية.</p></div>
      <form className="reports-filter-form" onSubmit={submitDateRange} noValidate aria-describedby={formError ? 'reports-filter-error' : undefined}>
        <label className="filter-field" htmlFor="report-from"><span>من</span><input id="report-from" className="form-input" type="date" value={dateRange.from ?? ''} onChange={(event) => updateDate('from', event.target.value)} /></label>
        <label className="filter-field" htmlFor="report-to"><span>إلى</span><input id="report-to" className="form-input" type="date" value={dateRange.to ?? ''} onChange={(event) => updateDate('to', event.target.value)} /></label>
        <button className="primary-button reports-filter-button" type="submit" disabled={loading}>{loading ? 'جارٍ التحميل…' : 'تحديث التقرير'}</button>
      </form>
      {formError && <p id="reports-filter-error" className="form-error" role="alert">{formError}</p>}
    </section>
    {loading && <div className="state-card" role="status">جارٍ تحميل تقرير العمليات…</div>}
    {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل التقرير</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadReport(dateRange)}>إعادة المحاولة</button></div>}
    {!loading && !error && report && <>
      <div className="reports-status-row"><span className="status status-success"><span className="status-dot" aria-hidden="true" />التقرير جاهز</span><span className="reports-period" dir="ltr">{formatPeriod(report.period)}</span></div>
      {!hasActivity(report) && <div className="reports-empty" role="status">لا توجد بيانات تشغيلية في النطاق المحدد. ستظهر المؤشرات تلقائيًا عند توفر سجلات.</div>}
      <section className="reports-summary-grid" aria-label="ملخص التقرير">
        <article className="reports-summary-card"><span>الطلبات</span><strong dir="ltr">{formatMetric(report.orders.total)}</strong><small>{formatMetric(report.orders.completed)} مكتملة</small></article>
        <article className="reports-summary-card"><span>العينات</span><strong dir="ltr">{formatMetric(report.specimens.total)}</strong><small>{formatMetric(report.specimens.completed)} مكتملة</small></article>
        <article className="reports-summary-card"><span>النتائج</span><strong dir="ltr">{formatMetric(report.results.total)}</strong><small>{formatMetric(report.results.reviewed)} مُراجعة</small></article>
        <article className="reports-summary-card"><span>الفوترة</span><strong dir="ltr">{formatMetric(report.billing.invoiced, true)}</strong><small>{formatMetric(report.billing.open, true)} مفتوح</small></article>
      </section>
      <div className="reports-sections">
        <ReportSection title="الطلبات" description="حالة الطلبات خلال الفترة المحددة." metrics={[{ label: 'الإجمالي', value: report.orders.total }, { label: 'مكتملة', value: report.orders.completed }, { label: 'بانتظار العينة', value: report.orders.awaitingSample }, { label: 'قيد التنفيذ', value: report.orders.inProgress }]} />
        <ReportSection title="العينات" description="توزيع العينات حسب مرحلة التشغيل." metrics={[{ label: 'الإجمالي', value: report.specimens.total }, { label: 'تم السحب', value: report.specimens.collected }, { label: 'قيد المعالجة', value: report.specimens.processing }, { label: 'مكتملة', value: report.specimens.completed }]} />
        <ReportSection title="النتائج" description="مؤشرات إدخال ومراجعة النتائج." metrics={[{ label: 'الإجمالي', value: report.results.total }, { label: 'مسودات', value: report.results.draft }, { label: 'مُراجعة', value: report.results.reviewed }]} />
        <ReportSection title="الفوترة" description="القيم المالية المجمعة بالجنيه المصري." metrics={[{ label: 'المفوتر', value: report.billing.invoiced, money: true }, { label: 'المدفوع', value: report.billing.paid, money: true }, { label: 'المفتوح', value: report.billing.open, money: true }]} />
        <ReportSection title="الأشعة" description="توزيع دراسات الأشعة حسب الحالة." metrics={[{ label: 'الإجمالي', value: report.radiology.total }, { label: 'مجدولة', value: report.radiology.scheduled }, { label: 'قيد التنفيذ', value: report.radiology.inProgress }, { label: 'تم التقرير', value: report.radiology.reported }, { label: 'تم التحقق', value: report.radiology.verified }]} />
        <ReportSection title="المخزون" description="عدد الأصناف النشطة والأصناف منخفضة المخزون." metrics={[{ label: 'الأصناف', value: report.inventory.items }, { label: 'منخفض المخزون', value: report.inventory.lowStock }]} />
        <ReportSection title="التأمين" description="حالة مطالبات التأمين المجمعة." metrics={[{ label: 'إجمالي المطالبات', value: report.insurance.claimsTotal }, { label: 'مُرسلة', value: report.insurance.submitted }, { label: 'مُعتمدة', value: report.insurance.approved }, { label: 'مدفوعة', value: report.insurance.paid }]} />
        <ReportSection title="الزيارات المنزلية" description="حالة الزيارات المجدولة للفترة." metrics={[{ label: 'الإجمالي', value: report.homeVisits.total }, { label: 'مجدولة', value: report.homeVisits.scheduled }, { label: 'قيد التنفيذ', value: report.homeVisits.inProgress }, { label: 'مكتملة', value: report.homeVisits.completed }]} />
      </div>
    </>}
  </>
}

export default ReportsView

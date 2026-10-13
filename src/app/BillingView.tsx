import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createInvoice,
  fetchInvoices,
  recordInvoicePayment,
  type Invoice,
  type InvoiceStatus,
  type NewInvoice,
  type PaymentMethod,
} from './api'
import { useCan } from './session'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type BillingViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type InvoiceFilter = InvoiceStatus | 'all'
type InvoiceDraft = { orderId: string; description: string; quantity: string; unitPrice: string; discount: string; tax: string }
type PaymentDraft = { amount: string; method: PaymentMethod; reference: string }

type StatusTone = 'info' | 'success' | 'warning' | 'danger'

const EMPTY_INVOICE_DRAFT: InvoiceDraft = { orderId: '', description: '', quantity: '1', unitPrice: '', discount: '0', tax: '0' }
const EMPTY_PAYMENT_DRAFT: PaymentDraft = { amount: '', method: 'cash', reference: '' }
const STATUS_LABELS: Record<InvoiceStatus, string> = { draft: 'مسودة', issued: 'مُصدرة', partially_paid: 'مدفوعة جزئيًا', paid: 'مدفوعة', void: 'ملغاة' }
const STATUS_TONES: Record<InvoiceStatus, StatusTone> = { draft: 'warning', issued: 'info', partially_paid: 'warning', paid: 'success', void: 'danger' }
const STATUS_OPTIONS: Array<{ value: InvoiceFilter; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'draft', label: STATUS_LABELS.draft },
  { value: 'issued', label: STATUS_LABELS.issued },
  { value: 'partially_paid', label: STATUS_LABELS.partially_paid },
  { value: 'paid', label: STATUS_LABELS.paid },
  { value: 'void', label: STATUS_LABELS.void },
]
const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'نقدي' },
  { value: 'card', label: 'بطاقة' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'insurance', label: 'تأمين' },
]
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })

function formatInvoiceDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'غير محدد' : dateFormatter.format(date)
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: currency || 'EGP', maximumFractionDigits: 2 }).format(value)
}

function getPaidAmount(invoice: Invoice) {
  return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`status status-${STATUS_TONES[status]}`}><span className="status-dot" aria-hidden="true" />{STATUS_LABELS[status]}</span>
}

function CreateInvoicePanel({ onCreated, onToast }: { onCreated: () => Promise<void>; onToast: BillingViewProps['onToast'] }) {
  const [draft, setDraft] = useState<InvoiceDraft>(EMPTY_INVOICE_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const preview = useMemo(() => {
    const quantity = Number(draft.quantity) || 0
    const unitPrice = Number(draft.unitPrice) || 0
    const subtotal = Math.round(quantity * unitPrice * 100) / 100
    const discount = Number(draft.discount) || 0
    const tax = Number(draft.tax) || 0
    return { subtotal, total: Math.round((subtotal - discount + tax) * 100) / 100 }
  }, [draft])

  const updateDraft = (field: keyof InvoiceDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))
  const submitInvoice = async (event: FormEvent) => {
    event.preventDefault()
    const quantity = Number(draft.quantity)
    const unitPrice = Number(draft.unitPrice)
    const discount = Number(draft.discount)
    const tax = Number(draft.tax)
    if (!draft.orderId.trim() || !draft.description.trim()) { setError('أكمل رقم الطلب ووصف البند.'); return }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) { setError('أدخل كمية موجبة وسعرًا صحيحًا.'); return }
    if (!Number.isFinite(discount) || discount < 0 || !Number.isFinite(tax) || tax < 0) { setError('أدخل خصمًا وضريبة غير سالبين.'); return }
    const invoice: NewInvoice = { orderId: draft.orderId.trim(), items: [{ description: draft.description.trim(), quantity, unitPrice }], discount, tax }
    setSaving(true)
    setError('')
    try {
      await createInvoice(invoice)
      setDraft(EMPTY_INVOICE_DRAFT)
      await onCreated()
      onToast('تم إنشاء الفاتورة بنجاح')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر إنشاء الفاتورة.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel billing-create-panel" aria-labelledby="create-invoice-title"><div className="panel-heading"><div><h2 id="create-invoice-title">إنشاء فاتورة</h2><p>البيانات التجريبية تستخدم رقم الطلب `AY-10482` فقط.</p></div></div><form className="billing-form" onSubmit={submitInvoice} noValidate aria-describedby={error ? 'invoice-form-error' : 'invoice-preview-note'}><div className="billing-form-grid"><div><label className="form-label" htmlFor="invoice-order-id">رقم الطلب <span className="required-mark">*</span></label><input id="invoice-order-id" className="form-input" value={draft.orderId} onChange={(event) => updateDraft('orderId', event.target.value)} placeholder="AY-10482" dir="ltr" required /></div><div><label className="form-label" htmlFor="invoice-description">وصف البند <span className="required-mark">*</span></label><input id="invoice-description" className="form-input" value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="CBC — بيانات تجريبية" required /></div><div><label className="form-label" htmlFor="invoice-quantity">الكمية <span className="required-mark">*</span></label><input id="invoice-quantity" className="form-input" type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(event) => updateDraft('quantity', event.target.value)} dir="ltr" required /></div><div><label className="form-label" htmlFor="invoice-unit-price">سعر الوحدة <span className="required-mark">*</span></label><input id="invoice-unit-price" className="form-input" type="number" min="0" step="0.01" value={draft.unitPrice} onChange={(event) => updateDraft('unitPrice', event.target.value)} placeholder="60.00" dir="ltr" required /></div><div><label className="form-label" htmlFor="invoice-discount">الخصم</label><input id="invoice-discount" className="form-input" type="number" min="0" step="0.01" value={draft.discount} onChange={(event) => updateDraft('discount', event.target.value)} dir="ltr" /></div><div><label className="form-label" htmlFor="invoice-tax">الضريبة</label><input id="invoice-tax" className="form-input" type="number" min="0" step="0.01" value={draft.tax} onChange={(event) => updateDraft('tax', event.target.value)} dir="ltr" /></div></div><div id="invoice-preview-note" className="billing-preview" aria-live="polite"><span>معاينة محلية للعرض فقط</span><strong>الإجمالي التقريبي: <b dir="ltr">{formatMoney(preview.total, 'EGP')}</b></strong><small>سيحسب الخادم القيم النهائية ويظل المصدر المعتمد.</small></div>{error && <p id="invoice-form-error" className="form-error" role="alert">{error}</p>}<button className="primary-button billing-submit" type="submit" disabled={saving}>{saving ? 'جارٍ إنشاء الفاتورة…' : 'إنشاء الفاتورة'}</button></form></section>
}

function PaymentForm({ invoice, onCompleted, onToast }: { invoice: Invoice; onCompleted: () => Promise<void>; onToast: BillingViewProps['onToast'] }) {
  const [draft, setDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const paidAmount = getPaidAmount(invoice)
  const remaining = Math.max(0, invoice.total - paidAmount)
  const updateDraft = (field: keyof PaymentDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('أدخل مبلغًا موجبًا.'); return }
    if (amount > remaining) { setError('لا يمكن أن يتجاوز المبلغ الرصيد المتبقي.'); return }
    setSaving(true)
    setError('')
    try {
      await recordInvoicePayment(invoice.id, { amount, method: draft.method, ...(draft.reference.trim() && { reference: draft.reference.trim() }) })
      await onCompleted()
      onToast('تم تسجيل الدفعة وتحديث الفواتير')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تسجيل الدفعة.')
    } finally {
      setSaving(false)
    }
  }

  return <form className="payment-form" onSubmit={submitPayment} noValidate aria-label={`تسجيل دفعة للفاتورة ${invoice.invoiceNumber}`}><div><label className="form-label" htmlFor={`payment-amount-${invoice.id}`}>المبلغ <span className="required-mark">*</span></label><input id={`payment-amount-${invoice.id}`} className="form-input" type="number" min="0.01" max={remaining} step="0.01" value={draft.amount} onChange={(event) => updateDraft('amount', event.target.value)} placeholder={remaining.toFixed(2)} dir="ltr" required /></div><div><label className="form-label" htmlFor={`payment-method-${invoice.id}`}>طريقة الدفع</label><select id={`payment-method-${invoice.id}`} className="form-input" value={draft.method} onChange={(event) => updateDraft('method', event.target.value as PaymentMethod)}>{PAYMENT_METHOD_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></div><div><label className="form-label" htmlFor={`payment-reference-${invoice.id}`}>المرجع</label><input id={`payment-reference-${invoice.id}`} className="form-input" value={draft.reference} onChange={(event) => updateDraft('reference', event.target.value)} placeholder="اختياري" dir="ltr" /></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button row-action-button" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'تأكيد الدفعة'}</button></form>
}

function BillingView({ onBack, onToast }: BillingViewProps) {
  const canManage = useCan()('billing.manage')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setInvoices(await fetchInvoices(filter === 'all' ? undefined : filter))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل الفواتير.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInvoices(), 0)
    return () => window.clearTimeout(timer)
  }, [loadInvoices])

  return <><ViewHeader title="الفوترة" description={canManage ? 'أنشئ الفواتير وتابع المدفوع والمتبقي. البيانات المعروضة تجريبية فقط.' : 'تابع المدفوع والمتبقي. البيانات المعروضة تجريبية فقط.'} onBack={onBack} /><div className="billing-layout">{canManage && <CreateInvoicePanel onCreated={loadInvoices} onToast={onToast} />}<section className="panel billing-list-panel" aria-labelledby="invoice-list-title"><div className="panel-heading billing-list-heading"><div><h2 id="invoice-list-title">الفواتير</h2><p>رقم الطلب العام يظهر بصيغة `AY-...`.</p></div><label className="filter-field" htmlFor="invoice-status-filter"><span>تصفية الحالة</span><select id="invoice-status-filter" className="form-input" value={filter} onChange={(event) => setFilter(event.target.value as InvoiceFilter)}>{STATUS_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div>{loading && <div className="state-card" role="status">جارٍ تحميل الفواتير…</div>}{!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الفواتير</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadInvoices()}>إعادة المحاولة</button></div>}{!loading && !error && invoices.length === 0 && <div className="state-card" role="status">لا توجد فواتير بهذه الحالة.{canManage ? ' أنشئ فاتورة تجريبية باستخدام `AY-10482`.' : ''}</div>}{!loading && !error && invoices.length > 0 && <div className="billing-table-wrap"><table className="billing-table"><caption className="sr-only">قائمة الفواتير</caption><thead><tr><th scope="col">الفاتورة</th><th scope="col">رقم الطلب</th><th scope="col">الإجمالي</th><th scope="col">المدفوع / المتبقي</th><th scope="col">التاريخ</th><th scope="col">الحالة</th>{canManage && <th scope="col"><span className="sr-only">إجراء</span></th>}</tr></thead><tbody>{invoices.map((invoice) => { const paidAmount = getPaidAmount(invoice); const remaining = Math.max(0, invoice.total - paidAmount); const canPay = invoice.status !== 'paid' && invoice.status !== 'void'; return <Fragment key={invoice.id}><tr><td><strong className="operation-code" dir="ltr">{invoice.invoiceNumber}</strong></td><td><span className="order-id" dir="ltr">{invoice.orderId}</span></td><td><strong dir="ltr">{formatMoney(invoice.total, invoice.currency)}</strong></td><td><span className="billing-paid" dir="ltr">{formatMoney(paidAmount, invoice.currency)}</span><small className="billing-remaining" dir="ltr">متبقي {formatMoney(remaining, invoice.currency)}</small></td><td dir="ltr">{formatInvoiceDate(invoice.createdAt)}</td><td><StatusBadge status={invoice.status} /></td>{canManage && <td>{canPay && <button className="secondary-button row-action-button" type="button" onClick={() => setPaymentInvoiceId((current) => current === invoice.id ? null : invoice.id)} aria-expanded={paymentInvoiceId === invoice.id} aria-controls={`payment-form-${invoice.id}`}>{paymentInvoiceId === invoice.id ? 'إلغاء' : 'تسجيل دفعة'}</button>}</td>}</tr>{canManage && paymentInvoiceId === invoice.id && canPay && <tr className="payment-row"><td colSpan={7}><div id={`payment-form-${invoice.id}`}><PaymentForm invoice={invoice} onCompleted={async () => { setPaymentInvoiceId(null); await loadInvoices() }} onToast={onToast} /></div></td></tr>}</Fragment>})}</tbody></table></div>}</section></div></>
}

export default BillingView

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { fetchReceptionOrders, recordInvoicePayment, type Invoice, type NewPayment, type PaymentMethod, type ReceptionOrder } from './api'
import { formatDateTime } from './format'
import { useCan } from './session'
import { ViewHeader } from './ViewHeader'
import { Barcode } from './Barcode'

type ToastTone = 'success' | 'error'
type BillingViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type PaymentDraft = { amount: string; method: PaymentMethod; reference: string }
const STATUS_LABELS: Record<string, string> = { processing: 'قيد التنفيذ', ready_for_review: 'جاهز للمراجعة', awaiting_sample: 'بانتظار العينة', completed: 'مكتمل' }
const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [{ value: 'cash', label: 'نقدي' }, { value: 'card', label: 'بطاقة' }, { value: 'bank_transfer', label: 'تحويل بنكي' }]
const emptyDraft: PaymentDraft = { amount: '', method: 'cash', reference: '' }

function paidAmount(invoice: Invoice) { return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0) }
function money(amount: number, currency = 'EGP') { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: currency || 'EGP', maximumFractionDigits: 2 }).format(amount) }

function OrderBarcode({ orderId }: { orderId: string }) {
  return <Barcode value={orderId} className="receipt-barcode" label={`باركود الطلب ${orderId}`} />
}

function ThermalReceipt({ order }: { order: ReceptionOrder }) {
  const invoice = order.invoice
  if (!invoice) return null
  const paid = paidAmount(invoice)
  const remaining = Math.max(0, invoice.total - paid)
  return <article className="thermal-receipt" aria-label={`إيصال الفاتورة ${invoice.invoiceNumber}`}><header><img src="/brand/ay-scan-logo.svg" alt="A.Y Scan" /><strong>A.Y Scan</strong><span>إيصال كاشير</span></header><div className="receipt-rule" /><p>رقم الفاتورة <b dir="ltr">{invoice.invoiceNumber}</b></p><p>رقم الطلب <b dir="ltr">{order.id}</b></p><p>المريض <b>{order.patient}</b></p><p>التاريخ <b>{formatDateTime(invoice.createdAt)}</b></p><div className="receipt-rule" /><div className="receipt-items"><strong>البند</strong><strong>الإجمالي</strong>{invoice.items.map((line) => <div className="receipt-item" key={line.id}><span>{line.description} × {line.quantity}</span><b dir="ltr">{money(line.lineTotal, invoice.currency)}</b></div>)}</div><div className="receipt-rule" /><p>الإجمالي <b dir="ltr">{money(invoice.total, invoice.currency)}</b></p><p>المدفوع <b dir="ltr">{money(paid, invoice.currency)}</b></p><p className="receipt-balance">المتبقي <b dir="ltr">{money(remaining, invoice.currency)}</b></p><OrderBarcode orderId={order.id} /><small className="receipt-barcode-caption" dir="ltr">{order.id}</small><footer>شكرًا لزيارتكم — A.Y Scan</footer></article>
}

function PaymentForm({ invoice, onCompleted, onToast }: { invoice: Invoice; onCompleted: () => Promise<void>; onToast: BillingViewProps['onToast'] }) {
  const [draft, setDraft] = useState<PaymentDraft>(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const remaining = Math.max(0, invoice.total - paidAmount(invoice))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { setError('أدخل مبلغًا موجبًا لا يتجاوز الرصيد المتبقي.'); return }
    setSaving(true); setError('')
    try {
      const payment: NewPayment = { amount, method: draft.method, ...(draft.reference.trim() && { reference: draft.reference.trim() }) }
      await recordInvoicePayment(invoice.id, payment); await onCompleted(); setDraft(emptyDraft); onToast('تم تسجيل الدفعة وتحديث الكشف')
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'تعذر تسجيل الدفعة.') }
    finally { setSaving(false) }
  }
  return <form className="payment-form" onSubmit={submit} noValidate aria-label={`تحصيل الفاتورة ${invoice.invoiceNumber}`}><div><label className="form-label" htmlFor={`payment-amount-${invoice.id}`}>مبلغ التحصيل</label><input id={`payment-amount-${invoice.id}`} className="form-input" type="number" min="0.01" max={remaining} step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder={remaining.toFixed(2)} dir="ltr" required /></div><div><label className="form-label" htmlFor={`payment-method-${invoice.id}`}>طريقة الدفع</label><select id={`payment-method-${invoice.id}`} className="form-input" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as PaymentMethod })}>{PAYMENT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></div><div><label className="form-label" htmlFor={`payment-reference-${invoice.id}`}>المرجع</label><input id={`payment-reference-${invoice.id}`} className="form-input" value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} dir="ltr" /></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button row-action-button" type="submit" disabled={saving || remaining <= 0}>{saving ? 'جارٍ التسجيل…' : 'تأكيد التحصيل'}</button></form>
}

function BillingView({ onBack, onToast }: BillingViewProps) {
  const canManage = useCan()('billing.manage')
  const [orders, setOrders] = useState<ReceptionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [printOrderId, setPrintOrderId] = useState<string | null>(null)
  const loadOrders = useCallback(async () => {
    setLoading(true); setError('')
    try { setOrders(await fetchReceptionOrders()) }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل طلبات الاستقبال.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void loadOrders(), 0); return () => window.clearTimeout(timer) }, [loadOrders])
  const sortedOrders = useMemo(() => [...orders].sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime()), [orders])
  const handlePrint = (orderId: string) => { setPaymentOrderId(null); setPrintOrderId(orderId); window.setTimeout(() => window.print(), 50) }
  useEffect(() => { const cleanup = () => setPrintOrderId(null); window.addEventListener('afterprint', cleanup); return () => window.removeEventListener('afterprint', cleanup) }, [])

  return <><ViewHeader title="الطلبات والفواتير" description="كشف الاستقبال والتحصيل المرتبط بالفاتورة والطلب." onBack={onBack} /><section className="panel billing-list-panel reception-billing" aria-labelledby="reception-orders-title"><div className="panel-heading billing-list-heading"><div><h2 id="reception-orders-title">كشف الطلبات والفواتير</h2><p>تفاصيل كل طلب وفاتورته وعمليات التحصيل.</p></div><button className="secondary-button" type="button" onClick={() => void loadOrders()} disabled={loading}>تحديث الكشف</button></div>
    {loading && <div className="state-card" role="status">جارٍ تحميل الطلبات والفواتير…</div>}{!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الكشف</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadOrders()}>إعادة المحاولة</button></div>}{!loading && !error && !sortedOrders.length && <div className="state-card" role="status">لا توجد طلبات استقبال مسجلة بعد.</div>}
    {!loading && !error && !!sortedOrders.length && <div className="billing-table-wrap"><table className="billing-table reception-table"><caption className="sr-only">الطلبات والفواتير والتحصيلات</caption><thead><tr><th>المريض / الطلب</th><th>الطبيب</th><th>الحالة</th><th>الإجمالي</th><th>المدفوع / المتبقي</th><th>الفاتورة والإجراءات</th></tr></thead><tbody>{sortedOrders.map((order) => { const invoice = order.invoice; const paid = invoice ? paidAmount(invoice) : 0; const remaining = invoice ? Math.max(0, invoice.total - paid) : null; return <Fragment key={order.id}><tr><td data-label="المريض / الطلب"><strong>{order.patient}</strong><span className="billing-order-id" dir="ltr">{order.id}</span></td><td data-label="الطبيب">{order.practitioner || '—'}</td><td data-label="الحالة"><span className={`status ${invoice?.status === 'paid' ? 'status-success' : invoice ? 'status-info' : 'status-warning'}`}><span className="status-dot" />{invoice ? invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'partially_paid' ? 'مدفوعة جزئيًا' : invoice.status === 'void' ? 'ملغاة' : 'مستحقة' : 'طلب قديم بلا فاتورة'}</span><small className="order-state">{STATUS_LABELS[order.status] || order.state}</small></td><td data-label="الإجمالي"><strong>{invoice ? money(invoice.total, invoice.currency) : order.subtotalPiastres ? money(order.subtotalPiastres / 100) : 'غير متاح'}</strong></td><td data-label="المدفوع / المتبقي">{invoice ? <><span className="billing-paid">مدفوع: {money(paid, invoice.currency)}</span><span className="billing-remaining">متبقي: {money(remaining || 0, invoice.currency)}</span></> : <span className="muted-note">لا توجد بيانات فاتورة لهذا الطلب</span>}</td><td data-label="الفاتورة والإجراءات">{invoice ? <div className="row-actions"><span className="billing-invoice-number" dir="ltr">{invoice.invoiceNumber}</span><button className="secondary-button billing-action" type="button" onClick={() => handlePrint(order.id)}>طباعة إيصال</button>{canManage && remaining !== null && remaining > 0 && <button className="text-button" type="button" aria-expanded={paymentOrderId === order.id} onClick={() => setPaymentOrderId(paymentOrderId === order.id ? null : order.id)}>تحصيل</button>}</div> : <span className="muted-note">لا يمكن التحصيل دون فاتورة</span>}</td></tr>{paymentOrderId === order.id && invoice && <tr key={`${order.id}-payment`} className="payment-row"><td colSpan={6}><PaymentForm invoice={invoice} onCompleted={loadOrders} onToast={onToast} /></td></tr>}<tr key={`${order.id}-items`} className="order-items-row"><td colSpan={6}><details><summary>كشف العناصر — {order.tests}</summary>{invoice?.items.length ? <ul>{invoice.items.map((line) => <li key={line.id}>{line.description} × {line.quantity} — {money(line.lineTotal, invoice.currency)}</li>)}</ul> : <p>تفاصيل عناصر الفاتورة غير متاحة لهذا الطلب.</p>}</details></td></tr></Fragment> })}</tbody></table></div>}
    <div className="receipt-print-list">{sortedOrders.filter((order) => order.id === printOrderId && order.invoice).map((order) => <ThermalReceipt key={order.id} order={order} />)}</div>
  </section></>
}

export default BillingView

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createInventoryItem,
  createInventoryMovement,
  fetchInventoryItems,
  type InventoryAdjustmentDirection,
  type InventoryItem,
  type InventoryMovementType,
  type NewInventoryItem,
  type NewInventoryMovement,
} from './api'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type InventoryViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type InventoryItemFormState = { sku: string; name: string; category: string; unit: string; reorderLevel: string }
type MovementFormState = { type: InventoryMovementType; quantity: string; reason: string; reference: string; adjustmentDirection: InventoryAdjustmentDirection }

type StatusTone = 'success' | 'warning' | 'neutral'
const EMPTY_ITEM_FORM: InventoryItemFormState = { sku: '', name: '', category: '', unit: '', reorderLevel: '' }
const EMPTY_MOVEMENT_FORM: MovementFormState = { type: 'receipt', quantity: '', reason: '', reference: '', adjustmentDirection: 'increase' }
const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = { receipt: 'استلام', issue: 'صرف', adjustment: 'تسوية' }
const ADJUSTMENT_DIRECTION_LABELS: Record<InventoryAdjustmentDirection, string> = { increase: 'زيادة الرصيد', decrease: 'خفض الرصيد' }
const quantityFormatter = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 })

function formatQuantity(quantity: number) {
  return quantityFormatter.format(quantity)
}

function StockStatus({ item }: { item: InventoryItem }) {
  const isLowStock = item.quantity <= item.reorderLevel
  const tone: StatusTone = isLowStock ? 'warning' : 'success'
  return <div className="inventory-status-list"><span className={`status status-${tone}`}><span className="status-dot" aria-hidden="true" />{isLowStock ? 'مخزون منخفض' : 'ضمن الحد'}</span>{!item.isActive && <span className="status status-neutral">غير نشط</span>}</div>
}

function InventoryCreateForm({ onCreated, onToast }: { onCreated: (item: InventoryItem) => void; onToast: InventoryViewProps['onToast'] }) {
  const [form, setForm] = useState<InventoryItemFormState>(EMPTY_ITEM_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateField = (field: keyof InventoryItemFormState, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const submitItem = async (event: FormEvent) => {
    event.preventDefault()
    const reorderLevel = Number(form.reorderLevel)
    const input: NewInventoryItem = { sku: form.sku.trim(), name: form.name.trim(), category: form.category.trim(), unit: form.unit.trim(), reorderLevel }
    if (!input.sku || !input.name || !input.category || !input.unit || !form.reorderLevel.trim() || !Number.isFinite(reorderLevel) || reorderLevel < 0) { setError('أكمل بيانات العنصر وتأكد أن حد إعادة الطلب رقم غير سالب.'); return }
    setSaving(true); setError('')
    try { onCreated(await createInventoryItem(input)); setForm(EMPTY_ITEM_FORM); onToast('تمت إضافة عنصر المخزون بنجاح') } catch (requestError) { const message = requestError instanceof Error ? requestError.message : 'تعذر إضافة عنصر المخزون.'; setError(message); onToast(message, 'error') } finally { setSaving(false) }
  }
  return <section className="panel inventory-create-panel" aria-labelledby="inventory-create-title"><div className="panel-heading"><div><h2 id="inventory-create-title">إضافة عنصر</h2><p>أضف مادة أو مستلزمًا لمتابعة رصيده.</p></div></div><form className="inventory-form" onSubmit={submitItem} noValidate aria-describedby={error ? 'inventory-item-form-error' : undefined}><div className="inventory-form-grid"><div><label className="form-label" htmlFor="inventory-sku">SKU <span className="required-mark">*</span></label><input id="inventory-sku" className="form-input" value={form.sku} onChange={(event) => updateField('sku', event.target.value)} dir="ltr" required /></div><div><label className="form-label" htmlFor="inventory-name">اسم العنصر <span className="required-mark">*</span></label><input id="inventory-name" className="form-input" value={form.name} onChange={(event) => updateField('name', event.target.value)} required /></div><div><label className="form-label" htmlFor="inventory-category">الفئة <span className="required-mark">*</span></label><input id="inventory-category" className="form-input" value={form.category} onChange={(event) => updateField('category', event.target.value)} required /></div><div><label className="form-label" htmlFor="inventory-unit">الوحدة <span className="required-mark">*</span></label><input id="inventory-unit" className="form-input" value={form.unit} onChange={(event) => updateField('unit', event.target.value)} required /></div><div><label className="form-label" htmlFor="inventory-reorder-level">حد إعادة الطلب <span className="required-mark">*</span></label><input id="inventory-reorder-level" className="form-input" type="number" min="0" step="any" value={form.reorderLevel} onChange={(event) => updateField('reorderLevel', event.target.value)} dir="ltr" required /></div></div>{error && <p id="inventory-item-form-error" className="form-error" role="alert">{error}</p>}<button className="primary-button inventory-submit" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'إضافة العنصر'}</button></form></section>
}

function InventoryMovementForm({ items, selectedItemId, onSelectItem, onMovement, onToast }: { items: InventoryItem[]; selectedItemId: string; onSelectItem: (itemId: string) => void; onMovement: (item: InventoryItem) => void; onToast: InventoryViewProps['onToast'] }) {
  const [form, setForm] = useState<MovementFormState>(EMPTY_MOVEMENT_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateField = (field: keyof MovementFormState, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const submitMovement = async (event: FormEvent) => {
    event.preventDefault()
    const quantity = Number(form.quantity)
    const movement: NewInventoryMovement = { type: form.type, quantity, reason: form.reason.trim(), ...(form.reference.trim() && { reference: form.reference.trim() }), ...(form.type === 'adjustment' && { adjustmentDirection: form.adjustmentDirection }) }
    if (!selectedItemId || !Number.isFinite(quantity) || quantity <= 0 || !movement.reason) { setError('اختر العنصر وأدخل كمية موجبة وسبب الحركة.'); return }
    setSaving(true); setError('')
    try { const response = await createInventoryMovement(selectedItemId, movement); onMovement(response.item); setForm(EMPTY_MOVEMENT_FORM); onToast('تم تسجيل حركة المخزون بنجاح') } catch (requestError) { const message = requestError instanceof Error ? requestError.message : 'تعذر تسجيل حركة المخزون.'; setError(message); onToast(message, 'error') } finally { setSaving(false) }
  }
  return <section className="panel inventory-movement-panel" aria-labelledby="inventory-movement-title"><div className="panel-heading"><div><h2 id="inventory-movement-title">تسجيل حركة</h2><p>حدّث الرصيد باستلام أو صرف أو تسوية.</p></div></div><form className="inventory-form" onSubmit={submitMovement} noValidate aria-describedby={error ? 'inventory-movement-form-error' : undefined}><div className="inventory-form-grid inventory-movement-grid"><div><label className="form-label" htmlFor="inventory-movement-item">العنصر <span className="required-mark">*</span></label><select id="inventory-movement-item" className="form-input" value={selectedItemId} onChange={(event) => onSelectItem(event.target.value)} required><option value="">اختر عنصرًا</option>{items.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.sku}</option>)}</select></div><div><label className="form-label" htmlFor="inventory-movement-type">نوع الحركة <span className="required-mark">*</span></label><select id="inventory-movement-type" className="form-input" value={form.type} onChange={(event) => updateField('type', event.target.value as InventoryMovementType)}>{Object.entries(MOVEMENT_TYPE_LABELS).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select></div><div><label className="form-label" htmlFor="inventory-movement-quantity">الكمية <span className="required-mark">*</span></label><input id="inventory-movement-quantity" className="form-input" type="number" min="0.001" step="any" value={form.quantity} onChange={(event) => updateField('quantity', event.target.value)} dir="ltr" required /></div>{form.type === 'adjustment' && <div><label className="form-label" htmlFor="inventory-adjustment-direction">اتجاه التسوية <span className="required-mark">*</span></label><select id="inventory-adjustment-direction" className="form-input" value={form.adjustmentDirection} onChange={(event) => updateField('adjustmentDirection', event.target.value as InventoryAdjustmentDirection)}>{Object.entries(ADJUSTMENT_DIRECTION_LABELS).map(([direction, label]) => <option value={direction} key={direction}>{label}</option>)}</select></div>}<div><label className="form-label" htmlFor="inventory-movement-reason">سبب الحركة <span className="required-mark">*</span></label><input id="inventory-movement-reason" className="form-input" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} required /></div><div><label className="form-label" htmlFor="inventory-movement-reference">المرجع</label><input id="inventory-movement-reference" className="form-input" value={form.reference} onChange={(event) => updateField('reference', event.target.value)} dir="ltr" /></div></div>{error && <p id="inventory-movement-form-error" className="form-error" role="alert">{error}</p>}<button className="primary-button inventory-submit" type="submit" disabled={saving || items.length === 0}>{saving ? 'جارٍ التسجيل…' : 'تسجيل الحركة'}</button></form></section>
}

function InventoryList({ items, loading, error, activeOnly, onFilterChange, onRetry, onSelectItem }: { items: InventoryItem[]; loading: boolean; error: string; activeOnly: boolean; onFilterChange: (activeOnly: boolean) => void; onRetry: () => void; onSelectItem: (itemId: string) => void }) {
  return <section className="panel inventory-list-panel" aria-labelledby="inventory-list-title"><div className="panel-heading inventory-list-heading"><div><h2 id="inventory-list-title">عناصر المخزون</h2><p>الرصيد الحالي وحد إعادة الطلب لكل عنصر.</p></div><label className="filter-field" htmlFor="inventory-active-filter"><span>عرض العناصر</span><select id="inventory-active-filter" className="form-input" value={String(activeOnly)} onChange={(event) => onFilterChange(event.target.value === 'true')}><option value="true">النشطة فقط</option><option value="false">كل العناصر</option></select></label></div>{loading && <div className="state-card" role="status">جارٍ تحميل عناصر المخزون…</div>}{!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل المخزون</strong><span>{error}</span><button className="secondary-button" type="button" onClick={onRetry}>إعادة المحاولة</button></div>}{!loading && !error && items.length === 0 && <div className="state-card" role="status">لا توجد عناصر مطابقة لهذا الفلتر.</div>}{!loading && !error && items.length > 0 && <div className="inventory-table-wrap"><table className="inventory-table"><caption className="sr-only">قائمة عناصر المخزون</caption><thead><tr><th scope="col">SKU</th><th scope="col">العنصر</th><th scope="col">الفئة</th><th scope="col">الوحدة</th><th scope="col">الرصيد الحالي</th><th scope="col">حد إعادة الطلب</th><th scope="col">الحالة</th><th scope="col"><span className="sr-only">إجراء</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong className="inventory-code" dir="ltr">{item.sku}</strong></td><td><strong>{item.name}</strong></td><td>{item.category}</td><td>{item.unit}</td><td><strong className="inventory-quantity" dir="ltr">{formatQuantity(item.quantity)}</strong></td><td dir="ltr">{formatQuantity(item.reorderLevel)}</td><td><StockStatus item={item} /></td><td><button className="secondary-button row-action-button" type="button" onClick={() => onSelectItem(item.id)}>تسجيل حركة</button></td></tr>)}</tbody></table></div>}</section>
}

function InventoryView({ onBack, onToast }: InventoryViewProps) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [activeOnly, setActiveOnly] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const loadItems = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await fetchInventoryItems(activeOnly)) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل عناصر المخزون.') } finally { setLoading(false) }
  }, [activeOnly])
  useEffect(() => { const timer = window.setTimeout(() => void loadItems(), 0); return () => window.clearTimeout(timer) }, [loadItems])
  const addItem = (item: InventoryItem) => { setItems((current) => [item, ...current.filter((currentItem) => currentItem.id !== item.id)]); setSelectedItemId(item.id) }
  const updateItem = (item: InventoryItem) => setItems((current) => current.map((currentItem) => currentItem.id === item.id ? item : currentItem))
  return <><ViewHeader title="المخزون" description="إدارة العناصر والأرصدة وحركات المخزون." onBack={onBack} /><div className="inventory-layout"><InventoryCreateForm onCreated={addItem} onToast={onToast} /><InventoryMovementForm items={items} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onMovement={updateItem} onToast={onToast} /></div><InventoryList items={items} loading={loading} error={error} activeOnly={activeOnly} onFilterChange={setActiveOnly} onRetry={() => void loadItems()} onSelectItem={setSelectedItemId} /></>
}

export default InventoryView

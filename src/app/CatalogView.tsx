import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createCatalogItem, errorMessage, fetchCatalog, updateCatalogItem, type CatalogItem } from './api'
import { formatCount, formatEgp } from './format'
import { useCan } from './session'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type CatalogViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type StatusFilter = 'all' | 'active' | 'inactive' | 'unpriced'
type CatalogFormState = { code: string; name: string; specimenType: string; price: string; isActive: boolean }
type EditorState = { mode: 'create' } | { mode: 'edit'; item: CatalogItem; activate?: boolean }

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/
const MAX_PRICE = 1_000_000
const EMPTY_FORM: CatalogFormState = { code: '', name: '', specimenType: '', price: '', isActive: true }

function validateForm(form: CatalogFormState, mode: EditorState['mode']): string {
  if (mode === 'create' && !CODE_PATTERN.test(form.code.trim().toUpperCase())) return 'الكود مطلوب: من 2 إلى 64 حرفًا إنجليزيًا كبيرًا أو أرقامًا أو _ أو -، ويبدأ بحرف أو رقم.'
  if (!form.name.trim() || form.name.trim().length > 200) return 'اسم التحليل مطلوب (حتى 200 حرف).'
  if (!form.specimenType.trim() || form.specimenType.trim().length > 100) return 'نوع العينة مطلوب (حتى 100 حرف).'
  const price = Number(form.price)
  if (form.price.trim() === '' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) return 'أدخل سعرًا صحيحًا بين 0 و1,000,000 جنيه.'
  return ''
}

function CatalogEditor({ editor, specimenTypes, onClose, onSaved }: { editor: EditorState; specimenTypes: string[]; onClose: () => void; onSaved: (item: CatalogItem, created: boolean) => void }) {
  const [form, setForm] = useState<CatalogFormState>(() => editor.mode === 'edit'
    ? { code: editor.item.code, name: editor.item.name, specimenType: editor.item.specimenType, price: editor.activate && editor.item.price === 0 ? '' : String(editor.item.price), isActive: editor.activate ? true : editor.item.isActive }
    : EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = editor.mode === 'edit'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const update = <K extends keyof CatalogFormState>(field: K, value: CatalogFormState[K]) => { setForm((current) => ({ ...current, [field]: value })); setError('') }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateForm(form, editor.mode)
    if (validationError) { setError(validationError); return }
    const values = { name: form.name.trim(), specimenType: form.specimenType.trim(), price: Number(form.price), isActive: form.isActive }
    setSaving(true)
    setError('')
    try {
      const item = editor.mode === 'edit'
        ? await updateCatalogItem(editor.item.id, values)
        : await createCatalogItem({ code: form.code.trim().toUpperCase(), ...values })
      onSaved(item, editor.mode === 'create')
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر حفظ التحليل.'))
      setSaving(false)
    }
  }

  const priceIsZero = form.price.trim() !== '' && Number(form.price) === 0

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title" aria-describedby="catalog-editor-description">
      <div className="modal-heading">
        <div>
          <h2 id="catalog-editor-title">{isEdit ? `تعديل ${editor.item.name}` : 'إضافة تحليل'}</h2>
          <p id="catalog-editor-description">{isEdit && editor.activate ? 'حدّد سعر التحليل ثم احفظ لتفعيله وإتاحته في الطلبات.' : 'التحاليل المفعّلة فقط تظهر عند إنشاء طلب جديد.'}</p>
        </div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="إغلاق النافذة">إغلاق</button>
      </div>
      <form onSubmit={submit} noValidate aria-busy={saving}>
        <div className="form-grid">
          <div>
            <label className="form-label" htmlFor="catalog-code">الكود {!isEdit && <span className="required-mark">*</span>}</label>
            <input id="catalog-code" className="form-input" value={form.code} onChange={(event) => update('code', event.target.value.toUpperCase())} dir="ltr" maxLength={64} placeholder="CBC" readOnly={isEdit} aria-readonly={isEdit} aria-describedby="catalog-code-hint" autoFocus={!isEdit} required={!isEdit} />
          </div>
          <div>
            <label className="form-label" htmlFor="catalog-price">السعر (جنيه) <span className="required-mark">*</span></label>
            <input id="catalog-price" className="form-input" type="number" min="0" max={MAX_PRICE} step="0.01" inputMode="decimal" value={form.price} onChange={(event) => update('price', event.target.value)} dir="ltr" placeholder="0.00" autoFocus={isEdit} required />
          </div>
        </div>
        <p className="field-status" id="catalog-code-hint">{isEdit ? 'لا يمكن تغيير الكود بعد الإنشاء.' : 'أحرف إنجليزية كبيرة وأرقام و _ أو - فقط.'}</p>
        <label className="form-label" htmlFor="catalog-name">اسم التحليل <span className="required-mark">*</span></label>
        <input id="catalog-name" className="form-input" value={form.name} onChange={(event) => update('name', event.target.value)} maxLength={200} required />
        <label className="form-label" htmlFor="catalog-specimen">نوع العينة <span className="required-mark">*</span></label>
        <input id="catalog-specimen" className="form-input" value={form.specimenType} onChange={(event) => update('specimenType', event.target.value)} maxLength={100} list="catalog-specimen-types" placeholder="blood" required />
        <datalist id="catalog-specimen-types">{specimenTypes.map((type) => <option value={type} key={type} />)}</datalist>
        <label className="check-option catalog-active-option"><input type="checkbox" checked={form.isActive} onChange={(event) => update('isActive', event.target.checked)} /> مفعّل ويظهر في الطلبات الجديدة</label>
        {form.isActive && priceIsZero && <p className="field-status field-status-warning" role="status">السعر صفر: سيظهر التحليل مجانيًا في الطلبات والفواتير.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>إلغاء</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : isEdit ? 'حفظ التعديلات' : 'إضافة التحليل'}</button>
        </div>
      </form>
    </section>
  </div>
}

function CatalogView({ onBack, onToast }: CatalogViewProps) {
  const can = useCan()
  const canManage = can('catalog.manage')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCatalog(await fetchCatalog())
    } catch (requestError) {
      setError(errorMessage(requestError, 'تعذر تحميل دليل التحاليل.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0)
    return () => window.clearTimeout(timer)
  }, [loadCatalog])

  const counts = useMemo(() => ({
    active: catalog.filter((item) => item.isActive).length,
    unpriced: catalog.filter((item) => item.price === 0).length,
  }), [catalog])
  const specimenTypes = useMemo(() => Array.from(new Set(catalog.map((item) => item.specimenType))).sort(), [catalog])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return catalog.filter((item) => {
      if (statusFilter === 'active' && !item.isActive) return false
      if (statusFilter === 'inactive' && item.isActive) return false
      if (statusFilter === 'unpriced' && item.price !== 0) return false
      return !term || `${item.code} ${item.name} ${item.specimenType}`.toLowerCase().includes(term)
    })
  }, [catalog, search, statusFilter])

  const replaceItem = (item: CatalogItem) => setCatalog((current) => current.some((entry) => entry.id === item.id) ? current.map((entry) => entry.id === item.id ? item : entry) : [...current, item])

  const handleSaved = (item: CatalogItem, created: boolean) => {
    replaceItem(item)
    setEditor(null)
    onToast(created ? `تمت إضافة ${item.name}` : `تم حفظ ${item.name}`)
  }

  const toggleActive = async (item: CatalogItem) => {
    if (!item.isActive && item.price === 0) { setEditor({ mode: 'edit', item, activate: true }); return }
    setBusyId(item.id)
    try {
      const updated = await updateCatalogItem(item.id, { isActive: !item.isActive })
      replaceItem(updated)
      onToast(updated.isActive ? `تم تفعيل ${updated.name}` : `تم إيقاف ${updated.name}`)
    } catch (requestError) {
      onToast(errorMessage(requestError, 'تعذر تحديث حالة التحليل.'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ViewHeader
        title="دليل التحاليل"
        description={canManage ? 'أضف التحاليل وحدّد أسعارها وفعّلها لتظهر في الطلبات.' : 'قائمة التحاليل وأسعارها الحالية.'}
        onBack={onBack}
        action={canManage ? <button className="primary-button" type="button" onClick={() => setEditor({ mode: 'create' })}>إضافة تحليل</button> : undefined}
      />
      {loading && <div className="state-card" role="status">جارٍ تحميل دليل التحاليل…</div>}
      {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الدليل</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadCatalog()}>إعادة المحاولة</button></div>}
      {!loading && !error && catalog.length === 0 && <div className="state-card" role="status">لا توجد تحاليل في الدليل حتى الآن.{canManage && ' ابدأ بإضافة أول تحليل.'}</div>}
      {!loading && !error && catalog.length > 0 && <section className="panel catalog-panel" aria-labelledby="catalog-table-title">
        <div className="patient-toolbar">
          <div>
            <h2 id="catalog-table-title">التحاليل</h2>
            <p>{formatCount(catalog.length)} تحليل · {formatCount(counts.active)} مفعّل · {formatCount(counts.unpriced)} غير مُسعّر</p>
          </div>
          <div className="catalog-filters">
            <label className="search-field"><span className="sr-only">البحث في الدليل</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الكود…" /></label>
            <label className="filter-field" htmlFor="catalog-status-filter"><span>الحالة</span><select id="catalog-status-filter" className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">الكل</option><option value="active">المفعّلة</option><option value="inactive">غير المفعّلة</option><option value="unpriced">غير المُسعّرة</option></select></label>
          </div>
        </div>
        {canManage && counts.active === 0 && <p className="api-notice catalog-notice" role="note">لا توجد تحاليل مفعّلة بعد، لذلك لا يمكن إنشاء طلبات. حدّد سعر كل تحليل ثم فعّله.</p>}
        {visible.length === 0 ? <div className="empty-state" role="status">لا توجد تحاليل مطابقة.</div> : <div className="catalog-table-wrap"><table className="catalog-table">
          <caption className="sr-only">قائمة التحاليل</caption>
          <thead><tr><th scope="col">الكود</th><th scope="col">اسم التحليل</th><th scope="col">نوع العينة</th><th scope="col">السعر</th><th scope="col">الحالة</th>{canManage && <th scope="col"><span className="sr-only">إجراءات</span></th>}</tr></thead>
          <tbody>{visible.map((test) => <tr key={test.id}>
            <td><span className="catalog-code" dir="ltr">{test.code}</span></td>
            <td><strong>{test.name}</strong></td>
            <td>{test.specimenType}</td>
            <td>{test.price === 0 ? <span className="status status-warning"><span className="status-dot" aria-hidden="true" />غير مُسعّر</span> : <span className="catalog-price" dir="ltr">{formatEgp(test.price)}</span>}</td>
            <td><span className={`status ${test.isActive ? 'status-success' : 'status-neutral'}`}><span className="status-dot" aria-hidden="true" />{test.isActive ? 'مفعّل' : 'غير مفعّل'}</span></td>
            {canManage && <td><div className="row-actions">
              <button className={`${test.isActive ? 'secondary-button' : 'primary-button'} row-action-button`} type="button" onClick={() => void toggleActive(test)} disabled={busyId !== null} aria-label={`${test.isActive ? 'إيقاف' : test.price === 0 ? 'تسعير وتفعيل' : 'تفعيل'} ${test.name}`}>{busyId === test.id ? 'جارٍ الحفظ…' : test.isActive ? 'إيقاف' : test.price === 0 ? 'تسعير وتفعيل' : 'تفعيل'}</button>
              <button className="secondary-button row-action-button" type="button" onClick={() => setEditor({ mode: 'edit', item: test })} aria-label={`تعديل ${test.name}`}>تعديل</button>
            </div></td>}
          </tr>)}</tbody>
        </table></div>}
      </section>}
      {editor && <CatalogEditor editor={editor} specimenTypes={specimenTypes} onClose={() => setEditor(null)} onSaved={handleSaved} />}
    </>
  )
}

export default CatalogView

import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog, type CatalogItem } from './api'
import { ViewHeader } from './ViewHeader'

type CatalogViewProps = { onBack: () => void }

const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 2,
})

function CatalogView({ onBack }: CatalogViewProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCatalog(await fetchCatalog())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل دليل التحاليل.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0)
    return () => window.clearTimeout(timer)
  }, [loadCatalog])

  return (
    <>
      <ViewHeader title="دليل التحاليل" description="قائمة الفحوصات المتاحة وأسعارها الحالية." onBack={onBack} />
      {loading && <div className="state-card" role="status">جارٍ تحميل دليل التحاليل…</div>}
      {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الدليل</strong><span>{error}</span><button className="secondary-button" type="button" onClick={() => void loadCatalog()}>إعادة المحاولة</button></div>}
      {!loading && !error && catalog.length === 0 && <div className="state-card" role="status">لا توجد تحاليل مضافة إلى الدليل حتى الآن.</div>}
      {!loading && !error && catalog.length > 0 && <section className="panel catalog-panel" aria-labelledby="catalog-table-title"><div className="panel-heading"><div><h2 id="catalog-table-title">الفحوصات المتاحة</h2><p>{catalog.length} فحصًا في الدليل</p></div></div><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th scope="col">الكود</th><th scope="col">اسم التحليل</th><th scope="col">نوع العينة</th><th scope="col">السعر</th><th scope="col">الحالة</th></tr></thead><tbody>{catalog.map((test) => <tr key={test.id}><td><span className="catalog-code" dir="ltr">{test.code}</span></td><td><strong>{test.name}</strong></td><td>{test.specimenType}</td><td><span className="catalog-price" dir="ltr">{currencyFormatter.format(test.price)}</span></td><td><span className={`status ${test.isActive ? 'status-success' : 'status-warning'}`}><span className="status-dot" aria-hidden="true" />{test.isActive ? 'نشط' : 'غير نشط'}</span></td></tr>)}</tbody></table></div></section>}
    </>
  )
}

export default CatalogView

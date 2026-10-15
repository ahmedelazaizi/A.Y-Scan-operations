import { Icon } from './Icon'
import type { CSSProperties } from 'react'
import type { Dashboard } from './api'

type DashboardViewProps = {
  displayName: string
  dashboard: Dashboard | null
  loading: boolean
  error: string
  canCreateOrder: boolean
  onRetry: () => void
  onNewOrder: () => void
}

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short' })

function greeting(date = new Date()): string {
  return date.getHours() < 12 ? 'صباح الخير' : 'مساء الخير'
}

function formatToday(date = new Date()): string {
  return dateFormatter.format(date)
}

function formatOrderTime(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : timeFormatter.format(parsed)
}

/** Cumulative stop positions (percent) for the three sample segments; an all-zero day renders as an empty ring. */
function donutStyle(samples: Dashboard['samples']): CSSProperties {
  const total = samples.inProgress + samples.completed + samples.needsAttention
  const pct = (value: number) => (total === 0 ? 0 : (value / total) * 100)
  const a = pct(samples.inProgress)
  const b = a + pct(samples.completed)
  const c = b + pct(samples.needsAttention)
  return { '--donut-a': `${a}%`, '--donut-b': `${b}%`, '--donut-c': `${c}%` } as CSSProperties
}

function StatusBadge({ state, tone }: { state: string; tone: string }) {
  return <span className={`status status-${tone}`}><span className="status-dot" aria-hidden="true" />{state}</span>
}

export default function DashboardView({ displayName, dashboard, loading, error, canCreateOrder, onRetry, onNewOrder }: DashboardViewProps) {
  return <div className="content-wrap">
    <section className="welcome-row" aria-labelledby="dashboard-title">
      <div>
        <h1 id="dashboard-title">{greeting()}، {displayName} <span className="wave" aria-hidden="true">✦</span></h1>
        <p>{formatToday()} · ملخص أداء المركز لهذا اليوم.</p>
      </div>
      {canCreateOrder && <button className="primary-button" type="button" onClick={onNewOrder}><Icon name="plus" size={18} />طلب تحليل جديد</button>}
    </section>
    {loading && !dashboard && <div className="state-card" role="status">جارٍ تحميل بيانات لوحة التحكم…</div>}
    {error && <div className="api-notice api-notice-error" role="alert">
      <Icon name="alert" size={16} />
      <span>{error}</span>
      <button className="text-button" type="button" onClick={onRetry}><Icon name="refresh" size={14} />إعادة المحاولة</button>
    </div>}
    {dashboard && <>
      <section className="metrics-grid" aria-label="مؤشرات اليوم">
        {dashboard.metrics.map((metric) => <article className={`metric-card metric-${metric.tone}`} key={metric.label}>
          <div className="metric-icon"><Icon name={metric.icon} size={21} /></div>
          <div className="metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></div>
        </article>)}
      </section>
      <div className="dashboard-grid">
        <section className="panel orders-panel" aria-labelledby="orders-title">
          <div className="panel-heading">
            <div><h2 id="orders-title">آخر طلبات التحاليل</h2><p>أحدث الطلبات المسجلة في المركز</p></div>
            <button className="icon-button subtle" type="button" aria-label="تحديث لوحة التحكم" onClick={onRetry} disabled={loading}><Icon name="refresh" size={17} /></button>
          </div>
          <div className="orders-table-wrap">
            {dashboard.recentOrders.length === 0
              ? <div className="empty-state">لا توجد طلبات بعد.</div>
              : <table>
                <thead><tr><th scope="col">رقم الطلب</th><th scope="col">المريض</th><th scope="col">الفحوصات</th><th scope="col">الوقت</th><th scope="col">الحالة</th></tr></thead>
                <tbody>{dashboard.recentOrders.map((order) => <tr key={order.id}>
                  <td><span className="order-id" dir="ltr">{order.id}</span></td>
                  <td><strong>{order.patient}</strong></td>
                  <td><span className="test-name">{order.tests}</span></td>
                  <td><span className="muted-with-icon"><Icon name="clock" size={14} />{formatOrderTime(order.time)}</span></td>
                  <td><StatusBadge state={order.state} tone={order.tone} /></td>
                </tr>)}</tbody>
              </table>}
          </div>
        </section>
        <section className="panel samples-panel" aria-labelledby="samples-title">
          <div className="panel-heading"><div><h2 id="samples-title">حالة عينات اليوم</h2><p>توزيع العينات المسجلة اليوم</p></div></div>
          <div className="sample-summary">
            <div className="donut" style={donutStyle(dashboard.samples)} role="img" aria-label={`نسبة العينات المكتملة ${dashboard.samples.completionRate} بالمئة`}><span>{dashboard.samples.completionRate}<small>%</small></span></div>
            <div className="sample-total"><strong>{dashboard.samples.total}</strong><span>إجمالي العينات</span></div>
          </div>
          <div className="legend">
            <div><span className="legend-mark mark-cyan" /><span>قيد الفحص</span><strong>{dashboard.samples.inProgress}</strong></div>
            <div><span className="legend-mark mark-lime" /><span>مكتملة</span><strong>{dashboard.samples.completed}</strong></div>
            <div><span className="legend-mark mark-orange" /><span>تحتاج متابعة</span><strong>{dashboard.samples.needsAttention}</strong></div>
          </div>
        </section>
      </div>
    </>}
  </div>
}

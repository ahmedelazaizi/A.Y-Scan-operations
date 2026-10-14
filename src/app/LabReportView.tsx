import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { createPortal } from 'react-dom'
import { verifyLabReport, type PublicReportVerification, type ReportRelease } from './api'
import './report.css'

type Snapshot = Record<string, unknown>
const RESULT_FLAG_LABELS: Record<string, string> = { normal: 'طبيعي', low: 'منخفض', high: 'مرتفع', critical: 'حرج', not_applicable: 'غير منطبق' }
const record = (value: unknown): Snapshot => value && typeof value === 'object' ? value as Snapshot : {}
const text = (value: unknown, fallback = '—') => typeof value === 'string' || typeof value === 'number' ? String(value) : fallback

function safeStatic(path: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return null
  try {
    const url = new URL(path, window.location.origin)
    return url.origin === window.location.origin && url.pathname.startsWith('/') && !url.pathname.startsWith('//') ? `${url.pathname}${url.search}` : null
  } catch { return null }
}

export function LabReportView({ release, onClose }: { release: ReportRelease; onClose: () => void }) {
  const [qr, setQr] = useState('')
  const settings = release.settingsSnapshot
  const content = release.contentSnapshot
  const patient = record(content.patient)
  const signer = record(content.issuedBy)
  const items = Array.isArray(content.items) ? content.items.map(record) : []

  useEffect(() => {
    let active = true
    void QRCode.toDataURL(`${window.location.origin}/report-verification/${encodeURIComponent(release.verificationToken)}`, { width: 120, margin: 1 }).then(value => { if (active) setQr(value) })
    return () => { active = false }
  }, [release.verificationToken])

  const renderAsset = (path: unknown, label: string) => {
    const src = safeStatic(path)
    return src ? <img src={src} alt={label} /> : <div className="report-sign-line">{label}</div>
  }
  const rangeText = (range: unknown, fallback: unknown) => {
    const snapshot = record(range)
    if (snapshot.resultType === 'numeric') return `${text(snapshot.low)} – ${text(snapshot.high)}`
    return text(snapshot.normalText ?? snapshot.textValue ?? fallback)
  }

  return createPortal(<div className="report-overlay">
    <div className="report-actions"><button className="secondary-button" onClick={() => window.print()}>طباعة التقرير</button><button className="secondary-button" onClick={onClose}>عودة</button></div>
    <article className="lab-report" dir="rtl">
      <header className="report-brand"><div>{renderAsset(settings.logoPath, 'شعار المختبر')}<div><h1>{text(settings.nameAr, 'مختبر التحاليل')}</h1><h2 dir="ltr">{text(settings.nameEn, 'Laboratory')}</h2></div></div><div>{typeof settings.licenseNumber==='string'&&<span>الترخيص: {settings.licenseNumber}</span>}{typeof settings.phone==='string'&&<span dir="ltr">{settings.phone}</span>}{typeof settings.addressAr==='string'&&<span>{settings.addressAr}</span>}{typeof settings.addressEn==='string'&&<span dir="ltr">{settings.addressEn}</span>}</div></header>
      <h2 className="report-title">تقرير نتائج المختبر <small>LABORATORY REPORT</small></h2>
      <section className="report-patient"><div><b>المريض</b><span>{text(patient.name)}</span></div><div><b>رقم الطلب</b><span dir="ltr">{text(content.publicOrderNumber, release.orderId)}</span></div><div><b>تاريخ الميلاد / النوع / العمر المحفوظ</b><span>{text(patient.dateOfBirth)} / {text(patient.sex)} / {text(patient.age)}</span></div><div><b>الطبيب</b><span>{text(content.practitioner)}</span></div></section>
      <table className="report-table"><thead><tr><th>الفحص / المؤشر</th><th>النتيجة</th><th>الوحدة</th><th>المدى المحفوظ المعتمد</th><th>التصنيف</th><th>الإدخال / المراجعة</th></tr></thead><tbody>{items.map((row,index)=><tr key={index}><td>{text(row.test)}<small>{text(row.parameter,'')}</small></td><td dir="ltr">{text(row.value)}</td><td dir="ltr">{text(row.unit)}</td><td>{rangeText(row.approvedRange,row.referenceRange)}</td><td>{RESULT_FLAG_LABELS[text(row.flag, '')] ?? 'غير منطبق'}</td><td>{text(row.enteredBy)} / {text(row.reviewedBy)}</td></tr>)}</tbody></table>
      <footer className="report-footer"><p>{text(settings.reportFooterAr,'')}</p><p dir="ltr">{text(settings.reportFooterEn,'')}</p><div className="report-signatures"><div>{renderAsset(settings.signaturePath,`توقيع: ${text(signer.name,'المعتمد')}`)}</div><div>{renderAsset(settings.sealPath,'ختم المختبر')}</div><div><b>اعتماد التقرير</b><span>{text(signer.name)}</span></div></div><div className="report-integrity"><span>الإصدار {release.version} · {new Date(release.releasedAt).toLocaleString('ar-EG')}</span>{qr&&<img src={qr} alt="رمز التحقق العام"/>}</div></footer>
    </article>
  </div>, document.body)
}

export function PublicReportVerification({ token }: { token: string }) {
  const [state, setState] = useState<{ loading: boolean; error: string; result?: PublicReportVerification }>({ loading: true, error: '' })
  useEffect(() => {
    let active = true
    void verifyLabReport(token).then(result => { if (active) setState({ loading: false, error: '', result }) }).catch(error => { if (active) setState({ loading: false, error: error instanceof Error ? error.message : 'تعذر التحقق.' }) })
    return () => { active = false }
  }, [token])
  const identity = record(state.result?.labIdentity)
  return <main className="verify-page"><section className="panel"><h1>التحقق من التقرير</h1>{state.loading&&<p>جارٍ التحقق…</p>}{state.error&&<p role="alert">تعذر التحقق من التقرير.</p>}{state.result&&<><strong>{state.result.authentic?'تقرير أصلي':'تعذر إثبات أصالة التقرير'}</strong><p>الإصدار: {state.result.version}</p><p>تاريخ الإصدار: {new Date(state.result.issuedAt).toLocaleString('ar-EG')}</p><p>{[identity.nameAr,identity.nameEn,identity.licenseNumber].filter((value): value is string=>typeof value==='string').join(' · ')}</p></>}</section></main>
}

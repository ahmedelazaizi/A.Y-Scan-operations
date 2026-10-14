import { useState } from 'react'
import { activateLicense, type LicenseStatus } from './api'

export default function TrialActivationView({ status, isAdmin, onActivated, onLogout }: { status: LicenseStatus; isAdmin: boolean; onActivated: (value: LicenseStatus) => void; onLogout: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copyId = async () => { await navigator.clipboard.writeText(status.installationId) }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true)
    try { onActivated(await activateLicense(code.trim())) } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر التحقق من رمز التفعيل.') } finally { setBusy(false) }
  }
  return <main className="trial-gate" dir="rtl"><section className="panel trial-card" aria-labelledby="trial-title">
    <h1 id="trial-title">تفعيل نسخة التجربة</h1><p>أدخل رمز التفعيل الموقّع لفتح إدخال البيانات على هذا التثبيت.</p>
    <label className="form-label" htmlFor="installation-id">معرّف التثبيت</label><div className="trial-id-row"><input id="installation-id" className="form-input" value={status.installationId} readOnly dir="ltr" /><button className="secondary-button" type="button" onClick={() => void copyId()}>نسخ</button></div>
    {!isAdmin ? <><p role="status" className="api-notice">هذه النسخة تحتاج إلى تفعيل. أرسل معرّف التثبيت إلى مدير النظام ليُصدر رمز التفعيل.</p><button className="secondary-button" type="button" onClick={onLogout}>تسجيل الخروج</button></> : <form onSubmit={(event) => void submit(event)}><label className="form-label" htmlFor="activation-code">رمز التفعيل</label><textarea id="activation-code" className="form-input" required value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || !code.trim()}>{busy ? 'جارٍ التحقق…' : 'تفعيل النسخة'}</button></form>}
  </section></main>
}

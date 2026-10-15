import { useRef, useState, type FormEvent } from 'react'
import { activateLicense, errorMessage, type LicenseStatus } from './api'

type ActivationPanelProps = { status: LicenseStatus; isAdmin: boolean; onActivated: (license: LicenseStatus) => void }

export default function TrialActivationView({ status, isAdmin, onActivated }: ActivationPanelProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const deviceIdInput = useRef<HTMLTextAreaElement>(null)
  const submitting = useRef(false)

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(status.installationId)
      setCopyNotice('تم نسخ معرّف جهاز الخادم.')
    } catch {
      deviceIdInput.current?.focus()
      deviceIdInput.current?.select()
      setCopyNotice('تعذر النسخ التلقائي. تم تحديد المعرّف؛ انسخه يدويًا باستخدام Ctrl+C أو قائمة النسخ.')
    }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || !isAdmin || !code.trim()) return
    submitting.current = true
    setError(''); setSuccess(''); setBusy(true)
    try {
      const activated = await activateLicense(code.trim())
      onActivated(activated)
      setCode('')
      setSuccess('تم تفعيل النسخة الكاملة. إنشاء السجلات متاح بلا حد.')
    } catch (cause) {
      setError(errorMessage(cause, 'تعذر تفعيل النظام. تحقق من الرمز واتصال الخادم ثم أعد المحاولة.'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <section className="panel phase1-form" dir="rtl" aria-labelledby="activation-title">
    <div className="panel-heading"><div><h2 id="activation-title">تفعيل النظام</h2><p>حالة الترخيص مرتبطة بجهاز الخادم، وليست بجهاز المتصفح.</p></div></div>
    {status.edition === 'trial' ? <>
      <p role="status">تجربة مجانية · المستخدم {status.recordsUsed} من {status.recordLimit} · المتبقي {status.recordsRemaining}</p>
      <p>الحصة 50 عملية إنشاء سجل أساسي إجمالًا لكل المستخدمين، بلا انتهاء زمني. التعديلات لا تستهلك الحصة.</p>
      {status.status === 'limit_reached' && <p className="api-notice">نفدت حصة التجربة. تبقى الإعدادات وعرض السجلات وتحديثها متاحة؛ فعّل النسخة الكاملة لإنشاء سجلات جديدة بلا حد.</p>}
    </> : <p role="status">{status.edition === 'full' ? 'النسخة الكاملة مفعّلة — إنشاء السجلات بلا حد.' : 'الإصدار السابق غير محدود — لا يحتاج إلى تفعيل.'}</p>}
    <label className="form-label" htmlFor="installation-id">معرّف جهاز الخادم</label>
    <textarea id="installation-id" ref={deviceIdInput} className="form-input phase1-textarea" value={status.installationId} readOnly dir="ltr" rows={2} spellCheck={false} aria-describedby="device-copy-notice" />
    <button className="secondary-button" type="button" onClick={() => void copyId()}>نسخ معرّف الجهاز</button>
    <p id="device-copy-notice" role="status" aria-live="polite">{copyNotice}</p>
    {!isAdmin && status.edition === 'trial' && <p>لتفعيل النسخة الكاملة، أرسل المعرّف إلى مدير النظام. التفعيل متاح لمدير النظام فقط.</p>}
    {isAdmin && status.edition === 'trial' && <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label className="form-label" htmlFor="activation-code">رمز تفعيل النسخة الكاملة</label>
      <p id="activation-help">أرسل معرّف الجهاز إلى المطوّر ثم الصق الرمز الموقّع كاملًا هنا.</p>
      <textarea id="activation-code" className="form-input phase1-textarea" required value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" dir="ltr" rows={5} spellCheck={false} disabled={busy} aria-describedby="activation-help" aria-invalid={!!error} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy || !code.trim()}>{busy ? 'جارٍ التفعيل…' : 'تفعيل النسخة الكاملة'}</button>
    </form>}
    {success && <p role="status" aria-live="polite">{success}</p>}
  </section>
}

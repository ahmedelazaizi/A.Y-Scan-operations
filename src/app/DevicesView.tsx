import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { checkDeviceConnection, createDevice, fetchDevices, type DeviceProtocol, type DeviceStatus, type LabDevice, type NewDevice } from './api'
import { ViewHeader } from './ViewHeader'

type DevicesViewProps = { onBack: () => void; onToast: (message: string, tone?: 'success' | 'error') => void }
type DeviceFormState = { name: string; manufacturer: string; model: string; protocol: DeviceProtocol; endpoint: string; status: DeviceStatus; isActive: boolean }

const INITIAL_FORM: DeviceFormState = { name: '', manufacturer: '', model: '', protocol: 'hl7', endpoint: '', status: 'unknown', isActive: true }
const PROTOCOL_LABELS: Record<DeviceProtocol, string> = { hl7: 'HL7', astm: 'ASTM', tcp_ip: 'TCP/IP', serial: 'Serial' }
const STATUS_LABELS: Record<DeviceStatus, string> = { configured: 'Configured', online: 'Online', offline: 'Offline', unknown: 'Unknown' }
const STATUS_TONES: Record<DeviceStatus, string> = { configured: 'info', online: 'success', offline: 'danger', unknown: 'neutral' }

function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return <span className={`status status-${STATUS_TONES[status]}`}><span className="status-dot" aria-hidden="true" />{STATUS_LABELS[status]}</span>
}

function deviceError(error: unknown): string {
  return error instanceof Error ? error.message : 'تعذر إتمام العملية.'
}

export default function DevicesView({ onBack, onToast }: DevicesViewProps) {
  const [devices, setDevices] = useState<LabDevice[]>([])
  const [form, setForm] = useState<DeviceFormState>(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [checkMessages, setCheckMessages] = useState<Record<string, string>>({})

  const loadDevices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDevices(await fetchDevices(false))
    } catch (requestError) {
      setError(deviceError(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadDevices() }, [loadDevices])

  const updateForm = <K extends keyof DeviceFormState>(key: K, value: DeviceFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.endpoint.trim()) {
      setError('اسم الجهاز وendpoint مطلوبان.')
      return
    }
    setSaving(true)
    setError('')
    const payload: NewDevice = {
      name: form.name.trim(),
      protocol: form.protocol,
      endpoint: form.endpoint.trim(),
      status: form.status,
      isActive: form.isActive,
      ...(form.manufacturer.trim() ? { manufacturer: form.manufacturer.trim() } : {}),
      ...(form.model.trim() ? { model: form.model.trim() } : {}),
    }
    try {
      const device = await createDevice(payload)
      setDevices((current) => [device, ...current])
      setForm(INITIAL_FORM)
      onToast('تم تسجيل الجهاز بنجاح.')
    } catch (requestError) {
      setError(deviceError(requestError))
    } finally {
      setSaving(false)
    }
  }

  const runCheck = async (device: LabDevice) => {
    setBusyDeviceId(device.id)
    setError('')
    try {
      const result = await checkDeviceConnection(device.id)
      setDevices((current) => current.map((candidate) => candidate.id === result.device.id ? result.device : candidate))
      setCheckMessages((current) => ({ ...current, [device.id]: result.message }))
    } catch (requestError) {
      setCheckMessages((current) => ({ ...current, [device.id]: deviceError(requestError) }))
    } finally {
      setBusyDeviceId(null)
    }
  }

  return <div dir="rtl" className="devices-view">
    <ViewHeader title="سجل الأجهزة" description="سجّل أجهزة المختبر وبروتوكولها وحالتها. لا يُنفّذ هذا المسار أي اتصال فعلي بالجهاز." onBack={onBack} />
    <div className="devices-layout">
      <section className="panel devices-create-panel" aria-labelledby="device-create-title">
        <div className="panel-heading"><div><h2 id="device-create-title">تسجيل جهاز</h2><p>أدخل endpoint آمنًا بلا username أو password.</p></div></div>
        <form className="devices-form" onSubmit={submit} noValidate>
          <div className="devices-form-grid">
            <div><label className="form-label" htmlFor="device-name">اسم الجهاز <span className="required-mark">*</span></label><input id="device-name" className="form-input" value={form.name} onChange={(event) => updateForm('name', event.target.value)} maxLength={200} /></div>
            <div><label className="form-label" htmlFor="device-protocol">البروتوكول</label><select id="device-protocol" className="form-input" value={form.protocol} onChange={(event) => updateForm('protocol', event.target.value as DeviceProtocol)}>{Object.entries(PROTOCOL_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div><label className="form-label" htmlFor="device-manufacturer">الشركة <span className="optional-label">اختياري</span></label><input id="device-manufacturer" className="form-input" value={form.manufacturer} onChange={(event) => updateForm('manufacturer', event.target.value)} maxLength={200} /></div>
            <div><label className="form-label" htmlFor="device-model">الموديل <span className="optional-label">اختياري</span></label><input id="device-model" className="form-input" value={form.model} onChange={(event) => updateForm('model', event.target.value)} maxLength={200} /></div>
            <div className="devices-field-full"><label className="form-label" htmlFor="device-endpoint">Endpoint <span className="required-mark">*</span></label><input id="device-endpoint" className="form-input" dir="ltr" value={form.endpoint} onChange={(event) => updateForm('endpoint', event.target.value)} maxLength={300} placeholder="host:port أو COM3 أو /dev/ttyUSB0" /><p className="form-note">لا تُدخل credentials أو عنوانًا يحتوي على `@`. لن تُفتح socket أو serial connection من هذا المسار.</p></div>
            <div><label className="form-label" htmlFor="device-status">الحالة المسجلة</label><select id="device-status" className="form-input" value={form.status} onChange={(event) => updateForm('status', event.target.value as DeviceStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <label className="device-active-option"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} /> <span>الجهاز نشط</span></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button devices-submit" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'تسجيل الجهاز'}</button>
        </form>
      </section>
      <section className="panel devices-list-panel" aria-labelledby="device-list-title">
        <div className="panel-heading devices-list-heading"><div><h2 id="device-list-title">الأجهزة المسجلة</h2><p>الحالة المعروضة هي الحالة المخزنة؛ check لا يدّعي اتصالًا فعليًا.</p></div><button className="secondary-button" type="button" onClick={() => void loadDevices()} disabled={loading}>تحديث</button></div>
        {loading ? <div className="state-card" role="status">جارٍ تحميل الأجهزة…</div> : devices.length === 0 ? <div className="empty-state">لا توجد أجهزة مسجلة بعد.</div> : <div className="devices-table-wrap"><table className="devices-table"><thead><tr><th scope="col">الجهاز</th><th scope="col">البروتوكول</th><th scope="col">Endpoint</th><th scope="col">الحالة</th><th scope="col">إجراء</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td data-label="الجهاز"><strong>{device.name}</strong><span className="table-subtext">{[device.manufacturer, device.model].filter(Boolean).join(' · ') || 'دون بيانات تصنيع'}</span></td><td data-label="البروتوكول"><span className="device-protocol">{PROTOCOL_LABELS[device.protocol]}</span></td><td data-label="Endpoint"><code className="device-endpoint" dir="ltr">{device.endpoint}</code></td><td data-label="الحالة"><DeviceStatusBadge status={device.status} /></td><td data-label="إجراء"><button className="secondary-button row-action-button" type="button" onClick={() => void runCheck(device)} disabled={busyDeviceId === device.id}>{busyDeviceId === device.id ? 'جارٍ الفحص…' : 'Check connection'}</button>{checkMessages[device.id] && <span className="device-check-message" role="status">{checkMessages[device.id]}</span>}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </div>
}

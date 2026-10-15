import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createInsuranceClaim,
  createInsurancePolicy,
  fetchInsuranceClaims,
  fetchInsurancePolicies,
  transitionInsuranceClaim,
  type InsuranceClaim,
  type InsuranceClaimStatus,
  type InsurancePolicy,
  type InsurancePolicyStatus,
  type NewInsurancePolicy,
} from './api'
import { useCan } from './session'
import { ViewHeader } from './ViewHeader'

type ToastTone = 'success' | 'error'
type InsuranceViewProps = { onBack: () => void; onToast: (message: string, tone?: ToastTone) => void }
type ClaimFilter = InsuranceClaimStatus | 'all'
type PolicyDraft = { patientId: string; payerName: string; memberNumber: string; planName: string; coveragePercent: string; validFrom: string; validTo: string }
type ClaimDraft = { policyId: string; orderId: string; amount: string }
type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const EMPTY_POLICY_DRAFT: PolicyDraft = { patientId: '', payerName: '', memberNumber: '', planName: '', coveragePercent: '', validFrom: '', validTo: '' }
const EMPTY_CLAIM_DRAFT: ClaimDraft = { policyId: '', orderId: '', amount: '' }
const POLICY_STATUS_LABELS: Record<InsurancePolicyStatus, string> = { active: 'سارية', expired: 'منتهية', suspended: 'موقوفة' }
const POLICY_STATUS_TONES: Record<InsurancePolicyStatus, StatusTone> = { active: 'success', expired: 'danger', suspended: 'warning' }
const CLAIM_STATUS_LABELS: Record<InsuranceClaimStatus, string> = { draft: 'مسودة', submitted: 'مرسلة', approved: 'معتمدة', rejected: 'مرفوضة', paid: 'مدفوعة' }
const CLAIM_STATUS_TONES: Record<InsuranceClaimStatus, StatusTone> = { draft: 'neutral', submitted: 'info', approved: 'success', rejected: 'danger', paid: 'success' }
const CLAIM_FILTER_OPTIONS: Array<{ value: ClaimFilter; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'draft', label: CLAIM_STATUS_LABELS.draft },
  { value: 'submitted', label: CLAIM_STATUS_LABELS.submitted },
  { value: 'approved', label: CLAIM_STATUS_LABELS.approved },
  { value: 'rejected', label: CLAIM_STATUS_LABELS.rejected },
  { value: 'paid', label: CLAIM_STATUS_LABELS.paid },
]
const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })
const moneyFormatter = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 })

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatDate(value: string | null) {
  if (!value) return 'غير محدد'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? 'غير محدد' : dateFormatter.format(date)
}

function formatMoney(value: number) {
  return moneyFormatter.format(value)
}

function StatusBadge({ status, labels, tones }: { status: InsurancePolicyStatus | InsuranceClaimStatus; labels: Record<string, string>; tones: Record<string, StatusTone> }) {
  return <span className={`status status-${tones[status]}`}><span className="status-dot" aria-hidden="true" />{labels[status]}</span>
}

function CreatePolicyPanel({ onCreated, onToast }: { onCreated: () => Promise<void>; onToast: InsuranceViewProps['onToast'] }) {
  const [draft, setDraft] = useState<PolicyDraft>(EMPTY_POLICY_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateDraft = (field: keyof PolicyDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const coveragePercent = Number(draft.coveragePercent)
    if (!draft.patientId.trim() || !draft.payerName.trim() || !draft.memberNumber.trim() || !draft.planName.trim() || !draft.validFrom) {
      setError('أكمل حقول المريض والجهة ورقم العضوية والخطة وتاريخ البداية.')
      return
    }
    if (!Number.isFinite(coveragePercent) || coveragePercent < 0 || coveragePercent > 100) {
      setError('أدخل نسبة تغطية بين 0 و100.')
      return
    }
    if (draft.validTo && draft.validTo < draft.validFrom) {
      setError('يجب ألا يسبق تاريخ نهاية التغطية تاريخ البداية.')
      return
    }
    const policy: NewInsurancePolicy = {
      patientId: draft.patientId.trim(),
      payerName: draft.payerName.trim(),
      memberNumber: draft.memberNumber.trim(),
      planName: draft.planName.trim(),
      coveragePercent,
      validFrom: draft.validFrom,
      ...(draft.validTo ? { validTo: draft.validTo } : {}),
    }
    setSaving(true)
    setError('')
    try {
      await createInsurancePolicy(policy)
      setDraft(EMPTY_POLICY_DRAFT)
      await onCreated()
      onToast('تمت إضافة وثيقة التأمين بنجاح')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'تعذر حفظ وثيقة التأمين.'))
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel insurance-create-panel" aria-labelledby="create-policy-title">
    <div className="panel-heading"><div><h2 id="create-policy-title">إضافة وثيقة تأمين</h2><p>اربط الوثيقة بسجل مريض موجود. لا تستخدم بيانات حقيقية.</p></div></div>
    <form className="insurance-form" onSubmit={submit} noValidate aria-describedby={error ? 'policy-form-error' : 'policy-form-note'}>
      <p id="policy-form-note" className="form-note">يقبل الخادم `patientId` بصيغة UUID.</p>
      <label className="form-label" htmlFor="insurance-patient-id">معرّف المريض <span className="required-mark">*</span></label>
      <input id="insurance-patient-id" className="form-input" value={draft.patientId} onChange={(event) => updateDraft('patientId', event.target.value)} placeholder="UUID المريض" dir="ltr" required />
      <div className="insurance-form-grid">
        <div><label className="form-label" htmlFor="insurance-payer">شركة التأمين <span className="required-mark">*</span></label><input id="insurance-payer" className="form-input" value={draft.payerName} onChange={(event) => updateDraft('payerName', event.target.value)} placeholder="اسم الجهة" required /></div>
        <div><label className="form-label" htmlFor="insurance-member">رقم العضوية <span className="required-mark">*</span></label><input id="insurance-member" className="form-input" value={draft.memberNumber} onChange={(event) => updateDraft('memberNumber', event.target.value)} placeholder="رقم تجريبي" dir="ltr" required /></div>
        <div className="insurance-field-full"><label className="form-label" htmlFor="insurance-plan">اسم الخطة <span className="required-mark">*</span></label><input id="insurance-plan" className="form-input" value={draft.planName} onChange={(event) => updateDraft('planName', event.target.value)} placeholder="الخطة الأساسية" required /></div>
        <div><label className="form-label" htmlFor="insurance-coverage">نسبة التغطية (%) <span className="required-mark">*</span></label><input id="insurance-coverage" className="form-input" type="number" min="0" max="100" step="0.01" value={draft.coveragePercent} onChange={(event) => updateDraft('coveragePercent', event.target.value)} placeholder="80" dir="ltr" required /></div>
        <div><label className="form-label" htmlFor="insurance-valid-from">صالحة من <span className="required-mark">*</span></label><input id="insurance-valid-from" className="form-input" type="date" value={draft.validFrom} onChange={(event) => updateDraft('validFrom', event.target.value)} required /></div>
        <div className="insurance-field-full"><label className="form-label" htmlFor="insurance-valid-to">صالحة حتى <span className="optional-label">اختياري</span></label><input id="insurance-valid-to" className="form-input" type="date" value={draft.validTo} onChange={(event) => updateDraft('validTo', event.target.value)} /></div>
      </div>
      {error && <p id="policy-form-error" className="form-error" role="alert">{error}</p>}
      <button className="primary-button insurance-submit" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الوثيقة'}</button>
    </form>
  </section>
}

function CreateClaimPanel({ policies, onCreated, onToast }: { policies: InsurancePolicy[]; onCreated: () => Promise<void>; onToast: InsuranceViewProps['onToast'] }) {
  const [draft, setDraft] = useState<ClaimDraft>(EMPTY_CLAIM_DRAFT)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const updateDraft = (field: keyof ClaimDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const selectedPolicyId = draft.policyId && policies.some((policy) => policy.id === draft.policyId)
    ? draft.policyId
    : policies[0]?.id ?? ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(draft.amount)
    const orderId = draft.orderId.trim().toUpperCase()
    if (!selectedPolicyId) { setError('حمّل وثيقة واحدة على الأقل ثم اخترها للمطالبة.'); return }
    if (!Number.isFinite(amount) || amount < 0) { setError('أدخل مبلغ مطالبة صحيحًا غير سالب.'); return }
    if (orderId && !/^AY-\d+$/.test(orderId)) { setError('رقم الطلب الاختياري يجب أن يكون بصيغة AY-12345.'); return }
    setSaving(true)
    setError('')
    try {
      await createInsuranceClaim({ policyId: selectedPolicyId, amount, ...(orderId ? { orderId } : {}) })
      setDraft((current) => ({ ...EMPTY_CLAIM_DRAFT, policyId: current.policyId || selectedPolicyId }))
      await onCreated()
      onToast('تم إنشاء المطالبة التأمينية')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'تعذر إنشاء المطالبة التأمينية.'))
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel insurance-claim-create-panel" aria-labelledby="create-claim-title">
    <div className="panel-heading"><div><h2 id="create-claim-title">مطالبة جديدة</h2><p>اختر وثيقة محمّلة، وأضف رقم طلب `AY-*` عند الحاجة.</p></div></div>
    <form className="insurance-claim-form" onSubmit={submit} noValidate aria-describedby={error ? 'claim-form-error' : undefined}>
      <div><label className="form-label" htmlFor="claim-policy">وثيقة التأمين <span className="required-mark">*</span></label><select id="claim-policy" className="form-input" value={selectedPolicyId} onChange={(event) => updateDraft('policyId', event.target.value)} disabled={policies.length === 0} required><option value="">{policies.length ? 'اختر الوثيقة' : 'لا توجد وثائق محمّلة'}</option>{policies.map((policy) => <option value={policy.id} key={policy.id}>{policy.payerName} · {policy.memberNumber}</option>)}</select></div>
      <div><label className="form-label" htmlFor="claim-order">رقم الطلب <span className="optional-label">اختياري</span></label><input id="claim-order" className="form-input" value={draft.orderId} onChange={(event) => updateDraft('orderId', event.target.value)} placeholder="AY-10482" dir="ltr" /></div>
      <div><label className="form-label" htmlFor="claim-amount">المبلغ <span className="required-mark">*</span></label><input id="claim-amount" className="form-input" type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => updateDraft('amount', event.target.value)} placeholder="0.00" dir="ltr" required /></div>
      {error && <p id="claim-form-error" className="form-error" role="alert">{error}</p>}
      <button className="primary-button row-action-button insurance-claim-submit" type="submit" disabled={saving || policies.length === 0}>{saving ? 'جارٍ الإنشاء…' : 'إنشاء المطالبة'}</button>
    </form>
  </section>
}

function PolicyList({ canAdd, policies, loading, error, patientFilter, onPatientFilterChange, onApply, onClear, onRetry }: { canAdd: boolean; policies: InsurancePolicy[]; loading: boolean; error: string; patientFilter: string; onPatientFilterChange: (value: string) => void; onApply: () => void; onClear: () => void; onRetry: () => void }) {
  return <section className="panel insurance-list-panel" aria-labelledby="policy-list-title">
    <div className="panel-heading insurance-list-heading"><div><h2 id="policy-list-title">وثائق التأمين</h2><p>تصفية اختيارية حسب معرّف المريض.</p></div><form className="insurance-filter" onSubmit={(event) => { event.preventDefault(); onApply() }}><label className="form-label" htmlFor="policy-patient-filter">معرّف المريض</label><div className="insurance-filter-controls"><input id="policy-patient-filter" className="form-input" value={patientFilter} onChange={(event) => onPatientFilterChange(event.target.value)} placeholder="UUID اختياري" dir="ltr" /><button className="secondary-button" type="submit">تطبيق</button>{patientFilter && <button className="text-button" type="button" onClick={onClear}>مسح</button>}</div></form></div>
    {loading && <div className="state-card" role="status">جارٍ تحميل وثائق التأمين…</div>}
    {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل الوثائق</strong><span>{error}</span><button className="secondary-button" type="button" onClick={onRetry}>إعادة المحاولة</button></div>}
    {!loading && !error && policies.length === 0 && <div className="state-card" role="status">لا توجد وثائق مطابقة. {canAdd ? 'أضف وثيقة تجريبية أو غيّر مرشح المريض.' : 'غيّر مرشح المريض.'}</div>}
    {!loading && !error && policies.length > 0 && <div className="insurance-table-wrap"><table className="insurance-policy-table"><caption className="sr-only">قائمة وثائق التأمين</caption><thead><tr><th scope="col">الجهة / الخطة</th><th scope="col">المريض</th><th scope="col">العضوية</th><th scope="col">التغطية</th><th scope="col">الصلاحية</th><th scope="col">الحالة</th></tr></thead><tbody>{policies.map((policy) => <tr key={policy.id}><td><strong>{policy.payerName}</strong><span className="table-subtext">{policy.planName}</span></td><td><span className="insurance-code" dir="ltr">{policy.patientId}</span></td><td><span dir="ltr">{policy.memberNumber}</span></td><td><strong className="insurance-number" dir="ltr">{policy.coveragePercent}%</strong></td><td><span className="table-subtext">{formatDate(policy.validFrom)} — {formatDate(policy.validTo)}</span></td><td><StatusBadge status={policy.status} labels={POLICY_STATUS_LABELS} tones={POLICY_STATUS_TONES} /></td></tr>)}</tbody></table></div>}
  </section>
}

function nextStatuses(status: InsuranceClaimStatus): InsuranceClaimStatus[] {
  if (status === 'draft') return ['submitted']
  if (status === 'submitted') return ['approved', 'rejected']
  if (status === 'approved') return ['paid']
  return []
}

function ClaimActions({ claim, busy, onTransition }: { claim: InsuranceClaim; busy: boolean; onTransition: (claim: InsuranceClaim, status: InsuranceClaimStatus) => void }) {
  const next = nextStatuses(claim.status)
  if (!next.length) return <span className="muted-note">لا توجد خطوة تالية</span>
  return <div className="insurance-actions">{next.map((status) => <button className="secondary-button row-action-button" type="button" key={status} onClick={() => onTransition(claim, status)} disabled={busy}>{busy ? 'جارٍ التحديث…' : `نقل إلى ${CLAIM_STATUS_LABELS[status]}`}</button>)}</div>
}

function ClaimsList({ canTransition, claims, loading, error, filter, onFilterChange, onRetry, busyClaimId, onTransition }: { canTransition: boolean; claims: InsuranceClaim[]; loading: boolean; error: string; filter: ClaimFilter; onFilterChange: (value: ClaimFilter) => void; onRetry: () => void; busyClaimId: string | null; onTransition: (claim: InsuranceClaim, status: InsuranceClaimStatus) => void }) {
  return <section className="panel insurance-claims-panel" aria-labelledby="claims-list-title">
    <div className="panel-heading insurance-list-heading"><div><h2 id="claims-list-title">المطالبات</h2><p>تظهر أرقام المطالبات العامة بصيغة `CLM-*`.</p></div><label className="filter-field" htmlFor="claim-status-filter"><span>تصفية الحالة</span><select id="claim-status-filter" className="form-input" value={filter} onChange={(event) => onFilterChange(event.target.value as ClaimFilter)}>{CLAIM_FILTER_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div>
    {loading && <div className="state-card" role="status">جارٍ تحميل المطالبات…</div>}
    {!loading && error && <div className="state-card state-card-error" role="alert"><strong>تعذر تحميل المطالبات</strong><span>{error}</span><button className="secondary-button" type="button" onClick={onRetry}>إعادة المحاولة</button></div>}
    {!loading && !error && claims.length === 0 && <div className="state-card" role="status">لا توجد مطالبات بهذه الحالة.</div>}
    {!loading && !error && claims.length > 0 && <div className="insurance-table-wrap"><table className="insurance-claims-table"><caption className="sr-only">قائمة المطالبات التأمينية</caption><thead><tr><th scope="col">المطالبة</th><th scope="col">وثيقة التأمين</th><th scope="col">الطلب</th><th scope="col">المبلغ</th><th scope="col">الحالة</th>{canTransition && <th scope="col">إجراءات الانتقال</th>}</tr></thead><tbody>{claims.map((claim) => <tr key={claim.id}><td><strong className="insurance-code" dir="ltr">{claim.claimNumber}</strong><span className="table-subtext">{formatDate(claim.createdAt)}</span></td><td><span className="insurance-code" dir="ltr">{claim.policyId}</span></td><td>{claim.orderId ? <span className="insurance-code" dir="ltr">{claim.orderId}</span> : <span className="muted-note">بدون طلب</span>}</td><td><strong className="insurance-number" dir="ltr">{formatMoney(claim.amount)}</strong></td><td><StatusBadge status={claim.status} labels={CLAIM_STATUS_LABELS} tones={CLAIM_STATUS_TONES} /></td>{canTransition && <td><ClaimActions claim={claim} busy={busyClaimId === claim.id} onTransition={onTransition} /></td>}</tr>)}</tbody></table></div>}
  </section>
}

function InsuranceView({ onBack, onToast }: InsuranceViewProps) {
  const can = useCan()
  const canPolicies = can('insurance.policies')
  const canClaims = can('insurance.claims')
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [claims, setClaims] = useState<InsuranceClaim[]>([])
  const [policyFilterDraft, setPolicyFilterDraft] = useState('')
  const [policyFilter, setPolicyFilter] = useState('')
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>('all')
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [claimsLoading, setClaimsLoading] = useState(true)
  const [policiesError, setPoliciesError] = useState('')
  const [claimsError, setClaimsError] = useState('')
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null)

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true)
    setPoliciesError('')
    try {
      setPolicies(await fetchInsurancePolicies(policyFilter))
    } catch (requestError) {
      setPoliciesError(getErrorMessage(requestError, 'تعذر تحميل وثائق التأمين.'))
    } finally {
      setPoliciesLoading(false)
    }
  }, [policyFilter])

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true)
    setClaimsError('')
    try {
      setClaims(await fetchInsuranceClaims(claimFilter === 'all' ? undefined : claimFilter))
    } catch (requestError) {
      setClaimsError(getErrorMessage(requestError, 'تعذر تحميل المطالبات التأمينية.'))
    } finally {
      setClaimsLoading(false)
    }
  }, [claimFilter])

  useEffect(() => { const timer = window.setTimeout(() => void loadPolicies(), 0); return () => window.clearTimeout(timer) }, [loadPolicies])
  useEffect(() => { const timer = window.setTimeout(() => void loadClaims(), 0); return () => window.clearTimeout(timer) }, [loadClaims])

  const policyOptions = policies

  const transitionClaim = async (claim: InsuranceClaim, status: InsuranceClaimStatus) => {
    setBusyClaimId(claim.id)
    try {
      await transitionInsuranceClaim(claim.id, status)
      await loadClaims()
      onToast(`تم نقل ${claim.claimNumber} إلى حالة ${CLAIM_STATUS_LABELS[status]}`)
    } catch (requestError) {
      onToast(getErrorMessage(requestError, 'تعذر تحديث حالة المطالبة.'), 'error')
    } finally {
      setBusyClaimId(null)
    }
  }

  return <>
    <ViewHeader title="التأمين" description={canPolicies || canClaims ? 'أدر وثائق المرضى وتابع دورة المطالبات. البيانات المعروضة تجريبية فقط.' : 'تابع وثائق المرضى ودورة المطالبات. البيانات المعروضة تجريبية فقط.'} onBack={onBack} />
    <div className="insurance-layout">
      {canPolicies && <CreatePolicyPanel onCreated={loadPolicies} onToast={onToast} />}
      <div className="insurance-stack">
        <PolicyList canAdd={canPolicies} policies={policies} loading={policiesLoading} error={policiesError} patientFilter={policyFilterDraft} onPatientFilterChange={setPolicyFilterDraft} onApply={() => setPolicyFilter(policyFilterDraft.trim())} onClear={() => { setPolicyFilterDraft(''); setPolicyFilter('') }} onRetry={() => void loadPolicies()} />
        {canClaims && <CreateClaimPanel policies={policyOptions} onCreated={loadClaims} onToast={onToast} />}
        <ClaimsList canTransition={canClaims} claims={claims} loading={claimsLoading} error={claimsError} filter={claimFilter} onFilterChange={setClaimFilter} onRetry={() => void loadClaims()} busyClaimId={busyClaimId} onTransition={(claim, status) => void transitionClaim(claim, status)} />
      </div>
    </div>
  </>
}

export default InsuranceView

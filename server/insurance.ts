export type InsurancePolicyStatus = 'active' | 'expired' | 'suspended'
export type InsuranceClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'

export type InsurancePolicy = {
  id: string
  patientId: string
  payerName: string
  memberNumber: string
  planName: string
  status: InsurancePolicyStatus
  coveragePercent: number
  validFrom: string
  validTo: string | null
  createdAt: string
  updatedAt: string
}

export type InsuranceClaim = {
  id: string
  claimNumber: string
  policyId: string
  orderId: string | null
  amount: number
  status: InsuranceClaimStatus
  submittedAt: string | null
  responseCode: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type InsurancePolicyInput = {
  patientId: string
  payerName: string
  memberNumber: string
  planName: string
  coveragePercent: number
  validFrom: string
  validTo?: string | null
}

export type InsuranceClaimInput = {
  policyId: string
  orderId?: string | null
  amount: number
}

export type InsuranceTransitionInput = { status: InsuranceClaimStatus }

export const INSURANCE_POLICY_STATUSES: readonly InsurancePolicyStatus[] = ['active', 'expired', 'suspended']
export const INSURANCE_CLAIM_STATUSES: readonly InsuranceClaimStatus[] = ['draft', 'submitted', 'approved', 'rejected', 'paid']

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PUBLIC_ORDER_PATTERN = /^AY-\d+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function validateBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum
}

export function isInsuranceUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isInsurancePolicyStatus(value: unknown): value is InsurancePolicyStatus {
  return typeof value === 'string' && INSURANCE_POLICY_STATUSES.includes(value as InsurancePolicyStatus)
}

export function isInsuranceClaimStatus(value: unknown): value is InsuranceClaimStatus {
  return typeof value === 'string' && INSURANCE_CLAIM_STATUSES.includes(value as InsuranceClaimStatus)
}

export function validateInsurancePolicyInput(value: unknown): InsurancePolicyInput | null {
  if (!isRecord(value) || !isInsuranceUuid(value.patientId)) return null
  if (!validateBoundedText(value.payerName, 200) || !validateBoundedText(value.memberNumber, 200) || !validateBoundedText(value.planName, 200)) return null
  if (typeof value.coveragePercent !== 'number' || !Number.isFinite(value.coveragePercent) || value.coveragePercent < 0 || value.coveragePercent > 100) return null
  if (!isCalendarDate(value.validFrom)) return null
  const validTo = value.validTo === undefined || value.validTo === null ? null : value.validTo
  if (validTo !== null && !isCalendarDate(validTo)) return null
  if (validTo !== null && validTo < value.validFrom) return null
  return {
    patientId: value.patientId,
    payerName: value.payerName.trim(),
    memberNumber: value.memberNumber.trim(),
    planName: value.planName.trim(),
    coveragePercent: value.coveragePercent,
    validFrom: value.validFrom,
    validTo,
  }
}

export function validateInsuranceClaimInput(value: unknown): InsuranceClaimInput | null {
  if (!isRecord(value) || !isInsuranceUuid(value.policyId)) return null
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount < 0) return null
  const orderId = value.orderId === undefined || value.orderId === null ? null : value.orderId
  if (orderId !== null && (typeof orderId !== 'string' || (!PUBLIC_ORDER_PATTERN.test(orderId) && !isInsuranceUuid(orderId)))) return null
  return { policyId: value.policyId, orderId, amount: Math.round((value.amount + Number.EPSILON) * 100) / 100 }
}

export function validateInsuranceTransitionInput(value: unknown): InsuranceTransitionInput | null {
  if (!isRecord(value) || !isInsuranceClaimStatus(value.status)) return null
  return { status: value.status }
}

export function canTransitionInsuranceClaim(current: InsuranceClaimStatus, next: InsuranceClaimStatus): boolean {
  return current === 'draft' && next === 'submitted'
    || current === 'submitted' && (next === 'approved' || next === 'rejected')
    || current === 'approved' && next === 'paid'
}

export function cloneInsurancePolicy(policy: InsurancePolicy): InsurancePolicy {
  return { ...policy }
}

export function cloneInsuranceClaim(claim: InsuranceClaim): InsuranceClaim {
  return { ...claim }
}

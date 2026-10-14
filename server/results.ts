import type { ResultFlag } from './domain.js'
import type { ReferenceRange } from './phase1.js'

export type RangeSubject = { dateOfBirth?: string; sex?: string; orderDate: string }
export type RangeEvaluation = {
  rangeStatus: 'approved' | 'no_approved_range'
  selectedRange: ReferenceRange | null
  snapshot: Record<string, unknown> | null
  flag: ResultFlag
}

function ageOnDate(dateOfBirth: string, orderDate: string): number | null {
  const birth = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00.000Z`)
  const order = new Date(`${orderDate.slice(0, 10)}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate.slice(0, 10)) || Number.isNaN(birth.getTime()) || Number.isNaN(order.getTime()) || birth.toISOString().slice(0, 10) !== dateOfBirth.slice(0, 10) || order.toISOString().slice(0, 10) !== orderDate.slice(0, 10) || birth > order) return null
  let age = order.getUTCFullYear() - birth.getUTCFullYear()
  if (order.getUTCMonth() < birth.getUTCMonth() || (order.getUTCMonth() === birth.getUTCMonth() && order.getUTCDate() < birth.getUTCDate())) age -= 1
  return age
}

export function selectApprovedReferenceRange(ranges: ReferenceRange[], subject: RangeSubject): ReferenceRange | null {
  if (!subject.dateOfBirth || !['male', 'female'].includes(subject.sex ?? '')) return null
  const age = ageOnDate(subject.dateOfBirth, subject.orderDate)
  if (age === null) return null
  return ranges.filter((range) => range.status === 'approved'
    && range.sex !== 'all' ? range.sex === subject.sex && age >= range.ageFromYears && (range.ageToYears === null || age <= range.ageToYears)
    : range.status === 'approved' && age >= range.ageFromYears && (range.ageToYears === null || age <= range.ageToYears))
    .sort((left, right) => Number(right.sex !== 'all') - Number(left.sex !== 'all')
      || ((left.ageToYears ?? Number.MAX_SAFE_INTEGER) - left.ageFromYears) - ((right.ageToYears ?? Number.MAX_SAFE_INTEGER) - right.ageFromYears)
      || right.ageFromYears - left.ageFromYears
      || (left.ageToYears ?? Number.MAX_SAFE_INTEGER) - (right.ageToYears ?? Number.MAX_SAFE_INTEGER))[0] ?? null
}

function parseStrictNumber(value: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calculateNumericFlag(value: number | null, range: ReferenceRange | null): ResultFlag {
  if (value === null || !range) return 'not_applicable'
  if ((range.criticalLow !== null && value <= range.criticalLow) || (range.criticalHigh !== null && value >= range.criticalHigh)) return 'critical'
  if (range.low !== null && value < range.low) return 'low'
  if (range.high !== null && value > range.high) return 'high'
  return 'normal'
}

export function evaluateResultRange(value: string, subject: RangeSubject, ranges: ReferenceRange[]): RangeEvaluation {
  const selectedRange = selectApprovedReferenceRange(ranges, subject)
  const rangeStatus = selectedRange ? 'approved' : 'no_approved_range'
  return {
    rangeStatus,
    selectedRange,
    snapshot: selectedRange ? structuredClone(selectedRange) : null,
    flag: selectedRange?.resultType === 'numeric' ? calculateNumericFlag(parseStrictNumber(value), selectedRange) : 'not_applicable',
  }
}

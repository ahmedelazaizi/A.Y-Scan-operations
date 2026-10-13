export type ReportQueryInput = {
  from?: unknown
  to?: unknown
}

export type ReportQuery = {
  from: string | null
  to: string | null
}

export type OperationsReport = {
  period: ReportQuery
  orders: { total: number; completed: number; awaitingSample: number; inProgress: number }
  specimens: { total: number; collected: number; processing: number; completed: number }
  results: { total: number; draft: number; reviewed: number }
  billing: { invoiced: number; paid: number; open: number }
  radiology: { total: number; scheduled: number; inProgress: number; reported: number; verified: number }
  inventory: { items: number; lowStock: number }
  insurance: { claimsTotal: number; submitted: number; approved: number; paid: number }
  homeVisits: { total: number; scheduled: number; inProgress: number; completed: number }
}

export class ReportValidationError extends Error {
  readonly code = 'invalid_report_query'
}

function validateDate(value: unknown, field: 'from' | 'to'): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReportValidationError(`${field} must be a valid YYYY-MM-DD date.`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
    throw new ReportValidationError(`${field} must be a valid YYYY-MM-DD date.`)
  }
  return value
}

export function validateReportQuery(input: ReportQueryInput): ReportQuery {
  const from = validateDate(input.from, 'from')
  const to = validateDate(input.to, 'to')
  if (from && to && from > to) throw new ReportValidationError('from must be before or equal to to.')
  return { from, to }
}

export function parseReportQuery(searchParams: URLSearchParams): ReportQuery {
  return validateReportQuery({
    from: searchParams.has('from') ? searchParams.get('from') : undefined,
    to: searchParams.has('to') ? searchParams.get('to') : undefined,
  })
}

export function isReportDateInRange(timestamp: string, query: ReportQuery): boolean {
  const date = timestamp.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return (!query.from || date >= query.from) && (!query.to || date <= query.to)
}

export function emptyOperationsReport(period: ReportQuery): OperationsReport {
  return {
    period,
    orders: { total: 0, completed: 0, awaitingSample: 0, inProgress: 0 },
    specimens: { total: 0, collected: 0, processing: 0, completed: 0 },
    results: { total: 0, draft: 0, reviewed: 0 },
    billing: { invoiced: 0, paid: 0, open: 0 },
    radiology: { total: 0, scheduled: 0, inProgress: 0, reported: 0, verified: 0 },
    inventory: { items: 0, lowStock: 0 },
    insurance: { claimsTotal: 0, submitted: 0, approved: 0, paid: 0 },
    homeVisits: { total: 0, scheduled: 0, inProgress: 0, completed: 0 },
  }
}

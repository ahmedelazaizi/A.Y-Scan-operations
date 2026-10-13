const egpFormatter = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 })
const countFormatter = new Intl.NumberFormat('ar-EG')
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

export function formatEgp(value: number): string {
  return egpFormatter.format(value)
}

export function formatCount(value: number): string {
  return countFormatter.format(value)
}

export function formatDateTime(value: string | null | undefined, empty = '—'): string {
  if (!value) return empty
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? empty : dateTimeFormatter.format(date)
}

import { RepositoryInputError } from './storage/repository.js'

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void'
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'insurance'

export type InvoiceItemInput = {
  description: string
  quantity: number
  unitPrice: number
}

export type InvoiceItem = InvoiceItemInput & {
  id: string
  lineTotal: number
}

export type Payment = {
  id: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paidAt: string
  receivedBy: string
}

export type Invoice = {
  id: string
  orderId: string
  invoiceNumber: string
  currency: string
  subtotal: number
  discount: number
  tax: number
  total: number
  status: InvoiceStatus
  items: InvoiceItem[]
  payments: Payment[]
  createdAt: string
  updatedAt: string
}

export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['draft', 'issued', 'partially_paid', 'paid', 'void']
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'insurance']

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === 'string' && INVOICE_STATUSES.includes(value as InvoiceStatus)
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && PAYMENT_METHODS.includes(value as PaymentMethod)
}

/** Money is computed in integer minor units (piastres) and only converted to decimal at the edges. */
export function toMinorUnits(value: number): number {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100)
}

export function fromMinorUnits(value: number): number {
  return value / 100
}

export function roundMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value))
}

const MAX_MINOR_UNITS = 999_999_999_999 // NUMERIC(14, 2) upper bound in piastres

function validateMinor(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RepositoryInputError(`${field} must be a non-negative number.`)
  const minor = toMinorUnits(value)
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR_UNITS) throw new RepositoryInputError(`${field} is too large.`)
  return minor
}

const QUANTITY_SCALE = 1000

export function lineTotalMinor(quantity: number, unitPrice: number): number {
  const scaledQuantity = Math.round(quantity * QUANTITY_SCALE)
  return Math.round((scaledQuantity * toMinorUnits(unitPrice)) / QUANTITY_SCALE)
}

export function calculateInvoiceTotals(
  items: readonly InvoiceItemInput[],
  discount = 0,
  tax = 0,
): { items: InvoiceItemInput[]; subtotal: number; discount: number; tax: number; total: number } {
  if (items.length === 0) throw new RepositoryInputError('At least one invoice item is required.')
  const normalizedItems = items.map((item) => {
    if (!item || typeof item.description !== 'string' || !item.description.trim() || item.description.trim().length > 500) {
      throw new RepositoryInputError('Invoice item description is invalid.')
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new RepositoryInputError('Invoice item quantity must be positive.')
    }
    const quantity = Math.round(item.quantity * QUANTITY_SCALE) / QUANTITY_SCALE
    if (!Number.isFinite(quantity) || quantity <= 0) throw new RepositoryInputError('Invoice item quantity must be positive.')
    return {
      description: item.description.trim(),
      quantity,
      unitPrice: fromMinorUnits(validateMinor(item.unitPrice, 'Invoice item unitPrice')),
    }
  })
  const subtotalMinor = normalizedItems.reduce((sum, item) => sum + lineTotalMinor(item.quantity, item.unitPrice), 0)
  const discountMinor = validateMinor(discount, 'discount')
  const taxMinor = validateMinor(tax, 'tax')
  if (subtotalMinor > MAX_MINOR_UNITS) throw new RepositoryInputError('Invoice totals are too large.')
  if (discountMinor > subtotalMinor) throw new RepositoryInputError('discount cannot exceed subtotal.')
  const totalMinor = subtotalMinor - discountMinor + taxMinor
  if (totalMinor > MAX_MINOR_UNITS) throw new RepositoryInputError('Invoice totals are too large.')
  return {
    items: normalizedItems,
    subtotal: fromMinorUnits(subtotalMinor),
    discount: fromMinorUnits(discountMinor),
    tax: fromMinorUnits(taxMinor),
    total: fromMinorUnits(totalMinor),
  }
}

export function normalizePaymentAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new RepositoryInputError('amount must be a positive number.')
  const minor = toMinorUnits(amount)
  if (minor <= 0) throw new RepositoryInputError('amount must be a positive number.')
  if (minor > MAX_MINOR_UNITS) throw new RepositoryInputError('amount is too large.')
  return fromMinorUnits(minor)
}

/** Remaining balance in minor units; payments never exceed it. */
export function outstandingMinor(total: number, payments: readonly number[]): number {
  return toMinorUnits(total) - payments.reduce((sum, amount) => sum + toMinorUnits(amount), 0)
}

export function cloneInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    items: invoice.items.map((item) => ({ ...item })),
    payments: invoice.payments.map((payment) => ({ ...payment })),
  }
}

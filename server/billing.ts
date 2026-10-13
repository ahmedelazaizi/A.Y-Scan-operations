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

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validateMoney(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RepositoryInputError(`${field} must be a non-negative number.`)
  const rounded = roundMoney(value)
  if (!Number.isFinite(rounded)) throw new RepositoryInputError(`${field} is invalid.`)
  return rounded
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
    const quantity = Math.round(item.quantity * 1000) / 1000
    if (!Number.isFinite(quantity) || quantity <= 0) throw new RepositoryInputError('Invoice item quantity must be positive.')
    return {
      description: item.description.trim(),
      quantity,
      unitPrice: validateMoney(item.unitPrice, 'Invoice item unitPrice'),
    }
  })
  const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + roundMoney(item.quantity * item.unitPrice), 0))
  const normalizedDiscount = validateMoney(discount, 'discount')
  const normalizedTax = validateMoney(tax, 'tax')
  if (!Number.isFinite(subtotal)) throw new RepositoryInputError('Invoice totals are too large.')
  if (normalizedDiscount > subtotal) throw new RepositoryInputError('discount cannot exceed subtotal.')
  const total = roundMoney(subtotal - normalizedDiscount + normalizedTax)
  if (!Number.isFinite(total)) throw new RepositoryInputError('Invoice totals are too large.')
  return { items: normalizedItems, subtotal, discount: normalizedDiscount, tax: normalizedTax, total }
}

export function normalizePaymentAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new RepositoryInputError('amount must be a positive number.')
  const normalized = roundMoney(amount)
  if (normalized <= 0) throw new RepositoryInputError('amount must be a positive number.')
  return normalized
}

export function cloneInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    items: invoice.items.map((item) => ({ ...item })),
    payments: invoice.payments.map((payment) => ({ ...payment })),
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateInvoiceTotals, lineTotalMinor, normalizePaymentAmount, outstandingMinor, toMinorUnits } from './billing.js'
import { RepositoryInputError } from './storage/repository.js'

test('invoice totals are exact in piastres where floating point would drift', () => {
  const totals = calculateInvoiceTotals([
    { description: 'A', quantity: 3, unitPrice: 0.1 },
    { description: 'B', quantity: 1, unitPrice: 0.2 },
  ], 0.05, 0.07)
  assert.deepEqual([totals.subtotal, totals.discount, totals.tax, totals.total], [0.5, 0.05, 0.07, 0.52])
})

test('fractional quantities round each line to the piastre like the database', () => {
  assert.equal(lineTotalMinor(0.333, 10), 333)
  assert.equal(lineTotalMinor(2.5, 19.99), 4998)
})

test('a balance split into thirds settles exactly', () => {
  const total = 100
  assert.equal(outstandingMinor(total, [33.33, 33.33, 33.33]), 1)
  assert.equal(outstandingMinor(total, [33.33, 33.33, 33.33, 0.01]), 0)
  assert.equal(toMinorUnits(1.005), 101)
})

test('amounts outside the stored precision are rejected', () => {
  assert.throws(() => normalizePaymentAmount(0.004), RepositoryInputError)
  assert.throws(() => normalizePaymentAmount(1e13), RepositoryInputError)
  assert.throws(() => calculateInvoiceTotals([{ description: 'A', quantity: 1, unitPrice: 10 }], 11), RepositoryInputError)
})

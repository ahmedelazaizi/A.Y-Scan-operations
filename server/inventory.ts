import { RepositoryInputError } from './storage/repository.js'

export type InventoryMovementType = 'receipt' | 'issue' | 'adjustment'
export type InventoryAdjustmentDirection = 'increase' | 'decrease'

export type InventoryItem = {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  reorderLevel: number
  quantity: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type InventoryMovement = {
  id: string
  itemId: string
  type: InventoryMovementType
  quantity: number
  adjustmentDirection: InventoryAdjustmentDirection | null
  reason: string
  reference: string | null
  createdBy: string
  createdAt: string
}

export type InventoryMovementResult = {
  item: InventoryItem
  movement: InventoryMovement
}

export const INVENTORY_MOVEMENT_TYPES: readonly InventoryMovementType[] = ['receipt', 'issue', 'adjustment']
export const INVENTORY_ADJUSTMENT_DIRECTIONS: readonly InventoryAdjustmentDirection[] = ['increase', 'decrease']

const MAX_DECIMAL_VALUE = Number.MAX_SAFE_INTEGER / 1000

export function isInventoryMovementType(value: unknown): value is InventoryMovementType {
  return typeof value === 'string' && INVENTORY_MOVEMENT_TYPES.includes(value as InventoryMovementType)
}

export function isInventoryAdjustmentDirection(value: unknown): value is InventoryAdjustmentDirection {
  return typeof value === 'string' && INVENTORY_ADJUSTMENT_DIRECTIONS.includes(value as InventoryAdjustmentDirection)
}

function normalizeText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new RepositoryInputError(`${field} is invalid.`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) throw new RepositoryInputError(`${field} is invalid.`)
  return normalized
}

export function normalizeInventoryNumber(value: unknown, field: string, positive: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0) || value > MAX_DECIMAL_VALUE) {
    throw new RepositoryInputError(`${field} must be ${positive ? 'a positive' : 'a non-negative'} number.`)
  }
  const normalized = Math.round((value + Number.EPSILON) * 1000) / 1000
  if (!Number.isFinite(normalized) || (positive ? normalized <= 0 : normalized < 0)) {
    throw new RepositoryInputError(`${field} is invalid.`)
  }
  return normalized
}

export function validateInventoryItemInput(
  sku: unknown,
  name: unknown,
  category: unknown,
  unit: unknown,
  reorderLevel: unknown,
): { sku: string; name: string; category: string; unit: string; reorderLevel: number } {
  return {
    sku: normalizeText(sku, 'sku', 100),
    name: normalizeText(name, 'name', 200),
    category: normalizeText(category, 'category', 100),
    unit: normalizeText(unit, 'unit', 50),
    reorderLevel: normalizeInventoryNumber(reorderLevel, 'reorderLevel', false),
  }
}

export function validateInventoryMovementInput(
  type: unknown,
  quantity: unknown,
  reason: unknown,
  reference?: unknown,
  adjustmentDirection?: unknown,
): {
  type: InventoryMovementType
  quantity: number
  reason: string
  reference?: string
  adjustmentDirection?: InventoryAdjustmentDirection
} {
  if (!isInventoryMovementType(type)) throw new RepositoryInputError('type is invalid.')
  const normalizedQuantity = normalizeInventoryNumber(quantity, 'quantity', true)
  const normalizedReason = normalizeText(reason, 'reason', 500)
  let normalizedReference: string | undefined
  if (reference !== undefined && reference !== null) normalizedReference = normalizeText(reference, 'reference', 200)

  if (type === 'adjustment') {
    if (!isInventoryAdjustmentDirection(adjustmentDirection)) {
      throw new RepositoryInputError('adjustmentDirection must be increase or decrease for adjustments.')
    }
    return {
      type,
      quantity: normalizedQuantity,
      reason: normalizedReason,
      ...(normalizedReference ? { reference: normalizedReference } : {}),
      adjustmentDirection,
    }
  }
  if (adjustmentDirection !== undefined && adjustmentDirection !== null) {
    throw new RepositoryInputError('adjustmentDirection is only valid for adjustments.')
  }
  return {
    type,
    quantity: normalizedQuantity,
    reason: normalizedReason,
    ...(normalizedReference ? { reference: normalizedReference } : {}),
  }
}

export function movementDelta(
  type: InventoryMovementType,
  quantity: number,
  adjustmentDirection?: InventoryAdjustmentDirection,
): number {
  if (type === 'receipt') return quantity
  if (type === 'issue') return -quantity
  if (!adjustmentDirection) throw new RepositoryInputError('adjustmentDirection is required for adjustments.')
  return adjustmentDirection === 'increase' ? quantity : -quantity
}

export function cloneInventoryItem(item: InventoryItem): InventoryItem {
  return { ...item }
}

export function cloneInventoryMovement(movement: InventoryMovement): InventoryMovement {
  return { ...movement }
}

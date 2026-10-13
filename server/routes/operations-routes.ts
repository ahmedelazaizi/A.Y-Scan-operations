import { isValidAuditLabel } from '../audit.js'
import { isInvoiceStatus } from '../billing.js'
import { isHomeVisitStatus, isHomeVisitUuid, validateCreateHomeVisitInput, validateHomeVisitTransitionInput } from '../home-visits.js'
import {
  isInsuranceClaimStatus,
  isInsuranceUuid,
  validateInsuranceClaimInput,
  validateInsurancePolicyInput,
  validateInsuranceTransitionInput,
} from '../insurance.js'
import { isRadiologyStudyStatus } from '../radiology.js'
import { parseReportQuery } from '../reports.js'
import { validateCreateDeviceInput } from '../devices.js'
import { requires, route, ValidationError, type Route } from '../router.js'
import type { OrderRepository } from '../storage/repository.js'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parseListPage,
  parsePageValue,
  validateCreateInventoryItemInput,
  validateInvoiceInput,
  validatePaymentInput,
  validateRadiologyReportInput,
  validateRadiologyStudyInput,
  validateRecordInventoryMovementInput,
  validateText,
} from '../validation.js'

function parseActiveOnly(value: string | null): boolean | undefined {
  if (value === null) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ValidationError('activeOnly must be true or false.')
}

function parseStatus<T extends string>(value: string | null, isValid: (candidate: string) => candidate is T): T | undefined {
  if (value === null) return undefined
  if (!isValid(value)) throw new ValidationError('status is invalid.')
  return value
}

function requireId(value: string): string {
  const id = validateText(value, 100)
  if (!id) throw new ValidationError('id is invalid.')
  return id
}

function optionalUuidQuery(value: string | null, isValid: (candidate: unknown) => boolean): string | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (!isValid(trimmed)) throw new ValidationError('patientId must be a valid UUID.')
  return trimmed
}

function billingRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/billing/invoices', requires('billing.view'), async (context) => {
      context.json(200, await repository.listInvoices(parseStatus(context.query.get('status'), isInvoiceStatus), parseListPage(context.query)))
    }),
    route('POST', '/api/billing/invoices', requires('billing.manage'), async (context) => {
      const input = validateInvoiceInput(await context.body())
      if (!input) throw new ValidationError('orderId, items, discount, and tax are invalid.')
      const invoice = await repository.createInvoice(input.orderId, input.items, input.discount, input.tax)
      await context.audit({ action: 'invoice.created', entityType: 'invoice', entityId: invoice.id, metadata: { status: invoice.status } })
      context.json(201, invoice)
    }),
    route('POST', '/api/billing/invoices/:id/payments', requires('billing.manage'), async (context) => {
      const invoiceId = requireId(context.params.id)
      const input = validatePaymentInput(await context.body())
      if (!input) throw new ValidationError('amount, method, and reference are invalid.')
      const invoice = await repository.recordPayment(invoiceId, input.amount, input.method, input.reference, context.user.displayName)
      await context.audit({
        action: 'payment.recorded', entityType: 'invoice', entityId: invoice.id, metadata: { method: input.method, status: invoice.status, amount: input.amount },
      })
      context.json(201, invoice)
    }),
  ]
}

function radiologyRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/radiology/studies', requires('radiology.view'), async (context) => {
      context.json(200, await repository.listRadiologyStudies(parseStatus(context.query.get('status'), isRadiologyStudyStatus), parseListPage(context.query)))
    }),
    route('POST', '/api/radiology/studies', requires('radiology.schedule'), async (context) => {
      const input = validateRadiologyStudyInput(await context.body())
      if (!input) throw new ValidationError('patientId, modality, bodyPart, priority, scheduledAt, and referringProvider are invalid.')
      const study = await repository.createRadiologyStudy(input.patientId, input.modality, input.bodyPart, input.priority, input.scheduledAt, input.referringProvider)
      await context.audit({ action: 'radiology.created', entityType: 'radiology', entityId: study.id, metadata: { modality: study.modality, priority: study.priority } })
      context.json(201, study)
    }),
    route('POST', '/api/radiology/studies/:id/start', requires('radiology.perform'), async (context) => {
      const study = await repository.startRadiologyStudy(context.params.id)
      await context.audit({ action: 'radiology.started', entityType: 'radiology', entityId: study.id, metadata: { status: study.status } })
      context.json(200, study)
    }),
    route('POST', '/api/radiology/studies/:id/report', requires('radiology.report'), async (context) => {
      const input = validateRadiologyReportInput(await context.body())
      if (!input) throw new ValidationError('reportText and impression are required.')
      const study = await repository.reportRadiologyStudy(context.params.id, input.reportText, input.impression)
      await context.audit({ action: 'radiology.reported', entityType: 'radiology', entityId: study.id, metadata: { status: study.status } })
      context.json(200, study)
    }),
    route('POST', '/api/radiology/studies/:id/verify', requires('radiology.report'), async (context) => {
      const study = await repository.verifyRadiologyStudy(context.params.id, context.user.displayName)
      await context.audit({ action: 'radiology.verified', entityType: 'radiology', entityId: study.id, metadata: { status: study.status } })
      context.json(200, study)
    }),
  ]
}

function inventoryRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/inventory/items', requires('inventory.view'), async (context) => {
      context.json(200, await repository.listInventoryItems(parseActiveOnly(context.query.get('activeOnly'))))
    }),
    route('POST', '/api/inventory/items', requires('inventory.manageItems'), async (context) => {
      const input = validateCreateInventoryItemInput(await context.body())
      if (!input) throw new ValidationError('sku, name, category, unit, and reorderLevel are invalid.')
      const item = await repository.createInventoryItem(input.sku, input.name, input.category, input.unit, input.reorderLevel)
      await context.audit({ action: 'inventory.item_created', entityType: 'inventory_item', entityId: item.id })
      context.json(201, item)
    }),
    route('POST', '/api/inventory/items/:id/movements', requires('inventory.move'), async (context) => {
      const input = validateRecordInventoryMovementInput(await context.body())
      if (!input) throw new ValidationError('type, quantity, reason, reference, and adjustmentDirection are invalid.')
      const result = await repository.recordInventoryMovement(
        context.params.id, input.type, input.quantity, input.reason, input.reference, input.adjustmentDirection, context.user.displayName,
      )
      await context.audit({
        action: 'inventory.movement_recorded', entityType: 'inventory_movement', entityId: result.movement.id,
        metadata: { movementType: result.movement.type, quantity: result.movement.quantity },
      })
      context.json(201, result)
    }),
  ]
}

function insuranceRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/insurance/policies', requires('insurance.view'), async (context) => {
      context.json(200, await repository.listInsurancePolicies(optionalUuidQuery(context.query.get('patientId'), isInsuranceUuid), parseListPage(context.query)))
    }),
    route('POST', '/api/insurance/policies', requires('insurance.policies'), async (context) => {
      const input = validateInsurancePolicyInput(await context.body())
      if (!input) throw new ValidationError('patientId, payerName, memberNumber, planName, coveragePercent, validFrom, and validTo are invalid.')
      const policy = await repository.createInsurancePolicy(
        input.patientId, input.payerName, input.memberNumber, input.planName, input.coveragePercent, input.validFrom, input.validTo ?? undefined,
      )
      await context.audit({ action: 'insurance.policy_created', entityType: 'insurance_policy', entityId: policy.id })
      context.json(201, policy)
    }),
    route('GET', '/api/insurance/claims', requires('insurance.view'), async (context) => {
      context.json(200, await repository.listInsuranceClaims(parseStatus(context.query.get('status'), isInsuranceClaimStatus), parseListPage(context.query)))
    }),
    route('POST', '/api/insurance/claims', requires('insurance.claims'), async (context) => {
      const input = validateInsuranceClaimInput(await context.body())
      if (!input) throw new ValidationError('policyId, orderId, and amount are invalid.')
      const claim = await repository.createInsuranceClaim(input.policyId, input.orderId ?? undefined, input.amount)
      await context.audit({ action: 'insurance.claim_created', entityType: 'insurance_claim', entityId: claim.id, metadata: { status: claim.status } })
      context.json(201, claim)
    }),
    route('POST', '/api/insurance/claims/:id/transition', requires('insurance.claims'), async (context) => {
      const id = requireId(context.params.id)
      const input = validateInsuranceTransitionInput(await context.body())
      if (!input) throw new ValidationError('status is invalid.')
      const claim = await repository.transitionInsuranceClaim(id, input.status)
      await context.audit({ action: 'insurance.claim_transitioned', entityType: 'insurance_claim', entityId: claim.id, metadata: { status: claim.status } })
      context.json(200, claim)
    }),
  ]
}

function homeVisitRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/home-visits', requires('homeVisits.view'), async (context) => {
      const patientId = optionalUuidQuery(context.query.get('patientId'), isHomeVisitUuid)
      context.json(200, await repository.listHomeVisits(patientId, parseStatus(context.query.get('status'), isHomeVisitStatus), parseListPage(context.query)))
    }),
    route('POST', '/api/home-visits', requires('homeVisits.schedule'), async (context) => {
      const input = validateCreateHomeVisitInput(await context.body())
      if (!input) throw new ValidationError('patientId, orderId, address, contactPhone, scheduledAt, assignedTo, and notes are invalid.')
      const visit = await repository.createHomeVisit(
        input.patientId, input.orderId ?? undefined, input.address, input.contactPhone, input.scheduledAt, input.assignedTo ?? undefined, input.notes ?? undefined,
      )
      await context.audit({ action: 'home_visit.created', entityType: 'home_visit', entityId: visit.id, metadata: { status: visit.status } })
      context.json(201, visit)
    }),
    route('POST', '/api/home-visits/:id/transition', requires('homeVisits.update'), async (context) => {
      if (!isHomeVisitUuid(context.params.id)) throw new ValidationError('id must be a valid UUID.')
      const input = validateHomeVisitTransitionInput(await context.body())
      if (!input) throw new ValidationError('status is invalid.')
      const visit = await repository.transitionHomeVisit(context.params.id, input.status)
      await context.audit({ action: 'home_visit.transitioned', entityType: 'home_visit', entityId: visit.id, metadata: { status: visit.status } })
      context.json(200, visit)
    }),
  ]
}

function deviceRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/devices', requires('devices.view'), async (context) => {
      context.json(200, await repository.listDevices(parseActiveOnly(context.query.get('activeOnly'))))
    }),
    route('POST', '/api/devices', requires('devices.manage'), async (context) => {
      const input = validateCreateDeviceInput(await context.body())
      if (!input) throw new ValidationError('name, manufacturer, model, protocol, endpoint, status, and isActive are invalid.')
      const device = await repository.createDevice(input)
      await context.audit({ action: 'device.created', entityType: 'device', entityId: device.id, metadata: { method: device.protocol, status: device.status } })
      context.json(201, device)
    }),
    route('POST', '/api/devices/:id/check-connection', requires('devices.check'), async (context) => {
      const result = await repository.checkDeviceConnection(context.params.id)
      await context.audit({
        action: 'device.connection_checked', entityType: 'device', entityId: result.device.id, metadata: { method: result.device.protocol, status: result.status },
      })
      context.json(200, result)
    }),
  ]
}

function oversightRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/reports/operations', requires('reports.view'), async (context) => {
      const period = parseReportQuery(context.query)
      context.json(200, await repository.getOperationsReport(period.from ?? undefined, period.to ?? undefined))
    }),
    route('GET', '/api/audit-events', requires('audit.view'), async (context) => {
      const entityType = context.query.get('entityType')?.trim()
      const action = context.query.get('action')?.trim()
      if ((entityType !== undefined && !isValidAuditLabel(entityType)) || (action !== undefined && !isValidAuditLabel(action))) {
        throw new ValidationError('entityType and action are invalid.')
      }
      const limit = parsePageValue(context.query.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      context.json(200, await repository.listAuditEvents({ limit, entityType, action }))
    }),
  ]
}

export function operationsRoutes(repository: OrderRepository): Route[] {
  return [
    ...billingRoutes(repository),
    ...radiologyRoutes(repository),
    ...inventoryRoutes(repository),
    ...insuranceRoutes(repository),
    ...homeVisitRoutes(repository),
    ...deviceRoutes(repository),
    ...oversightRoutes(repository),
  ]
}

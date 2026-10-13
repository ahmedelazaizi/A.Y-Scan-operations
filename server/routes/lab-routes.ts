import { requires, route, ValidationError, type Route } from '../router.js'
import type { OrderRepository } from '../storage/repository.js'
import {
  DEFAULT_PAGE_SIZE,
  isSpecimenStatus,
  isUuid,
  MAX_PAGE_SIZE,
  parsePageValue,
  validateOrderInput,
  validatePatientInput,
  validateResultInput,
  validateSpecimenInput,
  validateText,
} from '../validation.js'

function requireText(value: string, field: string): string {
  const text = validateText(value, 100)
  if (!text) throw new ValidationError(`${field} is invalid.`)
  return text
}

export function labRoutes(repository: OrderRepository): Route[] {
  return [
    route('GET', '/api/dashboard', requires('dashboard.view'), async (context) => {
      context.json(200, await repository.getDashboard())
    }),

    route('GET', '/api/orders', requires('orders.view'), async (context) => {
      context.json(200, await repository.listRecent())
    }),

    route('POST', '/api/orders', requires('orders.create'), async (context) => {
      const input = validateOrderInput(await context.body())
      if (!input) throw new ValidationError('patientName, tests, and priority are invalid.')
      if (input.patientId && !(await repository.getPatientById(input.patientId))) {
        throw new ValidationError('patientId does not reference an existing patient.')
      }
      const order = await repository.createOrder(input)
      await context.audit({
        action: 'order.created', entityType: 'order', entityId: isUuid(order.id) ? order.id : null, metadata: { priority: order.priority ?? 'normal' },
      })
      context.json(201, order)
    }),

    route('GET', '/api/patients', requires('patients.view'), async (context) => {
      const limit = parsePageValue(context.query.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      const offset = parsePageValue(context.query.get('offset'), 0)
      context.json(200, await repository.listPatients({ query: context.query.get('q') ?? undefined, limit, offset }))
    }),

    route('POST', '/api/patients', requires('patients.create'), async (context) => {
      const input = validatePatientInput(await context.body())
      if (!input) throw new ValidationError('fullName, dateOfBirth, and sex are invalid.')
      const patient = await repository.createPatient(input)
      await context.audit({ action: 'patient.created', entityType: 'patient', entityId: patient.id })
      context.json(201, patient)
    }),

    route('GET', '/api/catalog', requires('catalog.view'), async (context) => {
      context.json(200, await repository.listCatalog())
    }),

    route('GET', '/api/specimens', requires('specimens.view'), async (context) => {
      const statusValue = context.query.get('status')
      if (statusValue !== null && !isSpecimenStatus(statusValue)) throw new ValidationError('status is invalid.')
      context.json(200, await repository.listSpecimens(statusValue ?? undefined))
    }),

    route('POST', '/api/specimens', requires('specimens.manage'), async (context) => {
      const input = validateSpecimenInput(await context.body())
      if (!input) throw new ValidationError('orderId, specimenType, and barcode are invalid.')
      const specimen = await repository.createSpecimen(input.orderId, input.specimenType, input.barcode)
      await context.audit({ action: 'specimen.created', entityType: 'specimen', entityId: specimen.id, metadata: { specimenType: specimen.specimenType } })
      context.json(201, specimen)
    }),

    route('POST', '/api/specimens/:barcode/collect', requires('specimens.manage'), async (context) => {
      const specimen = await repository.collectSpecimen(requireText(context.params.barcode, 'barcode'))
      await context.audit({ action: 'specimen.collected', entityType: 'specimen', entityId: specimen.id, metadata: { status: specimen.status } })
      context.json(200, specimen)
    }),

    route('GET', '/api/results', requires('results.view'), async (context) => {
      const orderIdValue = context.query.get('orderId')
      const orderId = orderIdValue === null ? undefined : validateText(orderIdValue, 100)
      if (orderId === null) throw new ValidationError('orderId is invalid.')
      context.json(200, await repository.listResults(orderId))
    }),

    route('POST', '/api/results', requires('results.enter'), async (context) => {
      const input = validateResultInput(await context.body())
      if (!input) throw new ValidationError('orderItemId, value, and flag are invalid.')
      const labResult = await repository.enterResult(input.orderItemId, input.value, input.unit, input.referenceRange, input.flag, context.user.displayName)
      await context.audit({ action: 'result.created', entityType: 'result', entityId: labResult.id, metadata: { resultFlag: labResult.flag, status: labResult.status } })
      context.json(201, labResult)
    }),

    route('POST', '/api/results/:id/review', requires('results.review'), async (context) => {
      const labResult = await repository.reviewResult(requireText(context.params.id, 'id'), context.user.displayName)
      await context.audit({ action: 'result.reviewed', entityType: 'result', entityId: labResult.id, metadata: { status: labResult.status } })
      context.json(200, labResult)
    }),
  ]
}

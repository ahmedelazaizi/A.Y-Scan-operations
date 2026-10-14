import { requires, route, ValidationError, type Route } from '../router.js'
import { AuthCredentialError } from '../auth/service.js'
import { hasCapability } from '../permissions.js'
import { RepositoryConflictError, RepositoryNotFoundError, type OrderRepository } from '../storage/repository.js'
import type { Phase1Store, ReferenceRange } from '../phase1.js'
import { evaluateResultRange, selectApprovedReferenceRange } from '../results.js'
import { publicRoute } from '../router.js'
import {
  DEFAULT_PAGE_SIZE,
  isSpecimenStatus,
  isUuid,
  MAX_PAGE_SIZE,
  parseListPage,
  parsePageValue,
  validateCatalogTestInput,
  validateCatalogTestUpdate,
  validateReceptionOrderInput,
  validatePatientInput,
  validateResultInput,
  validateAmendResultInput,
  validateSpecimenInput,
  validateSpecimenReasonInput,
  validateText,
} from '../validation.js'

function requireText(value: string, field: string): string {
  const text = validateText(value, 100)
  if (!text) throw new ValidationError(`${field} is invalid.`)
  return text
}

function rangeText(range: ReferenceRange | null): string | undefined {
  if (!range) return undefined
  if (range.resultType !== 'numeric') return range.normalText ?? range.textValue ?? undefined
  return range.low === null && range.high === null ? undefined : `${range.low ?? '−∞'}–${range.high ?? '∞'}`
}

async function allWorklist(repository: OrderRepository) {
  const items = []
  for (let offset = 0; ; offset += 500) {
    const page = await repository.listResultWorklist({ limit: 500, offset })
    items.push(...page)
    if (page.length < 500) return items
  }
}

async function allResults(repository: OrderRepository, orderId?: string) {
  const results = []
  for (let offset = 0; ; offset += 500) {
    const page = await repository.listResults(orderId, { limit: 500, offset })
    results.push(...page)
    if (page.length < 500) return results
  }
}

function ageOnDate(dateOfBirth: string | undefined, date: string): number | null {
  if (!dateOfBirth) return null
  const birthDate = dateOfBirth.slice(0, 10)
  const orderDate = date.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) return null
  const birth = new Date(`${birthDate}T00:00:00.000Z`)
  const order = new Date(`${orderDate}T00:00:00.000Z`)
  if (Number.isNaN(birth.getTime()) || Number.isNaN(order.getTime()) || birth.toISOString().slice(0, 10) !== birthDate || order.toISOString().slice(0, 10) !== orderDate || order < birth) return null
  let age = order.getUTCFullYear() - birth.getUTCFullYear()
  if (order.getUTCMonth() < birth.getUTCMonth() || (order.getUTCMonth() === birth.getUTCMonth() && order.getUTCDate() < birth.getUTCDate())) age--
  return age
}

export function labRoutes(repository: OrderRepository, phase1?: Phase1Store): Route[] {
  return [
    route('GET', '/api/dashboard', requires('dashboard.view'), async (context) => {
      context.json(200, await repository.getDashboard())
    }),

    route('GET', '/api/orders', requires('orders.view'), async (context) => {
      context.json(200, await repository.listRecent())
    }),

    route('GET', '/api/reception/orders', requires('orders.view'), async (context) => {
      context.json(200, await repository.listReceptionOrders(parseListPage(context.query)))
    }),

    route('POST', '/api/orders', requires('orders.create'), async (context) => {
      const input = validateReceptionOrderInput(await context.body())
      if (!input) throw new ValidationError('patientId, testIds (unique catalog ids), and priority are invalid.')
      if (!(await repository.getPatientById(input.patientId))) throw new ValidationError('patientId does not reference an existing patient.')
      const discounting = (input.discountPiastres ?? 0) > 0
      if (discounting && !hasCapability(context.user.role, 'catalog.price')) throw new AuthCredentialError('Discount requires catalog.price permission.')
      const order = await repository.createReceptionOrder({ ...input, actor: context.user.displayName, actorId: context.user.id })
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

    route('POST', '/api/catalog', requires('catalog.manage'), async (context) => {
      const input = validateCatalogTestInput(await context.body())
      if (!input) throw new ValidationError('code (A-Z, 0-9, _ or -), name, specimenType, price, and isActive are invalid.')
      const item = await repository.createCatalogTest(input)
      await context.audit({ action: 'catalog.created', entityType: 'test_catalog', entityId: item.id, metadata: { amount: item.price } })
      context.json(201, item)
    }),

    route('PATCH', '/api/catalog/:id', requires('catalog.manage'), async (context) => {
      if (!isUuid(context.params.id)) throw new ValidationError('id must be a valid UUID.')
      const update = validateCatalogTestUpdate(await context.body())
      if (!update) throw new ValidationError('name, specimenType, price, or isActive is invalid.')
      const item = await repository.updateCatalogTest(context.params.id, update)
      await context.audit({ action: 'catalog.updated', entityType: 'test_catalog', entityId: item.id, metadata: { amount: item.price, status: item.isActive ? 'active' : 'inactive' } })
      context.json(200, item)
    }),

    route('GET', '/api/specimens', requires('specimens.view'), async (context) => {
      const statusValue = context.query.get('status')
      if (statusValue !== null && !isSpecimenStatus(statusValue)) throw new ValidationError('status is invalid.')
      context.json(200, await repository.listSpecimens(statusValue ?? undefined, parseListPage(context.query)))
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

    route('POST', '/api/specimens/:barcode/collect-with-override', requires('specimens.overridePayment'), async (context) => {
      const input = validateSpecimenReasonInput(await context.body())
      if (!input) throw new ValidationError('reason must be 1–500 characters.')
      const specimen = await repository.collectSpecimenWithPaymentOverride(requireText(context.params.barcode, 'barcode'))
      await context.audit({ action: 'specimen.payment_override', entityType: 'specimen', entityId: specimen.id, metadata: { reason: input.reason } })
      context.json(200, specimen)
    }),

    route('POST', '/api/specimens/:barcode/reject', requires('specimens.manage'), async (context) => {
      const input = validateSpecimenReasonInput(await context.body())
      if (!input) throw new ValidationError('reason must be 1–500 characters.')
      const specimen = await repository.rejectSpecimen(requireText(context.params.barcode, 'barcode'), input.reason)
      await context.audit({ action: 'specimen.rejected', entityType: 'specimen', entityId: specimen.id, metadata: { reason: input.reason } })
      context.json(200, specimen)
    }),

    route('POST', '/api/specimens/:barcode/receive', requires('specimens.manage'), async (context) => {
      const specimen = await repository.receiveSpecimen(requireText(context.params.barcode, 'barcode'))
      await context.audit({ action: 'specimen.received', entityType: 'specimen', entityId: specimen.id, metadata: { status: specimen.status } })
      context.json(200, specimen)
    }),

    route('GET', '/api/results/worklist', requires('results.view'), async (context) => {
      const items = await repository.listResultWorklist(parseListPage(context.query))
      const results = await allResults(repository)
      const parameters = phase1 ? await phase1.listParameters() : []
      const ranges = phase1 ? await phase1.listRanges() : []
      const releases = new Map<string, Awaited<ReturnType<OrderRepository['listReportReleases']>>>()
      const payload = await Promise.all(items.filter((item) => item.catalogKind === 'lab').map(async (item) => {
        const definitions = parameters.filter((parameter) => parameter.catalogId === item.catalogId)
        const selected = Object.fromEntries(definitions.map((parameter) => [parameter.id, selectApprovedReferenceRange(ranges.filter((range) => range.parameterId === parameter.id), { dateOfBirth: item.patientDateOfBirth ?? undefined, sex: item.patientSex ?? undefined, orderDate: item.orderDate })]))
        const itemResults = results.filter((result) => result.orderItemId === item.orderItemId)
        if (!releases.has(item.orderId)) releases.set(item.orderId, await repository.listReportReleases(item.orderId))
        return { ...item, parameters: definitions.map((parameter) => ({ ...parameter, selectedRange: selected[parameter.id] ?? null, rangeStatus: selected[parameter.id] ? 'approved' : 'no_approved_range' })), fallbackRangeStatus: definitions.length ? undefined : 'no_approved_range', results: itemResults, releases: releases.get(item.orderId) }
      }))
      context.json(200, payload)
    }),

    route('GET', '/api/results', requires('results.view'), async (context) => {
      const orderIdValue = context.query.get('orderId')
      const orderId = orderIdValue === null ? undefined : validateText(orderIdValue, 100)
      if (orderId === null) throw new ValidationError('orderId is invalid.')
      context.json(200, await repository.listResults(orderId, parseListPage(context.query)))
    }),

    route('POST', '/api/results', requires('results.enter'), async (context) => {
      const input = validateResultInput(await context.body())
      if (!input) throw new ValidationError('orderItemId, value, and optional parameterId are invalid.')
      const work = (await allWorklist(repository)).find((item) => item.orderItemId === input.orderItemId && item.catalogKind === 'lab')
      if (!work) throw new RepositoryConflictError('Result requires a received or processing lab specimen.')
      const definitions = phase1 ? await phase1.listParameters(work.catalogId) : []
      if (definitions.length && (!input.parameterId || !definitions.some((parameter) => parameter.id === input.parameterId))) throw new ValidationError('parameterId must belong to the order item catalog item.')
      if (!definitions.length && input.parameterId) throw new ValidationError('parameterId is unavailable for this service.')
      const parameter = input.parameterId ? definitions.find((entry) => entry.id === input.parameterId) : undefined
      const ranges = parameter && phase1 ? (await phase1.listRanges()).filter((range) => range.parameterId === parameter.id) : []
      const evaluation = evaluateResultRange(input.value, { dateOfBirth: work.patientDateOfBirth ?? undefined, sex: work.patientSex ?? undefined, orderDate: work.orderDate }, ranges)
      const labResult = await repository.enterResult(input.orderItemId, input.value, parameter?.unit ?? undefined, rangeText(evaluation.selectedRange), evaluation.flag, context.user.displayName, context.user.id, parameter?.id, evaluation.snapshot ?? undefined)
      await context.audit({ action: 'result.created', entityType: 'result', entityId: labResult.id, metadata: { resultFlag: labResult.flag, status: labResult.status, version: labResult.version, parameterId: labResult.parameterId } })
      context.json(201, labResult)
    }),

    route('POST', '/api/results/:id/review', requires('results.review'), async (context) => {
      const labResult = await repository.reviewResult(requireText(context.params.id, 'id'), context.user.displayName, context.user.id)
      await context.audit({ action: 'result.reviewed', entityType: 'result', entityId: labResult.id, metadata: { status: labResult.status, version: labResult.version } })
      context.json(200, labResult)
    }),

    route('POST', '/api/results/:id/amend', requires('results.enter'), async (context) => {
      const input = validateAmendResultInput(await context.body())
      if (!input) throw new ValidationError('value and reason are required.')
      const previous = (await allResults(repository)).find((result) => result.id === context.params.id)
      if (!previous) throw new RepositoryNotFoundError('Lab result was not found.')
      const work = (await allWorklist(repository)).find((item) => item.orderItemId === previous.orderItemId && item.catalogKind === 'lab')
      if (!work) throw new RepositoryNotFoundError('Original laboratory work item was not found.')
      const definitions = phase1 ? await phase1.listParameters(work.catalogId) : []
      const parameter = previous.parameterId ? definitions.find((entry) => entry.id === previous.parameterId) : undefined
      const ranges = parameter && phase1 ? (await phase1.listRanges()).filter((range) => range.parameterId === parameter.id) : []
      const evaluation = evaluateResultRange(input.value, { dateOfBirth: work.patientDateOfBirth ?? undefined, sex: work.patientSex ?? undefined, orderDate: work.orderDate }, ranges)
      const amended = await repository.amendResult(previous.id, input.value, parameter?.unit ?? undefined, rangeText(evaluation.selectedRange), evaluation.flag, input.reason, context.user.displayName, context.user.id, parameter?.id, evaluation.snapshot ?? undefined)
      await context.audit({ action: 'result.amended', entityType: 'result', entityId: amended.id, metadata: { status: amended.status, version: amended.version } })
      context.json(201, amended)
    }),

    route('GET', '/api/lab-reports/:orderId', requires('labReports.view'), async (context) => {
      const orderId = requireText(context.params.orderId, 'orderId')
      context.json(200, await repository.listReportReleases(orderId))
    }),
    route('GET', '/api/lab-report-releases/:id', requires('labReports.view'), async (context) => {
      const release = await repository.getReportRelease(requireText(context.params.id, 'id'))
      if (!release) throw new RepositoryNotFoundError('Report release was not found.')
      context.json(200, release)
    }),
    route('POST', '/api/lab-reports/:orderId/issue', requires('labReports.issue'), async (context) => {
      const orderId = requireText(context.params.orderId, 'orderId')
      const work = (await allWorklist(repository)).filter((item) => item.orderId === orderId && item.catalogKind === 'lab')
      const reception = (await repository.listReceptionOrders({ limit: 500, offset: 0 })).find((order) => order.id === orderId)
      if (!reception) throw new RepositoryNotFoundError('Order was not found.')
      const expectedItemIds = reception.specimens.map((specimen) => specimen.orderItemId).filter((id): id is string => Boolean(id))
      const workItemIds = new Set(work.map((item) => item.orderItemId))
      if (!expectedItemIds.length || reception.specimens.some((specimen) => !specimen.orderItemId || !['received', 'processing'].includes(specimen.status)) || expectedItemIds.some((id) => !workItemIds.has(id)) || workItemIds.size !== expectedItemIds.length) {
        throw new ValidationError('Every laboratory specimen must be received or processing before report issue.')
      }
      const parameters = phase1 ? await phase1.listParameters() : []
      const resultRows = await allResults(repository, orderId)
      const reportItems = []
      for (const item of work) {
        const definitions = parameters.filter((parameter) => parameter.catalogId === item.catalogId)
        const required = definitions.length ? definitions : [null]
        for (const parameter of required) {
          const candidates = resultRows.filter((result) => result.orderItemId === item.orderItemId && result.parameterId === (parameter?.id ?? null))
          const latest = candidates.sort((a, b) => b.version - a.version)[0]
          if (!latest || latest.status !== 'approved' && latest.status !== 'released') throw new ValidationError('Order has incomplete or unapproved laboratory results.')
          reportItems.push({ test: item.catalogName, parameter: parameter?.nameEn ?? parameter?.nameAr ?? null, value: latest.resultValue, unit: latest.unit, referenceRange: latest.referenceRange, approvedRange: latest.referenceRangeSnapshot, flag: latest.flag, enteredBy: latest.enteredBy, reviewedBy: latest.reviewedBy, version: latest.version, amendmentReason: latest.amendmentReason })
        }
      }
      const settings = phase1 ? await phase1.getSettings() : null
      const patient = await repository.getPatientById(reception.patientId)
      const age = ageOnDate(patient?.dateOfBirth, reception.time)
      const content = { publicOrderNumber: reception.id, patient: { name: patient?.fullName ?? reception.patient, dateOfBirth: patient?.dateOfBirth ?? null, sex: patient?.sex ?? null, age }, practitioner: reception.practitioner, issuedBy: { id: context.user.id, name: context.user.displayName }, issuedAt: new Date().toISOString(), items: reportItems }
      const settingSnapshot = settings ? { nameAr: settings.nameAr, nameEn: settings.nameEn, licenseNumber: settings.licenseNumber, phone: settings.phone, addressAr: settings.addressAr, addressEn: settings.addressEn, reportFooterAr: settings.reportFooterAr, reportFooterEn: settings.reportFooterEn, logoPath: settings.logoPath, sealPath: settings.sealPath, signaturePath: settings.signaturePath, logoMetadata: settings.logoMetadata, sealMetadata: settings.sealMetadata, signatureMetadata: settings.signatureMetadata } : {}
      const release = await repository.releaseReport(orderId, context.user.id, content, settingSnapshot)
      await context.audit({ action: 'lab_report.issued', entityType: 'report_release', entityId: release.id, metadata: { orderId, version: release.version } })
      context.json(201, release)
    }),

    publicRoute('GET', '/api/report-verification/:token', async (context) => {
      const verification = await repository.getPublicReportVerification(requireText(context.params.token, 'token'))
      if (!verification) { context.json(404, { error: 'Not Found' }); return }
      context.json(200, verification)
    }),
  ]
}

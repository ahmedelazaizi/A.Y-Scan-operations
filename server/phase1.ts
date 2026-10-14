import { randomUUID } from 'node:crypto'
import type { Phase1SeedImporter } from './phase1-seed.js'
import { RepositoryConflictError, RepositoryInputError, RepositoryNotFoundError, type RepositoryValue } from './storage/repository.js'

export type MoneyPiastres = number
export type PriceChangeSource = 'manual' | 'bulk_percentage' | 'seed_import'
export type CommissionType = 'percentage' | 'fixed'
export type RangeStatus = 'proposed' | 'approved' | 'stopped'
export type ResultType = 'numeric' | 'qualitative' | 'text'
export type CatalogKind = 'lab' | 'radiology'

export type LabSettings = {
  nameAr: string
  nameEn: string
  licenseNumber: string | null
  phone: string | null
  addressAr: string | null
  addressEn: string | null
  currencyCode: string
  reportFooterAr: string | null
  reportFooterEn: string | null
  logoPath: string | null
  sealPath: string | null
  signaturePath: string | null
  logoMetadata: Record<string, unknown>
  sealMetadata: Record<string, unknown>
  signatureMetadata: Record<string, unknown>
  updatedAt: string
}

export type LabSettingsInput = Omit<LabSettings, 'updatedAt' | 'logoMetadata' | 'sealMetadata' | 'signatureMetadata'> & {
  logoMetadata?: Record<string, unknown>
  sealMetadata?: Record<string, unknown>
  signatureMetadata?: Record<string, unknown>
}

export type Practitioner = {
  id: string
  nameAr: string
  nameEn: string | null
  specialty: string | null
  phone: string | null
  commissionType: CommissionType
  commissionPercent: number | null
  commissionAmountPiastres: MoneyPiastres | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PractitionerInput = Omit<Practitioner, 'id' | 'createdAt' | 'updatedAt'>

export type CatalogItem = {
  id: string
  code: string
  kind: CatalogKind
  sectionAr: string | null
  sectionEn: string | null
  nameAr: string
  nameEn: string | null
  specimen: string | null
  tube: string | null
  resultType: ResultType
  contractPricePiastres: MoneyPiastres
  pricePiastres: MoneyPiastres
  insurancePricePiastres: MoneyPiastres | null
  isActive: boolean
  requiresReview: boolean
  sourceMetadata: Record<string, unknown>
}

export type PriceHistoryEntry = {
  id: string
  catalogId: string
  oldPricePiastres: MoneyPiastres
  newPricePiastres: MoneyPiastres
  actorId: string | null
  source: PriceChangeSource
  createdAt: string
}

export type BulkPriceFilter = { kind?: CatalogKind; sectionAr?: string; includeReviewRequired?: boolean }
export type BulkPricePreview = { percentage: number; filter: BulkPriceFilter; count: number; changes: Array<{ id: string; code: string; oldPricePiastres: number; newPricePiastres: number }> }

export type Bundle = {
  id: string
  code: string
  nameAr: string
  nameEn: string | null
  pricePiastres: MoneyPiastres
  isActive: boolean
  items: Array<{ catalogId: string; code: string; nameAr: string; quantity: number }>
  createdAt: string
  updatedAt: string
}
export type BundleInput = { code: string; nameAr: string; nameEn?: string; pricePiastres: number; isActive?: boolean; items: Array<{ catalogId: string; quantity: number }> }

export type Parameter = {
  id: string
  catalogId: string
  code: string
  nameAr: string
  nameEn: string | null
  sortOrder: number
  resultType: ResultType
  unit: string | null
  specimen: string | null
  tube: string | null
}
export type ParameterInput = Omit<Parameter, 'id'>

export type ReferenceRange = {
  id: string
  parameterId: string
  parameterCode: string | null
  parameterNameAr: string | null
  parameterNameEn: string | null
  catalogId: string | null
  catalogCode: string | null
  catalogNameAr: string | null
  catalogNameEn: string | null
  version: number
  resultType: ResultType
  sex: 'all' | 'male' | 'female'
  ageFromYears: number
  ageToYears: number | null
  low: number | null
  high: number | null
  criticalLow: number | null
  criticalHigh: number | null
  normalText: string | null
  textValue: string | null
  specimen: string | null
  tube: string | null
  note: string | null
  status: RangeStatus
  proposedBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  sourceMetadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ReferenceRangeInput = Omit<ReferenceRange, 'id' | 'parameterCode' | 'parameterNameAr' | 'parameterNameEn' | 'catalogId' | 'catalogCode' | 'catalogNameAr' | 'catalogNameEn' | 'version' | 'status' | 'proposedBy' | 'approvedBy' | 'approvedAt' | 'createdAt' | 'updatedAt'>
export type Phase1SeedReport = { priceRowsSeen: number; priceRowsInserted: number; priceRowsExisting: number; reviewRows: number; rangeRowsSeen: number; rangeRowsInserted: number; importedAt: string }

export type Phase1Store = {
  getSettings(): RepositoryValue<LabSettings>
  updateSettings(input: LabSettingsInput, actorId: string): RepositoryValue<LabSettings>
  listPractitioners(): RepositoryValue<Practitioner[]>
  createPractitioner(input: PractitionerInput): RepositoryValue<Practitioner>
  updatePractitioner(id: string, input: Partial<PractitionerInput>): RepositoryValue<Practitioner>
  listCatalogItems(): RepositoryValue<CatalogItem[]>
  updateCatalogPrice(id: string, pricePiastres: number, actorId: string, source?: PriceChangeSource): RepositoryValue<CatalogItem>
  listPriceHistory(id: string): RepositoryValue<PriceHistoryEntry[]>
  previewBulkPrice(percentage: number, filter: BulkPriceFilter): RepositoryValue<BulkPricePreview>
  applyBulkPrice(percentage: number, filter: BulkPriceFilter, actorId: string): RepositoryValue<{ preview: BulkPricePreview; updated: number }>
  listBundles(): RepositoryValue<Bundle[]>
  createBundle(input: BundleInput): RepositoryValue<Bundle>
  updateBundle(id: string, input: Partial<BundleInput>): RepositoryValue<Bundle>
  listParameters(catalogId?: string): RepositoryValue<Parameter[]>
  createParameter(input: ParameterInput): RepositoryValue<Parameter>
  listRanges(catalogId?: string): RepositoryValue<ReferenceRange[]>
  createRange(input: ReferenceRangeInput, actorId: string): RepositoryValue<ReferenceRange>
  updateRange(id: string, input: Partial<ReferenceRangeInput>, actorId: string): RepositoryValue<ReferenceRange>
  approveRange(id: string, consultantId: string): RepositoryValue<ReferenceRange>
  importSeed(importer: Phase1SeedImporter, importedBy: string | null): RepositoryValue<Phase1SeedReport>
}

function cloneRecord<T>(record: T): T {
  return structuredClone(record)
}

function nowIso(): string { return new Date().toISOString() }
function requireMoney(value: number): number { if (!Number.isSafeInteger(value) || value < 0) throw new RepositoryInputError('Money must be a non-negative integer in piastres.') ; return value }
function requireText(value: string, field: string, max = 200): string { const text = value.trim(); if (!text || text.length > max) throw new RepositoryInputError(`${field} is invalid.`); return text }
function validateCommission(input: PractitionerInput): void {
  if (input.commissionType === 'percentage' && (input.commissionPercent === null || input.commissionPercent < 0 || input.commissionPercent > 100 || input.commissionAmountPiastres !== null)) throw new RepositoryInputError('Percentage commission is invalid.')
  if (input.commissionType === 'fixed' && (input.commissionAmountPiastres === null || !Number.isSafeInteger(input.commissionAmountPiastres) || input.commissionAmountPiastres < 0 || input.commissionPercent !== null)) throw new RepositoryInputError('Fixed commission is invalid.')
}
function matchesFilter(item: CatalogItem, filter: BulkPriceFilter): boolean { return (filter.kind === undefined || item.kind === filter.kind) && (filter.sectionAr === undefined || item.sectionAr === filter.sectionAr) && (filter.includeReviewRequired === true || !item.requiresReview) }
function calculateBulkPrice(price: number, percentage: number): number { return Math.max(0, Math.round(price * (100 + percentage) / 100)) }
function cloneCatalog(item: CatalogItem): CatalogItem { return cloneRecord(item) }

export function createMemoryPhase1Store(): Phase1Store {
  const timestamp = nowIso()
  let settings: LabSettings = { nameAr: 'معمل A.Y Scan', nameEn: 'A.Y Scan Laboratory', licenseNumber: null, phone: null, addressAr: null, addressEn: null, currencyCode: 'EGP', reportFooterAr: null, reportFooterEn: null, logoPath: null, sealPath: null, signaturePath: null, logoMetadata: {}, sealMetadata: {}, signatureMetadata: {}, updatedAt: timestamp }
  let practitioners: Practitioner[] = []
  const catalog: CatalogItem[] = []
  const history: PriceHistoryEntry[] = []
  let bundles: Bundle[] = []
  let parameters: Parameter[] = []
  let ranges: ReferenceRange[] = []

  const findCatalog = (id: string): CatalogItem => { const item = catalog.find((entry) => entry.id === id); if (!item) throw new RepositoryNotFoundError('Catalog item was not found.'); return item }
  const findRange = (id: string): ReferenceRange => { const range = ranges.find((entry) => entry.id === id); if (!range) throw new RepositoryNotFoundError('Reference range was not found.'); return range }
  const buildPreview = (percentage: number, filter: BulkPriceFilter): BulkPricePreview => {
    if (!Number.isFinite(percentage) || percentage < -100 || percentage > 1000) throw new RepositoryInputError('percentage is invalid.')
    const changes = catalog.filter((item) => matchesFilter(item, filter)).map((item) => ({ id: item.id, code: item.code, oldPricePiastres: item.pricePiastres, newPricePiastres: calculateBulkPrice(item.pricePiastres, percentage) }))
    return { percentage, filter, count: changes.length, changes }
  }
  const toBundle = (bundle: Bundle): Bundle => cloneRecord(bundle)
  return {
    getSettings: () => cloneRecord(settings),
    updateSettings: (input) => { settings = { ...settings, ...cloneRecord(input), updatedAt: nowIso() }; return cloneRecord(settings) },
    listPractitioners: () => practitioners.map(cloneRecord),
    createPractitioner: (input) => { validateCommission(input); const created = { ...cloneRecord(input), id: randomUUID(), createdAt: nowIso(), updatedAt: nowIso() }; practitioners = [created, ...practitioners]; return cloneRecord(created) },
    updatePractitioner: (id, input) => { const current = practitioners.find((entry) => entry.id === id); if (!current) throw new RepositoryNotFoundError('Practitioner was not found.'); const next = { ...current, ...cloneRecord(input), updatedAt: nowIso() }; validateCommission(next); Object.assign(current, next); return cloneRecord(current) },
    listCatalogItems: () => catalog.map(cloneCatalog),
    updateCatalogPrice: (id, pricePiastres, actorId, source = 'manual') => { const item = findCatalog(id); const nextPrice = requireMoney(pricePiastres); if (item.pricePiastres !== nextPrice) history.unshift({ id: randomUUID(), catalogId: id, oldPricePiastres: item.pricePiastres, newPricePiastres: nextPrice, actorId, source, createdAt: nowIso() }); item.pricePiastres = nextPrice; return cloneCatalog(item) },
    listPriceHistory: (id) => history.filter((entry) => entry.catalogId === id).map(cloneRecord),
    previewBulkPrice: buildPreview,
    applyBulkPrice: (percentage, filter, actorId) => { const preview = buildPreview(percentage, filter); for (const change of preview.changes) { const item = findCatalog(change.id); if (item.pricePiastres !== change.newPricePiastres) history.unshift({ id: randomUUID(), catalogId: item.id, oldPricePiastres: item.pricePiastres, newPricePiastres: change.newPricePiastres, actorId, source: 'bulk_percentage', createdAt: nowIso() }); item.pricePiastres = change.newPricePiastres } return { preview, updated: preview.changes.length } },
    listBundles: () => bundles.map(toBundle),
    createBundle: (input) => { requireText(input.code, 'code', 64); requireMoney(input.pricePiastres); const bundle = { ...cloneRecord(input), id: randomUUID(), nameEn: input.nameEn ?? null, isActive: input.isActive ?? true, items: input.items.map((entry) => ({ ...entry, code: findCatalog(entry.catalogId).code, nameAr: findCatalog(entry.catalogId).nameAr })), createdAt: nowIso(), updatedAt: nowIso() }; bundles = [bundle, ...bundles]; return toBundle(bundle) },
    updateBundle: (id, input) => { const bundle = bundles.find((entry) => entry.id === id); if (!bundle) throw new RepositoryNotFoundError('Bundle was not found.'); if (input.pricePiastres !== undefined) requireMoney(input.pricePiastres); Object.assign(bundle, cloneRecord(input), { updatedAt: nowIso() }); return toBundle(bundle) },
    listParameters: (catalogId) => parameters.filter((entry) => catalogId === undefined || entry.catalogId === catalogId).map(cloneRecord),
    createParameter: (input) => { requireText(input.code, 'code', 64); const parameter = { ...cloneRecord(input), id: randomUUID() }; parameters = [parameter, ...parameters]; return cloneRecord(parameter) },
    listRanges: (catalogId) => { const ids = catalogId ? new Set(parameters.filter((entry) => entry.catalogId === catalogId).map((entry) => entry.id)) : null; return ranges.filter((entry) => !ids || ids.has(entry.parameterId)).map(cloneRecord) },
    createRange: (input, actorId) => { const created = { ...cloneRecord(input), id: randomUUID(), parameterCode: null, parameterNameAr: null, parameterNameEn: null, catalogId: null, catalogCode: null, catalogNameAr: null, catalogNameEn: null, version: 1, status: 'proposed' as const, proposedBy: actorId, approvedBy: null, approvedAt: null, createdAt: nowIso(), updatedAt: nowIso() }; ranges = [created, ...ranges]; return cloneRecord(created) },
    updateRange: (id, input, actorId) => { const current = findRange(id); const next = { ...current, ...cloneRecord(input), id: randomUUID(), version: current.version + 1, status: 'proposed' as const, proposedBy: actorId, approvedBy: null, approvedAt: null, createdAt: nowIso(), updatedAt: nowIso() }; ranges = [next, ...ranges]; return cloneRecord(next) },
    approveRange: (id, consultantId) => { const range = findRange(id); if (range.status !== 'proposed') throw new RepositoryConflictError('Only proposed ranges can be approved.'); range.status = 'approved'; range.approvedBy = consultantId; range.approvedAt = nowIso(); range.updatedAt = nowIso(); return cloneRecord(range) },
    importSeed: async (importer, importedBy) => importer.run(importedBy),
  }
}

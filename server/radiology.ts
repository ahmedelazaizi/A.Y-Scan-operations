export type RadiologyModality = 'xray' | 'ct' | 'mri' | 'ultrasound' | 'mammography' | 'pet_ct' | 'other'
export type RadiologyPriority = 'normal' | 'urgent' | 'stat'
export type RadiologyStudyStatus = 'scheduled' | 'in_progress' | 'reported' | 'verified' | 'cancelled'

import type { InvoiceStatus } from './billing.js'

export type RadiologyOrderItem = {
  orderItemId: string
  orderId: string
  publicOrderId: string
  patientId: string
  patientName: string
  catalogCode: string
  catalogName: string
  invoiceNumber: string | null
  invoiceStatus: InvoiceStatus | null
}

export type RadiologyStudy = {
  orderItemId: string | null
  orderId: string | null
  publicOrderId: string | null
  patientName: string | null
  catalogCode: string | null
  catalogName: string | null
  invoiceNumber: string | null
  invoiceStatus: InvoiceStatus | null
  id: string
  accessionNumber: string
  patientId: string
  modality: RadiologyModality
  bodyPart: string
  priority: RadiologyPriority
  status: RadiologyStudyStatus
  scheduledAt: string | null
  performedAt: string | null
  reportText: string | null
  impression: string | null
  referringProvider: string | null
  verifiedBy: string | null
  createdAt: string
  updatedAt: string
}

export const RADIOLOGY_MODALITIES: readonly RadiologyModality[] = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'pet_ct', 'other']
export const RADIOLOGY_PRIORITIES: readonly RadiologyPriority[] = ['normal', 'urgent', 'stat']
export const RADIOLOGY_STATUSES: readonly RadiologyStudyStatus[] = ['scheduled', 'in_progress', 'reported', 'verified', 'cancelled']

export function isRadiologyModality(value: unknown): value is RadiologyModality {
  return typeof value === 'string' && RADIOLOGY_MODALITIES.includes(value as RadiologyModality)
}

export function isRadiologyPriority(value: unknown): value is RadiologyPriority {
  return typeof value === 'string' && RADIOLOGY_PRIORITIES.includes(value as RadiologyPriority)
}

export function isRadiologyStudyStatus(value: unknown): value is RadiologyStudyStatus {
  return typeof value === 'string' && RADIOLOGY_STATUSES.includes(value as RadiologyStudyStatus)
}

export function cloneRadiologyStudy(study: RadiologyStudy): RadiologyStudy {
  return { ...study }
}

import { ROLES, type Role } from './auth/types.js'

const ALL: readonly Role[] = ROLES
const FRONT_DESK: readonly Role[] = ['branch_manager', 'receptionist']
const LAB: readonly Role[] = ['branch_manager', 'lab_technician']
const FINANCE: readonly Role[] = ['branch_manager', 'accountant']

/**
 * Single source of truth for authorization. Routes declare a capability, and /api/auth/me returns the
 * caller's capabilities so the web app can hide what the server would refuse anyway.
 * `admin` is implicitly granted everything (see hasCapability).
 */
export const CAPABILITIES = {
  'dashboard.view': ALL,
  'patients.view': ALL,
  'patients.create': [...FRONT_DESK, 'lab_technician', 'radiologist'],
  'orders.view': ALL,
  'orders.create': FRONT_DESK,
  'catalog.view': ALL,
  'catalog.manage': ['branch_manager'],
  'specimens.view': [...FRONT_DESK, 'lab_technician'],
  'specimens.manage': [...FRONT_DESK, 'lab_technician'],
  'results.view': [...FRONT_DESK, 'lab_technician'],
  'results.enter': LAB,
  'results.review': LAB,
  'billing.view': [...FINANCE, 'receptionist'],
  'billing.manage': [...FINANCE, 'receptionist'],
  'radiology.view': [...FRONT_DESK, 'radiologist'],
  'radiology.schedule': [...FRONT_DESK, 'radiologist'],
  'radiology.perform': ['branch_manager', 'radiologist'],
  'radiology.report': ['branch_manager', 'radiologist'],
  'inventory.view': ['branch_manager', 'lab_technician', 'radiologist', 'accountant'],
  'inventory.manageItems': ['branch_manager'],
  'inventory.move': ['branch_manager', 'lab_technician', 'radiologist'],
  'insurance.view': [...FINANCE, 'receptionist'],
  'insurance.policies': [...FINANCE, 'receptionist'],
  'insurance.claims': FINANCE,
  'homeVisits.view': [...FRONT_DESK, 'lab_technician'],
  'homeVisits.schedule': FRONT_DESK,
  'homeVisits.update': [...FRONT_DESK, 'lab_technician'],
  'devices.view': LAB,
  'devices.manage': ['branch_manager'],
  'devices.check': LAB,
  'reports.view': FINANCE,
  'audit.view': ['branch_manager'],
  'users.manage': [],
} as const satisfies Record<string, readonly Role[]>

export type Capability = keyof typeof CAPABILITIES

export function hasCapability(role: Role, capability: Capability): boolean {
  return role === 'admin' || (CAPABILITIES[capability] as readonly Role[]).includes(role)
}

export function capabilitiesFor(role: Role): Capability[] {
  return (Object.keys(CAPABILITIES) as Capability[]).filter((capability) => hasCapability(role, capability))
}

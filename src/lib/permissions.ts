export type Role = 'admin' | 'doctor' | 'staff'

export const ROLES: readonly Role[] = ['admin', 'doctor', 'staff'] as const

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  staff: 'Staff',
}

/**
 * Every capability the UI gates on, in one table, mirroring the backend's
 * guards. The server is still the authority — this exists so we never render
 * a control that is going to 403, not to enforce anything.
 *
 * Read access to the clinical areas is granted to any signed-in user, so those
 * capabilities are not listed; only writes and restricted areas are.
 */
const CAPABILITIES = {
  'patients.write': ['doctor', 'admin'],
  'prescriptions.write': ['doctor', 'admin'],
  'appointments.write': ['doctor', 'admin'],
  'medicines.write': ['admin'],
  'speech.use': ['doctor', 'admin'],
  'clinic.write': ['admin'],
  'users.manage': ['admin'],
  'audit.read': ['admin'],
  'portfolio.manage': ['admin'],
} as const satisfies Record<string, readonly Role[]>

export type Capability = keyof typeof CAPABILITIES

export function roleCan(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false
  return (CAPABILITIES[capability] as readonly Role[]).includes(role)
}

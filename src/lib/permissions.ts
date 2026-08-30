import type { BadgeTone } from '@/components/ui/Badge'

/**
 * Access has two independent axes, and conflating them is the mistake this
 * file exists to prevent.
 *
 * A **permission** decides WHAT a user may do. Roles are database rows now, so
 * the clinic can invent "Receptionist" or "Junior registrar" at any time and
 * hand it whatever permission set it likes. There is therefore no static table
 * mapping a role name to capabilities — `useAuth().can()` reads the live
 * permission list the server returned for the signed-in user.
 *
 * A **level** decides TO WHOM a user may do it — who they can see, edit and
 * assign roles to. It is a number, not a rank of capability.
 *
 * Neither axis may be inferred from the other. A level-90 role with only
 * `patient.read` can read patients and nothing else; a level-10 role holding
 * `prescription.void` can void prescriptions. The only exception is the
 * superadmin flag, which the server sets and which bypasses the permission
 * check entirely.
 *
 * As before, the server remains the authority. Everything here exists so we
 * never render a control that is going to come back 403 — not to enforce
 * anything.
 */
export const PERMISSIONS = [
  'patient.read',
  'patient.write',
  'appointment.read',
  'appointment.write',
  'appointment.cancel',
  'prescription.read',
  'prescription.write',
  'prescription.void',
  'prescription.print',
  'medicine.read',
  'medicine.write',
  'advice.read',
  'advice.write',
  'clinic.read',
  'clinic.write',
  'portfolio.read',
  'portfolio.write',
  'upload.write',
  'speech.use',
  'extraction.use',
  'audit.read',
  'dashboard.read',
  'user.read',
  'user.create',
  'user.update',
  'user.reset_password',
  'role.manage',
  'system.monitor',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Permissions the server refuses to grant to a non-superadmin role, whatever
 * its level. A role editor must show them as locked rather than let someone
 * build a set the API will reject.
 */
export const RESERVED_PERMISSIONS = ['role.manage', 'system.monitor'] as const

export const SUPERADMIN_LEVEL = 100
export const DOCTOR_LEVEL = 60
export const STAFF_LEVEL = 40

/**
 * Role names and levels are server-owned, so a badge cannot key off a known
 * `key` any more — a custom role can sit at any level with any name. Presentation
 * is therefore derived from the level band alone, which keeps the three tones
 * the app already used (superadmin reads as accent, the clinical band as info,
 * everyone else as neutral) while letting a role nobody anticipated land
 * somewhere sensible.
 */
export function roleTone(level: number): BadgeTone {
  if (level >= SUPERADMIN_LEVEL) return 'accent'
  if (level >= DOCTOR_LEVEL) return 'info'
  return 'neutral'
}

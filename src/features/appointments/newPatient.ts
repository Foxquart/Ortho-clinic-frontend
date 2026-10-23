/**
 * The "book for someone new" path: validate the quick-add fields and turn them
 * into the inline `patient` object `POST /appointments` accepts. The server
 * finds-or-creates by phone, exactly as it does for a prescription.
 */

import type { Gender, PatientUpsert } from '../../api/schema'
import { ageToDob } from '../patients/age'

export interface NewPatientValues {
  first_name: string
  last_name: string
  phone: string
  gender: '' | Gender
  /** Typed as text so a blank box means "not given", not 0. */
  age_years: string
  age_months: string
}

export const BLANK_NEW_PATIENT: NewPatientValues = {
  first_name: '',
  last_name: '',
  phone: '',
  gender: '',
  age_years: '',
  age_months: '',
}

/** Mirrors `PatientUpsert`'s bounds (1..64, 1..64, 6..20) plus a sane age range. */
export function newPatientIssues(v: NewPatientValues): Partial<Record<keyof NewPatientValues, string>> {
  const out: Partial<Record<keyof NewPatientValues, string>> = {}
  const name = (value: string, missing: string) =>
    value.trim() === '' ? missing : value.trim().length > 64 ? 'Keep it under 64 characters' : undefined

  const first = name(v.first_name, 'First name needed')
  const last = name(v.last_name, 'Last name needed')
  if (first) out.first_name = first
  if (last) out.last_name = last

  const phone = v.phone.trim()
  if (phone.length < 6 || phone.length > 20) out.phone = 'Phone must be 6–20 characters'

  const years = v.age_years.trim()
  const months = v.age_months.trim()
  if (years && (!/^\d{1,3}$/.test(years) || Number(years) > 120)) out.age_years = 'Years: 0–120'
  else if (months && (!/^\d{1,2}$/.test(months) || Number(months) > 11)) out.age_months = 'Months: 0–11'
  return out
}

export function toInlinePatient(v: NewPatientValues, today = new Date()): PatientUpsert {
  const hasAge = v.age_years.trim() !== '' || v.age_months.trim() !== ''
  return {
    first_name: v.first_name.trim(),
    last_name: v.last_name.trim(),
    phone: v.phone.trim(),
    ...(v.gender && { gender: v.gender }),
    ...(hasAge && {
      date_of_birth: ageToDob(Number(v.age_years) || 0, Number(v.age_months) || 0, today),
    }),
  }
}

/**
 * Head start for the quick-add from whatever was typed in the search box:
 * digits go to phone, words to first/last name. (Same idea as the prescription
 * pad's `seedFromQuery`, which is private to that file.)
 */
export function seedFromQuery(query: string): Pick<NewPatientValues, 'first_name' | 'last_name' | 'phone'> {
  const q = query.trim()
  if (/^[\d\s+()\-.]+$/.test(q) && q.replace(/\D/g, '').length >= 4) {
    return { first_name: '', last_name: '', phone: q }
  }
  const [first = '', ...rest] = q.split(/\s+/).filter(Boolean)
  return { first_name: first, last_name: rest.join(' '), phone: '' }
}

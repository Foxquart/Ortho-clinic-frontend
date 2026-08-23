/**
 * Vitals live inside `PatientResponse.medical_history`, which the API stores
 * verbatim as a free-form JSON object (`additionalProperties: true`). They sit
 * under one namespaced `vitals` key so nothing else the object carries is ever
 * disturbed:
 *
 *   medical_history: {
 *     ...anything already there,        // always preserved on write
 *     vitals: {
 *       bp: "120/80",                   // systolic/diastolic mmHg
 *       weight_kg: 72.5,
 *       spo2: 98,                       // %
 *       pulse_bpm: 76,
 *       recorded_at: "2026-08-15",      // ISO date of last entry/change
 *     }
 *   }
 *
 * Reads are defensive (the object may hold absolutely anything); writes are
 * spread-preserving (unknown keys survive every save).
 */

import type { JsonObject } from '@/api/schema'

/** The measurements themselves. Every field optional: absent means not taken. */
export interface VitalsMeasurements {
  /** Blood pressure as entered, `systolic/diastolic` in mmHg, e.g. `"120/80"`. */
  bp?: string
  weight_kg?: number
  /** Peripheral oxygen saturation, percent. */
  spo2?: number
  pulse_bpm?: number
}

export interface Vitals extends VitalsMeasurements {
  /** ISO date (`YYYY-MM-DD`) the vitals were last entered or changed. */
  recorded_at?: string
}

const VITALS_KEY = 'vitals'

function asFilledString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Pull the vitals block out of a `medical_history` object. Tolerates a missing
 * history, a missing block, and garbage in any slot — a wrong-typed field is
 * simply treated as not recorded.
 */
export function readVitals(medicalHistory: JsonObject | null | undefined): Vitals {
  const raw = medicalHistory?.[VITALS_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const block = raw as Record<string, unknown>

  const out: Vitals = {}
  const bp = asFilledString(block.bp)
  if (bp !== undefined) out.bp = bp
  const weight = asFiniteNumber(block.weight_kg)
  if (weight !== undefined) out.weight_kg = weight
  const spo2 = asFiniteNumber(block.spo2)
  if (spo2 !== undefined) out.spo2 = spo2
  const pulse = asFiniteNumber(block.pulse_bpm)
  if (pulse !== undefined) out.pulse_bpm = pulse
  const recordedAt = asFilledString(block.recorded_at)
  if (recordedAt !== undefined) out.recorded_at = recordedAt
  return out
}

/** True when at least one measurement (not just `recorded_at`) is present. */
export function hasMeasurements(vitals: VitalsMeasurements): boolean {
  return (
    vitals.bp !== undefined ||
    vitals.weight_kg !== undefined ||
    vitals.spo2 !== undefined ||
    vitals.pulse_bpm !== undefined
  )
}

/** True when the two sets of measurements match. `recorded_at` is ignored. */
export function sameMeasurements(a: VitalsMeasurements, b: VitalsMeasurements): boolean {
  return (
    a.bp === b.bp &&
    a.weight_kg === b.weight_kg &&
    a.spo2 === b.spo2 &&
    a.pulse_bpm === b.pulse_bpm
  )
}

/**
 * Merge a vitals block into `medical_history` without dropping any other key
 * the object already holds. Empty measurements remove the block entirely, and
 * an object left with no keys collapses to `null` — the API's own "nothing
 * recorded" value.
 */
export function writeVitals(
  medicalHistory: JsonObject | null | undefined,
  vitals: Vitals,
): JsonObject | null {
  const base: JsonObject =
    medicalHistory && typeof medicalHistory === 'object' && !Array.isArray(medicalHistory)
      ? { ...medicalHistory }
      : {}

  if (hasMeasurements(vitals)) base[VITALS_KEY] = { ...vitals }
  else delete base[VITALS_KEY]

  return Object.keys(base).length > 0 ? base : null
}

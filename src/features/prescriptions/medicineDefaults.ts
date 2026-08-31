/**
 * Filling a row from the medicine's own prescription defaults.
 *
 * A medicine record can carry `default_*` fields — the frequency, duration,
 * food timing and instructions this doctor writes for it nine times out of
 * ten. Choosing that medicine fills the row so the doctor taps once and
 * verifies instead of typing several fields.
 *
 * Two rules keep this honest:
 *
 *  1. **Only blank fields are filled, and always as `defaulted`.** A value the
 *     doctor typed, dictated, or already carried over is never overwritten,
 *     and everything this module writes wears the "Carried over" rail so it
 *     reads as an assumption to verify, not a decision already made.
 *  2. **A medicine swap never leaves drug A's values on drug B.** Before the
 *     new medicine's defaults land, every field still carrying `defaulted`
 *     provenance is cleared back to blank. Anything the doctor touched
 *     (`entered`) or spoke (`heard`) survives the swap untouched.
 *
 * `food` and `prn` are plain values on the row with no provenance of their
 * own, so this module keeps its own note of what it set them to, per row key.
 * On a swap, `food` is cleared only when it still equals the value this module
 * put there — a food timing the doctor picked by hand survives.
 */

import type { MedicineResponse } from '@/api/schema'
import { blank, defaulted, type RxRow } from './model'

interface AppliedDefaults {
  /** The food timing this module set from the medicine's defaults, if any. */
  food: RxRow['food']
  /** Whether `prn` was switched on because the default frequency was SOS. */
  prn: boolean
}

/**
 * What defaults are currently sitting on each row, keyed by the client row
 * key. Module-level bookkeeping in the same spirit as `nextRowKey`'s counter:
 * row keys are globally unique per session, and entries are dropped when the
 * row is removed.
 */
const appliedByRow = new Map<string, AppliedDefaults>()

/** Call when a row leaves the pad, so the bookkeeping does not outlive it. */
export function forgetAppliedDefaults(rowKey: string): void {
  appliedByRow.delete(rowKey)
}

/**
 * Select `medicine` on `row`: set the id and name, clear a previous
 * medicine's defaults on a swap, then fill still-blank fields from the new
 * medicine's `default_*` values.
 *
 * Idempotent for a given `(row, medicine)` pair, so it is safe inside a state
 * updater that React may run twice.
 */
export function applyMedicineDefaults(row: RxRow, medicine: MedicineResponse): RxRow {
  const prev = appliedByRow.get(row.key)
  const swap = row.medicineId !== null && row.medicineId !== medicine.id

  let next: RxRow = { ...row, medicineId: medicine.id, medicineName: medicine.name }

  if (swap) {
    // Drug A's defaults must not survive onto drug B. `defaulted` provenance
    // is exactly the set of values the doctor has not yet made their own —
    // whether they came from these medicine defaults or from a carried-over
    // prescription — so all of it goes back to blank before drug B's arrive.
    if (next.frequency.provenance === 'defaulted') {
      next = {
        ...next,
        frequency: blank(''),
        // The SOS mirror was ours; it leaves with the frequency it mirrored.
        prn: prev?.prn ? false : next.prn,
      }
    }
    if (next.durationDays.provenance === 'defaulted') {
      next = { ...next, durationDays: blank(null) }
    }
    if (next.quantity.provenance === 'defaulted') next = { ...next, quantity: blank(null) }
    if (next.instructions.provenance === 'defaulted') {
      next = { ...next, instructions: blank('') }
    }
    if (prev && prev.food !== null && next.food === prev.food) next = { ...next, food: null }
  }

  // What this call leaves on the row. Same-medicine reselects carry the old
  // note forward as long as the doctor has not replaced the value themselves.
  const carried = !swap && prev ? prev : null
  const record: AppliedDefaults = {
    food: carried && carried.food !== null && next.food === carried.food ? carried.food : null,
    prn: carried?.prn === true && next.prn,
  }

  const frequency = medicine.default_frequency?.trim()
  if (next.frequency.provenance === 'blank' && frequency) {
    // A default of SOS means as-needed, exactly like the SOS chip: the row is
    // marked PRN alongside the frequency string.
    const sos = frequency.toUpperCase() === 'SOS'
    next = { ...next, frequency: defaulted(frequency), prn: sos ? true : next.prn }
    record.prn = sos
  }

  if (
    next.durationDays.provenance === 'blank' &&
    medicine.default_duration_days != null &&
    medicine.default_duration_days > 0
  ) {
    next = { ...next, durationDays: defaulted(medicine.default_duration_days) }
  }

  if (next.food === null && medicine.default_food_timing) {
    next = { ...next, food: medicine.default_food_timing }
    record.food = medicine.default_food_timing
  }

  const instructions = medicine.default_instructions?.trim()
  if (next.instructions.provenance === 'blank' && instructions) {
    next = { ...next, instructions: defaulted(instructions) }
  }

  appliedByRow.set(row.key, record)
  return next
}

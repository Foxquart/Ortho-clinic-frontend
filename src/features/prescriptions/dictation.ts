/**
 * The dictation hand-off.
 *
 * The speech engine writes a `ParsedDictation` to `sessionStorage` under
 * `ortho:dictation-draft` and sends the doctor here. This module is the only
 * place that touches that key.
 *
 * Two rules govern everything below:
 *
 *  1. **Everything that arrives is `heard()`, never `entered()`.** The system
 *     transcribed it; the doctor has not yet looked at it. Those are different
 *     levels of trust and the pad renders them differently.
 *  2. **Nothing is silently dropped.** A payload we cannot read, a medicine we
 *     cannot resolve, a sentence the parser could not place — all of it stays
 *     visible somewhere. The doctor said it out loud; it does not get to
 *     vanish because a regex missed.
 */

import { addDays } from 'date-fns'
import type { MedicineResponse } from '@/api/schema'
import type { ParsedDictation, ParsedRow } from '@/features/speech/parser'
import { toIsoDate } from '@/lib/format'
import {
  EMPTY_SCHEDULE,
  blank,
  defaulted,
  heard,
  newRow,
  type DoseSchedule,
  type RxDraft,
  type RxRow,
} from './model'

/** The hand-off key. Owned by the speech feature; read exactly once, here. */
export const DICTATION_STORAGE_KEY = 'ortho:dictation-draft'

/* -------------------------------------------------------------------------- */
/*  Reading the hand-off                                                       */
/* -------------------------------------------------------------------------- */

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function slot(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function schedule(value: unknown): DoseSchedule | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const next: DoseSchedule = { m: slot(raw.m), a: slot(raw.a), n: slot(raw.n) }
  // An all-null "schedule" is not a schedule; it is silence. Keep it blank so
  // it blocks printing rather than pretending the doctor set a timing.
  return next.m === null && next.a === null && next.n === null ? null : next
}

function food(value: unknown): RxRow['food'] {
  return value === 'before' || value === 'after' || value === 'with' ? value : null
}

function parsedRow(value: unknown): ParsedRow | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const spokenName = text(raw.spokenName)
  if (!spokenName) return null
  return {
    spokenName,
    dosage: text(raw.dosage),
    schedule: schedule(raw.schedule),
    durationDays: count(raw.durationDays),
    food: food(raw.food),
    prn: raw.prn === true,
    instructions: text(raw.instructions),
    sourceText: text(raw.sourceText) ?? spokenName,
  }
}

/**
 * Coerce whatever is in `sessionStorage` into a `ParsedDictation`.
 *
 * Written defensively on purpose: this payload crosses a process boundary
 * between two independently-shipped features. A malformed one must degrade to
 * "no dictation arrived", never to a white screen over a half-written
 * prescription.
 */
export function normaliseDictation(value: unknown): ParsedDictation | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  const rows = Array.isArray(raw.rows)
    ? raw.rows.map(parsedRow).filter((row): row is ParsedRow => row !== null)
    : []

  const unparsed = Array.isArray(raw.unparsed)
    ? raw.unparsed.map(text).filter((line): line is string => line !== null)
    : []

  const dictation: ParsedDictation = {
    rows,
    diagnosis: text(raw.diagnosis),
    chiefComplaint: text(raw.chiefComplaint),
    advice: text(raw.advice),
    investigations: text(raw.investigations),
    followUpDays: count(raw.followUpDays),
    unparsed,
  }

  const empty =
    rows.length === 0 &&
    unparsed.length === 0 &&
    dictation.diagnosis === null &&
    dictation.chiefComplaint === null &&
    dictation.advice === null &&
    dictation.investigations === null &&
    dictation.followUpDays === null

  return empty ? null : dictation
}

/**
 * Read and consume the hand-off.
 *
 * Consuming is deliberate: a reload must not replay a dictation the doctor has
 * already corrected. Losing an unread hand-off to an accidental refresh is the
 * lesser harm — the alternative is silently overwriting edits.
 */
export function takeDictationHandoff(): ParsedDictation | null {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(DICTATION_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    window.sessionStorage.removeItem(DICTATION_STORAGE_KEY)
  } catch {
    // A storage quota or privacy-mode failure here is not worth a message.
  }

  try {
    return normaliseDictation(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/*  Turning it into a draft                                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Restating a dose the grid already gave us                                  */
/* -------------------------------------------------------------------------- */

/**
 * Countable dose forms, and how to name one and several of them.
 *
 * Deliberately only the forms where a schedule slot *is* a unit count. "1-0-1"
 * of a tablet is one tablet twice a day. "1-0-1" of a syrup is one *dose*
 * twice a day, and the volume of that dose was never spoken — so syrups,
 * injections, ointments and drops are absent from this table on purpose.
 */
const COUNTABLE_FORMS: Readonly<Record<string, { one: string; many: string }>> = {
  tab: { one: 'tab', many: 'tabs' },
  tabs: { one: 'tab', many: 'tabs' },
  tablet: { one: 'tab', many: 'tabs' },
  tablets: { one: 'tab', many: 'tabs' },
  cap: { one: 'cap', many: 'caps' },
  caps: { one: 'cap', many: 'caps' },
  capsule: { one: 'cap', many: 'caps' },
  capsules: { one: 'cap', many: 'caps' },
  sachet: { one: 'sachet', many: 'sachets' },
  sachets: { one: 'sachet', many: 'sachets' },
  patch: { one: 'patch', many: 'patches' },
  supp: { one: 'suppository', many: 'suppositories' },
  suppository: { one: 'suppository', many: 'suppositories' },
}

/** The dose form the doctor actually said, if it was a countable one. */
function spokenCountableForm(sourceText: string): { one: string; many: string } | null {
  for (const word of sourceText.toLowerCase().split(/[^a-z]+/)) {
    const form = COUNTABLE_FORMS[word]
    if (form) return form
  }
  return null
}

/**
 * Restate the amount per administration that the schedule already contains.
 *
 * The parser will not turn "tab Zerodol SP one zero one" into a dose, and it
 * is right not to: inventing a dose is the failure this whole model exists to
 * prevent. But it is worth being precise about what is actually missing there.
 * The doctor said a dose *form* ("tab") and a grid whose numbers are unit
 * counts ("1-0-1" is one tablet in the morning and one at night — the parser's
 * own `scaleSchedule` treats "two tabs twice a day" as 2-0-2 for exactly this
 * reason). "1 tab" is therefore a restatement of two things the doctor said,
 * not a third thing we made up.
 *
 * So this fills the dose — as `defaulted`, never `heard`, so it wears the
 * "verify me" rail and reads as assumed — and only when it is unambiguous:
 *
 *  - a countable form was spoken (no form, no restatement);
 *  - every dosing slot carries the *same* count, so "per administration" has a
 *    single answer. A 1-0-0.5 taper does not, and stays blank.
 *
 * Anything outside that stays blank and keeps blocking the print, which is
 * where the friction belongs: on the rows that genuinely lack information.
 */
export function dosageFromSchedule(parsed: ParsedRow): string | null {
  if (parsed.dosage !== null || parsed.schedule === null) return null

  const form = spokenCountableForm(parsed.sourceText)
  if (!form) return null

  const doses = [parsed.schedule.m, parsed.schedule.a, parsed.schedule.n].filter(
    (v): v is number => v !== null && v > 0,
  )
  if (doses.length === 0) return null

  const first = doses[0]
  if (!doses.every((v) => v === first)) return null

  return `${first} ${first === 1 ? form.one : form.many}`
}

/**
 * One dictated line becomes one row, with the medicine deliberately left
 * **unresolved**: `medicineId` stays null and `medicineName` holds the spoken
 * words. Resolution happens against the formulary afterwards, and until it
 * succeeds the row visibly blocks printing.
 */
export function rowFromDictation(key: string, parsed: ParsedRow): RxRow {
  const restated = dosageFromSchedule(parsed)
  return {
    ...newRow(key),
    medicineId: null,
    medicineName: parsed.spokenName,
    dosage: parsed.dosage
      ? heard(parsed.dosage)
      : restated
        ? defaulted(restated)
        : blank(''),
    schedule: parsed.schedule ? heard(parsed.schedule) : blank(EMPTY_SCHEDULE),
    durationDays: parsed.durationDays !== null ? heard(parsed.durationDays) : blank(null),
    instructions: parsed.instructions ? heard(parsed.instructions) : blank(''),
    prn: parsed.prn,
    food: parsed.food,
  }
}

/**
 * Fold a dictation into a draft. Only blank fields are filled — if the doctor
 * has already typed a diagnosis, the transcript does not get to overwrite it.
 * Dictated rows are appended, never substituted.
 */
export function applyDictation(
  draft: RxDraft,
  parsed: ParsedDictation,
  /** One key per parsed row, allocated by the caller so this stays pure. */
  rowKeys: readonly string[],
): RxDraft {
  const fill = (
    current: RxDraft['diagnosis'],
    value: string | null,
  ): RxDraft['diagnosis'] =>
    value !== null && current.provenance === 'blank' ? heard(value) : current

  const followUp =
    parsed.followUpDays !== null && draft.followUpDate.provenance === 'blank'
      ? heard(toIsoDate(addDays(new Date(), parsed.followUpDays)))
      : draft.followUpDate

  const dictatedRows = parsed.rows.map((row, index) =>
    rowFromDictation(rowKeys[index] ?? `dictated-${index}`, row),
  )

  return {
    ...draft,
    diagnosis: fill(draft.diagnosis, parsed.diagnosis),
    chiefComplaint: fill(draft.chiefComplaint, parsed.chiefComplaint),
    advice: fill(draft.advice, parsed.advice),
    investigations: fill(draft.investigations, parsed.investigations),
    followUpDate: followUp,
    rows: [...draft.rows, ...dictatedRows],
  }
}

/* -------------------------------------------------------------------------- */
/*  Resolving a spoken medicine against the formulary                          */
/* -------------------------------------------------------------------------- */

/** Strip case, punctuation and spacing so "Tab. Ultracet-P" ≈ "ultracet p". */
export function normaliseMedicineName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Decide whether a search result is safe to select on the doctor's behalf.
 *
 * The server's `pg_trgm` ranking already tolerates mishearings, so the results
 * are never filtered here — they are only *ranked for confidence*. Auto-select
 * happens on unambiguous name equality, or on a single result that genuinely
 * contains (or is contained by) what was heard. Everything else stays
 * unmatched, because picking the wrong drug silently is the worst thing this
 * screen could do.
 */
export function confidentMatch(
  spokenName: string,
  results: readonly MedicineResponse[],
): MedicineResponse | null {
  const target = normaliseMedicineName(spokenName)
  if (!target || results.length === 0) return null

  const equal = results.filter((m) =>
    [m.name, m.generic_name, m.brand_name]
      .filter((n): n is string => Boolean(n))
      .some((n) => normaliseMedicineName(n) === target),
  )
  if (equal.length === 1) return equal[0]
  if (equal.length > 1) return null

  if (results.length === 1) {
    const only = results[0]
    const name = normaliseMedicineName(only.name)
    if (name.includes(target) || target.includes(name)) return only
  }

  return null
}

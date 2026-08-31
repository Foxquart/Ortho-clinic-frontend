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
  blank,
  formatSchedule,
  heard,
  newRow,
  scheduleIsComplete,
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

/**
 * The parser still speaks `{m,a,n}`; the row now carries a frequency string.
 * A complete grid becomes its "1-0-1" form. An incomplete one is treated as
 * silence — a half-heard timing must block printing, not masquerade as a
 * frequency. Pure PRN with no grid at all becomes the clinic's "SOS".
 */
function frequencyFromParsed(parsed: ParsedRow): RxRow['frequency'] {
  if (parsed.schedule && scheduleIsComplete(parsed.schedule)) {
    return heard(formatSchedule(parsed.schedule))
  }
  if (parsed.prn && parsed.schedule === null) return heard('SOS')
  return blank('')
}

/**
 * One dictated line becomes one row, with the medicine deliberately left
 * **unresolved**: `medicineId` stays null and `medicineName` holds the spoken
 * words. Resolution happens against the formulary afterwards, and until it
 * succeeds the row visibly blocks printing.
 */
export function rowFromDictation(key: string, parsed: ParsedRow): RxRow {
  return {
    ...newRow(key),
    medicineId: null,
    medicineName: parsed.spokenName,
    frequency: frequencyFromParsed(parsed),
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

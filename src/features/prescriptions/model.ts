/**
 * The prescription row model.
 *
 * The backend does not store per-field provenance or a genuinely blank
 * field — `frequency` is a required free-text string with `min_length: 1`.
 * The prototype spec requires the opposite: a
 * field the doctor never spoke and never filled must render blank and must
 * block printing, and nothing may invent a value on their behalf.
 *
 * So the structure lives here, in the client, and is flattened only at the
 * moment of submission. When the API grows structured fields, `toApiItem`
 * is the single function that changes.
 */

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type {
  PrescriptionTemplateCreate,
  PrescriptionTemplateResponse,
  RxExtraField,
} from '@/api/schema'
import type { PadLayout, PadLayoutSection } from './layout/usePadLayout'

/**
 * Morning / afternoon / night. Halves are legal: 0.5 means half a unit.
 *
 * No longer stored on a row — the row carries a free-text `frequency` string,
 * which is what the API stores. This shape survives as a pure helper: it is
 * what the dictation parser emits, and what `parseSchedule` recovers from a
 * "1-0-1" string when a quantity suggestion needs a per-day total.
 */
export interface DoseSchedule {
  m: number | null
  a: number | null
  n: number | null
}

/**
 * Where a value came from. The doctor must be able to tell at a glance what
 * the system heard, what it assumed, and what is still untouched — those three
 * carry very different risk.
 */
export type Provenance =
  /** Transcribed from speech. */
  | 'heard'
  /** Filled from a default or a previous prescription, not from this consult. */
  | 'defaulted'
  /** Typed or corrected by the doctor just now. */
  | 'entered'
  /** Never set. Renders blank and blocks printing. */
  | 'blank'

export interface FieldState<T> {
  value: T
  provenance: Provenance
}

export function blank<T>(empty: T): FieldState<T> {
  return { value: empty, provenance: 'blank' }
}

export function entered<T>(value: T): FieldState<T> {
  return { value, provenance: 'entered' }
}

export function heard<T>(value: T): FieldState<T> {
  return { value, provenance: 'heard' }
}

export function defaulted<T>(value: T): FieldState<T> {
  return { value, provenance: 'defaulted' }
}

export interface RxRow {
  /** Client-side row id; never sent. */
  key: string
  medicineId: string | null
  medicineName: string
  /** Free-text frequency, e.g. "1-0-1" or "before bed". Sent verbatim. */
  frequency: FieldState<string>
  durationDays: FieldState<number | null>
  quantity: FieldState<number | null>
  /** Free text. Currently also the home for PRN and max-per-day. */
  instructions: FieldState<string>
  /** Not yet a backend field; folded into instructions on submit. */
  prn: boolean
  maxPerDay: number | null
  food: 'before' | 'after' | 'with' | null
}

export function newRow(key: string): RxRow {
  return {
    key,
    medicineId: null,
    medicineName: '',
    frequency: blank(''),
    durationDays: blank(null),
    quantity: blank(null),
    instructions: blank(''),
    prn: false,
    maxPerDay: null,
    food: null,
  }
}

/* -------------------------------------------------------------------------- */
/*  Schedule formatting                                                       */
/* -------------------------------------------------------------------------- */

function part(value: number | null): string {
  if (value === null) return '_'
  return Number.isInteger(value) ? String(value) : String(value)
}

/** "1-0-1", or "1-0-_" when a slot was never set. */
export function formatSchedule(s: DoseSchedule): string {
  return `${part(s.m)}-${part(s.a)}-${part(s.n)}`
}

export function scheduleIsComplete(s: DoseSchedule): boolean {
  return s.m !== null && s.a !== null && s.n !== null
}

/** Total units per day, for a quantity suggestion. Null if incomplete. */
export function dailyTotal(s: DoseSchedule): number | null {
  if (!scheduleIsComplete(s)) return null
  return (s.m ?? 0) + (s.a ?? 0) + (s.n ?? 0)
}

/**
 * Suggested pack quantity — a suggestion only, never auto-applied.
 *
 * Works from the free-text frequency: if it parses as a complete "1-0-1"
 * schedule the daily total is known and a course quantity follows. Free text
 * like "SOS" or "before bed" has no daily total, so no suggestion is made.
 */
export function suggestQuantity(frequency: string, days: number | null): number | null {
  const schedule = parseSchedule(frequency)
  if (!schedule) return null
  const perDay = dailyTotal(schedule)
  if (perDay === null || perDay <= 0 || !days || days <= 0) return null
  return Math.ceil(perDay * days)
}

/* -------------------------------------------------------------------------- */
/*  Print gating — the spec's hard rule                                        */
/* -------------------------------------------------------------------------- */

export interface RowIssue {
  rowKey: string
  field: 'medicine' | 'frequency'
  message: string
}

/**
 * A row may not print while a required field is blank. This is enforced here,
 * client-side, because the API cannot represent the blank state at all — it
 * would happily accept a fabricated "1-0-1".
 */
export function rowIssues(row: RxRow): RowIssue[] {
  const issues: RowIssue[] = []

  if (!row.medicineId) {
    issues.push({ rowKey: row.key, field: 'medicine', message: 'No medicine selected' })
  }
  if (row.frequency.provenance === 'blank' || row.frequency.value.trim() === '') {
    issues.push({ rowKey: row.key, field: 'frequency', message: 'How often?' })
  }

  return issues
}

export function prescriptionIssues(rows: readonly RxRow[]): RowIssue[] {
  return rows.flatMap(rowIssues)
}

export function canPrint(rows: readonly RxRow[]): boolean {
  return rows.length > 0 && prescriptionIssues(rows).length === 0
}

/* -------------------------------------------------------------------------- */
/*  Serialisation to the current API shape                                     */
/* -------------------------------------------------------------------------- */

export interface ApiPrescriptionItem {
  medicine_id: string
  frequency: string
  duration_days?: number | null
  quantity?: number | null
  instructions?: string | null
  food_timing?: 'before' | 'after' | 'with' | null
}

function buildInstructions(row: RxRow): string | null {
  // PRN and max-per-day have no backend fields yet, so they are folded into
  // free text rather than dropped. Food timing is NOT folded in any more — it
  // travels as the structured `food_timing` field, and the print template
  // groups medicines under food-timing headers from it.
  const parts: string[] = []
  if (row.instructions.value.trim()) parts.push(row.instructions.value.trim())
  if (row.prn) parts.push(row.maxPerDay ? `PRN, max ${row.maxPerDay}/day` : 'PRN (as needed)')
  else if (row.maxPerDay) parts.push(`max ${row.maxPerDay}/day`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * Flatten a row for `POST /prescriptions`.
 *
 * Throws on a blank required field rather than substituting a placeholder.
 * Submitting a value the doctor never gave is the one failure mode this whole
 * model exists to prevent — the caller must resolve it in the UI first.
 */
export function toApiItem(row: RxRow): ApiPrescriptionItem {
  if (!row.medicineId) throw new Error(`Row ${row.key} has no medicine`)

  const frequency = row.frequency.value.trim()
  if (!frequency) throw new Error(`Row ${row.key} has no frequency`)

  return {
    medicine_id: row.medicineId,
    // Free text on both sides; "1-0-1" is the convention this clinic uses.
    frequency,
    duration_days: row.durationDays.value,
    quantity: row.quantity.value,
    instructions: buildInstructions(row),
    food_timing: row.food,
  }
}

/* -------------------------------------------------------------------------- */
/*  Reading back — "continue previous medicines"                               */
/* -------------------------------------------------------------------------- */

/** Parse "1-0-1" (and "1-0-_" / "0.5-0-0.5") back into a schedule. */
export function parseSchedule(frequency: string): DoseSchedule | null {
  const parts = frequency.trim().split('-')
  if (parts.length !== 3) return null

  const parsed = parts.map((p) => {
    const t = p.trim()
    if (t === '' || t === '_' || t === '?') return null
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  })

  if (parsed.some((p) => p === undefined)) return null
  return {
    m: parsed[0] as number | null,
    a: parsed[1] as number | null,
    n: parsed[2] as number | null,
  }
}

/**
 * Rebuild an editable row from a previous prescription item. Everything it
 * carries over is marked `defaulted`, never `entered` — the doctor is looking
 * at last visit's decision, not one they just made.
 */
export function rowFromPrevious(
  key: string,
  item: {
    medicine_id: string
    medicine_name?: string | null
    frequency: string
    duration_days?: number | null
    quantity?: number | null
    instructions?: string | null
    food_timing?: string | null
  },
): RxRow {
  /* Prefer the structured field; fall back to sniffing the instructions text
     only for old records written before `food_timing` existed, whose
     instructions still say "before food" / "after food" / "with food". */
  const food: RxRow['food'] =
    item.food_timing === 'before' || item.food_timing === 'after' || item.food_timing === 'with'
      ? item.food_timing
      : /before food/i.test(item.instructions ?? '')
        ? 'before'
        : /after food/i.test(item.instructions ?? '')
          ? 'after'
          : /with food/i.test(item.instructions ?? '')
            ? 'with'
            : null
  return {
    key,
    medicineId: item.medicine_id,
    medicineName: item.medicine_name ?? '',
    // The stored string travels back verbatim — "1-0-1" and "SOS" alike.
    frequency: defaulted(item.frequency),
    durationDays: item.duration_days != null ? defaulted(item.duration_days) : blank(null),
    quantity: item.quantity != null ? defaulted(item.quantity) : blank(null),
    instructions: item.instructions ? defaulted(item.instructions) : blank(''),
    prn: /\bPRN\b/i.test(item.instructions ?? ''),
    maxPerDay: null,
    food,
  }
}

/* -------------------------------------------------------------------------- */
/*  Patient — the bare minimum to prescribe                                    */
/* -------------------------------------------------------------------------- */

/**
 * This is a prescribing tool, not a records system. A walk-in must not have to
 * become a fully-filled patient record before they can be handed a
 * prescription.
 *
 * `PatientUpsert` requires exactly `first_name`, `last_name` and `phone`, and
 * `PrescriptionCreateRequest` accepts an inline `patient` object — so those
 * three fields are the entire cost of prescribing for someone new. Everything
 * else on the patient record stays empty and can be filled in later from the
 * patient screen.
 */
export interface RxPatient {
  /** Set when an existing patient was chosen. `null` means "create this one". */
  id: string | null
  firstName: string
  lastName: string
  phone: string
  /** Display only, carried from a selected patient so allergies stay visible. */
  allergies: string[]
}

export const EMPTY_PATIENT: RxPatient = {
  id: null,
  firstName: '',
  lastName: '',
  phone: '',
  allergies: [],
}

export function patientName(patient: RxPatient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

/** The three fields the API actually demands, and nothing more. */
export function patientIssues(patient: RxPatient): RowIssue[] {
  const issues: RowIssue[] = []
  if (!patient.firstName.trim()) {
    issues.push({ rowKey: 'patient', field: 'medicine', message: 'First name needed' })
  }
  if (!patient.lastName.trim()) {
    issues.push({ rowKey: 'patient', field: 'medicine', message: 'Last name needed' })
  }
  if (!patient.phone.trim()) {
    issues.push({ rowKey: 'patient', field: 'medicine', message: 'Phone number needed' })
  }
  return issues
}

/* -------------------------------------------------------------------------- */
/*  The whole prescription being written                                       */
/* -------------------------------------------------------------------------- */

/**
 * Everything on the pad. The narrative fields carry provenance for the same
 * reason the rows do: a diagnosis the system heard and a diagnosis the doctor
 * typed are not equally trustworthy, and one that was never given must stay
 * visibly empty.
 */
export interface RxDraft {
  patient: RxPatient
  /**
   * Vitals as measured AT THIS VISIT, in the doctor's own order: BP, SpO2,
   * heart rate, weight. Strings, not numbers — a blood pressure is written
   * and read as `120/80`, and he may qualify it (`140/90 right arm`). Parsing
   * it would only be able to lose information.
   *
   * Sent as real columns (`vitals_bp`, `vitals_spo2`, `vitals_pulse_bpm`,
   * `vitals_weight_kg`) — they live on the PRESCRIPTION, not the patient,
   * because a printed prescription must show what was measured at that visit
   * and must not change when the patient is weighed again.
   */
  vitalsBp: FieldState<string>
  vitalsSpo2: FieldState<string>
  vitalsPulse: FieldState<string>
  vitalsWeight: FieldState<string>
  diagnosis: FieldState<string>
  /** Sent as `examination_findings` — what the doctor found on examining the patient. */
  examinationFindings: FieldState<string>
  chiefComplaint: FieldState<string>
  /**
   * The doctor's own pad sections, one entry per `custom:<slug>` section that
   * has been touched. `label` is a snapshot of the layout label at the time
   * (see {@link withLayoutLabels}); it travels with the value so the printed
   * page never depends on the layout still existing.
   */
  extraFields: ExtraFieldDraft[]
  rows: RxRow[]
  advice: FieldState<string>
  /** Sent as `investigations` — a real column since 2026-08-25. */
  investigations: FieldState<string>
  notes: FieldState<string>
  /** Sent as `procedure`. Routinely "NA" on his pad. */
  procedure: FieldState<string>
  /** Sent as `consult` — the "Comment" line on the paper pad. */
  consult: FieldState<string>
  /** ISO `YYYY-MM-DD`. */
  followUpDate: FieldState<string>
}

export interface ExtraFieldDraft {
  /** `custom:<slug>` */
  key: string
  label: string
  value: FieldState<string>
}

/** The pad's value for a custom section, blank when it was never touched. */
export function extraValue(draft: RxDraft, key: string): FieldState<string> {
  return draft.extraFields.find((f) => f.key === key)?.value ?? blank('')
}

/** Set one custom section's value, replacing any earlier entry for the same key. */
export function setExtraField(
  draft: RxDraft,
  key: string,
  label: string,
  value: FieldState<string>,
): RxDraft {
  const next: ExtraFieldDraft = { key, label, value }
  const exists = draft.extraFields.some((f) => f.key === key)
  return {
    ...draft,
    extraFields: exists
      ? draft.extraFields.map((f) => (f.key === key ? next : f))
      : [...draft.extraFields, next],
  }
}

/**
 * Re-stamp each custom value with the layout's current label for its key. A
 * value that came from an old template or prescription still carries the
 * label it was written under; the doctor has since seen (and may have
 * renamed) the section, so what he sees is what gets sent. Keys the layout no
 * longer has keep their snapshot label — nothing is dropped.
 */
export function withLayoutLabels(draft: RxDraft, layout: PadLayout): RxDraft {
  if (draft.extraFields.length === 0) return draft
  const labels = new Map(layout.sections.map((s) => [s.key, s.label]))
  return {
    ...draft,
    extraFields: draft.extraFields.map((f) => ({ ...f, label: labels.get(f.key) ?? f.label })),
  }
}

/** Built-in layout section key -> the draft field that holds its text. */
export type SectionField =
  | 'chiefComplaint'
  | 'diagnosis'
  | 'examinationFindings'
  | 'investigations'
  | 'procedure'
  | 'consult'
  | 'advice'
  | 'notes'
  | 'followUpDate'

export const SECTION_FIELD: Readonly<Record<string, SectionField | undefined>> = {
  chief_complaint: 'chiefComplaint',
  diagnosis: 'diagnosis',
  examination_findings: 'examinationFindings',
  investigations: 'investigations',
  procedure: 'procedure',
  consult: 'consult',
  advice: 'advice',
  notes: 'notes',
  follow_up: 'followUpDate',
}

/**
 * The sections the pad renders, in layout order: the visible ones, plus any
 * hidden one that has content (a template, a repeat or an allergy override
 * wrote into it — what will print must be on screen), plus custom values whose
 * section the layout does not have (a snapshot from a template or an old
 * prescription), at the end under the label they were written with.
 */
export function shownSections(draft: RxDraft, layout: PadLayout): PadLayoutSection[] {
  const filled = (key: string): boolean => {
    const field = SECTION_FIELD[key]
    return (field ? draft[field] : extraValue(draft, key)).value.trim() !== ''
  }
  const inLayout = new Set(layout.sections.map((s) => s.key))
  return [
    ...layout.sections.filter((s) => s.visible || filled(s.key)),
    ...draft.extraFields
      .filter((f) => !inLayout.has(f.key))
      .map((f) => ({ key: f.key, label: f.label, visible: true })),
  ]
}

/** Wire shape of the custom sections: empty values are not sent. */
function extraPayload(fields: readonly ExtraFieldDraft[]): RxExtraField[] {
  return fields.flatMap((f) => {
    const value = f.value.value.trim()
    return value ? [{ key: f.key, label: f.label.trim().slice(0, 64), value }] : []
  })
}

export function newDraft(): RxDraft {
  return {
    patient: { ...EMPTY_PATIENT },
    vitalsBp: blank(''),
    vitalsSpo2: blank(''),
    vitalsPulse: blank(''),
    vitalsWeight: blank(''),
    diagnosis: blank(''),
    examinationFindings: blank(''),
    chiefComplaint: blank(''),
    extraFields: [],
    rows: [],
    advice: blank(''),
    investigations: blank(''),
    notes: blank(''),
    procedure: blank(''),
    consult: blank(''),
    followUpDate: blank(''),
  }
}

/** Everything standing between this draft and a printed prescription. */
export function draftIssues(draft: RxDraft): RowIssue[] {
  const issues = [...patientIssues(draft.patient)]
  if (draft.rows.length === 0) {
    issues.push({ rowKey: 'rows', field: 'medicine', message: 'No medicines added' })
  }
  return issues.concat(prescriptionIssues(draft.rows))
}

export function canSubmitDraft(draft: RxDraft): boolean {
  return draftIssues(draft).length === 0
}

/* -------------------------------------------------------------------------- */
/*  Allergy safety                                                             */
/* -------------------------------------------------------------------------- */

export interface AllergyConflict {
  rowKey: string
  allergy: string
  medicineName: string
}

/**
 * Loose substring matching across whatever names a row carries. This is an
 * NSAID-heavy practice: a false positive the doctor waves away costs a second,
 * a miss can cost a great deal more, so this errs toward flagging.
 *
 * Terms shorter than three characters are skipped — they match everything.
 */
export function allergyConflicts(
  patient: RxPatient,
  rows: readonly RxRow[],
  nameFor: (row: RxRow) => string = (row) => row.medicineName,
): AllergyConflict[] {
  const allergies = patient.allergies
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length >= 3)
  if (allergies.length === 0) return []

  const conflicts: AllergyConflict[] = []
  for (const row of rows) {
    const haystack = nameFor(row).toLowerCase()
    if (!haystack) continue
    for (const allergy of allergies) {
      if (haystack.includes(allergy)) {
        conflicts.push({ rowKey: row.key, allergy, medicineName: nameFor(row) })
      }
    }
  }
  return conflicts
}

/* -------------------------------------------------------------------------- */
/*  Serialising the whole draft                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build the `POST /prescriptions` body.
 *
 * Sends `patient_id` for an existing patient, or an inline `patient` with the
 * three required fields for a walk-in. Like `toApiItem`, this throws rather
 * than inventing anything — call `canSubmitDraft` first.
 */
/**
 * The same draft, shaped for `POST /prescriptions/preview` — the server-side
 * render of the very template that prints.
 *
 * Everything `toApiRequest` refuses, this one allows. A draft is incomplete by
 * definition and the preview is most useful when the pad is half filled, so
 * there is no `draftIssues` gate, no medicine is required, and a row with a
 * blank dose or frequency is sent as-is rather than throwing.
 *
 * `patient_id` matters more than it looks: the server reads the patient from
 * the database and the printed vitals line lives inside the patient block, so
 * sending only inline details silently drops the vitals from the preview.
 * Send the id whenever there is one.
 */
export function toPreviewRequest(draft: RxDraft): Record<string, unknown> {
  const text = (field: FieldState<string>): string | null => field.value.trim() || null
  const wholeNumber = (raw: string): number | null => {
    const digits = raw.match(/\d+/)?.[0]
    return digits ? Number(digits) : null
  }
  const weightKg = (raw: string): string | null => {
    const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? n.toFixed(2) : null
  }

  return {
    ...(draft.patient.id
      ? { patient_id: draft.patient.id }
      : {
          patient: {
            first_name: draft.patient.firstName.trim() || null,
            last_name: draft.patient.lastName.trim() || null,
            phone: draft.patient.phone.trim() || null,
          },
        }),
    diagnosis: text(draft.diagnosis),
    examination_findings: text(draft.examinationFindings),
    extra_fields: extraPayload(draft.extraFields),
    chief_complaint: text(draft.chiefComplaint),
    advice: text(draft.advice),
    notes: text(draft.notes),
    investigations: text(draft.investigations),
    procedure: text(draft.procedure),
    consult: text(draft.consult),
    vitals_bp: text(draft.vitalsBp),
    vitals_spo2: wholeNumber(draft.vitalsSpo2.value),
    vitals_pulse_bpm: wholeNumber(draft.vitalsPulse.value),
    vitals_weight_kg: weightKg(draft.vitalsWeight.value),
    follow_up_date: text(draft.followUpDate),
    /* A row with neither an id nor a typed name is dropped server-side rather
       than printed as an empty line, so unfilled rows cost nothing here. */
    items: draft.rows.map((row) => ({
      medicine_id: row.medicineId,
      medicine_name: row.medicineName || null,
      frequency: row.frequency.value.trim() || null,
      duration_days: row.durationDays.value,
      quantity: row.quantity.value,
      instructions: buildInstructions(row),
      food_timing: row.food,
    })),
  }
}

export function toApiRequest(draft: RxDraft): Record<string, unknown> {
  const issues = draftIssues(draft)
  if (issues.length > 0) {
    throw new Error(`Draft is not ready: ${issues.map((i) => i.message).join(', ')}`)
  }

  /* Vitals go to the API as numbers, but the pad holds them as text — a
     doctor types "98%" or "72 bpm" as readily as a bare figure. Strip anything
     that is not part of the number, and send `null` rather than a guess when
     what is left does not parse: a wrong SpO2 on a prescription is worse than
     an absent one, and the API would reject it anyway (422). `vitals_bp` is
     the exception and is passed through untouched — "140/90 (right arm)" is
     legitimate and must survive. */
  const wholeNumber = (raw: string): number | null => {
    /* First integer run, NOT "strip every non-digit": stripping turns "98.6"
       into 986, which the API's 0-100 bound would reject as a 422 round-trip.
       Matching the run yields 98 and keeps the error client-side. */
    const digits = raw.match(/\d+/)?.[0]
    return digits ? Number(digits) : null
  }

  /* Decimal(5,2) on the wire. Sent as a string so no float rounding can creep
     into a clinical figure. */
  const weightKg = (raw: string): string | null => {
    const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? n.toFixed(2) : null
  }

  const text = (field: FieldState<string>): string | null => field.value.trim() || null

  return {
    ...(draft.patient.id
      ? { patient_id: draft.patient.id }
      : {
          patient: {
            first_name: draft.patient.firstName.trim(),
            last_name: draft.patient.lastName.trim(),
            phone: draft.patient.phone.trim(),
          },
        }),
    diagnosis: text(draft.diagnosis),
    examination_findings: text(draft.examinationFindings),
    extra_fields: extraPayload(draft.extraFields),
    chief_complaint: text(draft.chiefComplaint),
    /* Newline-delimited on purpose: the print template splits `advice` on
       newlines and numbers it (1) (2) (3), which is what the pad writes. */
    advice: text(draft.advice),
    notes: text(draft.notes),
    investigations: text(draft.investigations),
    procedure: text(draft.procedure),
    consult: text(draft.consult),
    vitals_bp: text(draft.vitalsBp),
    vitals_spo2: wholeNumber(draft.vitalsSpo2.value),
    vitals_pulse_bpm: wholeNumber(draft.vitalsPulse.value),
    vitals_weight_kg: weightKg(draft.vitalsWeight.value),
    follow_up_date: text(draft.followUpDate),
    items: draft.rows.map(toApiItem),
  }
}

/* -------------------------------------------------------------------------- */
/*  Templates                                                                  */
/* -------------------------------------------------------------------------- */

/** Draft field -> template column, for the plain-text fields. */
const TEMPLATE_TEXT_FIELDS = [
  ['chiefComplaint', 'chief_complaint'],
  ['diagnosis', 'diagnosis'],
  ['examinationFindings', 'examination_findings'],
  ['advice', 'advice'],
  ['investigations', 'investigations'],
  ['procedure', 'procedure'],
  ['consult', 'consult'],
  ['notes', 'notes'],
] as const

/** Anything on the pad a template would overwrite. Patient and vitals never count. */
export function hasTemplateContent(draft: RxDraft): boolean {
  return (
    draft.rows.length > 0 ||
    draft.followUpDate.value.trim() !== '' ||
    draft.extraFields.some((f) => f.value.value.trim() !== '') ||
    TEMPLATE_TEXT_FIELDS.some(([key]) => draft[key].value.trim() !== '')
  )
}

/**
 * Lay a saved template over the pad. Everything it fills is `entered` — the
 * doctor chose it, and can edit it like anything they typed. A field the
 * template leaves empty keeps what the pad already has, and so do the
 * medicine rows when the template has none usable. Patient and vitals are
 * never touched.
 *
 * `newKey` is called once per row; call this outside a state updater.
 */
export function applyTemplate(
  draft: RxDraft,
  template: PrescriptionTemplateResponse,
  newKey: () => string,
): RxDraft {
  const next = { ...draft }
  for (const [key, column] of TEMPLATE_TEXT_FIELDS) {
    const value = template[column]?.trim()
    if (value) next[key] = entered(value)
  }
  // Custom sections: a template value replaces the pad's for the same key, the rest stay.
  for (const extra of template.extra_fields ?? []) {
    const value = extra.value.trim()
    if (value) {
      next.extraFields = setExtraField(next, extra.key, extra.label, entered(value)).extraFields
    }
  }
  if (template.follow_up_days != null) {
    next.followUpDate = entered(format(addDays(new Date(), template.follow_up_days), 'yyyy-MM-dd'))
  }
  // A medicine deleted since the template was saved has no name: skip it.
  const rows = template.items.flatMap((item) =>
    item.medicine_name
      ? [
          {
            ...newRow(newKey()),
            medicineId: item.medicine_id,
            medicineName: item.medicine_name,
            frequency: entered(item.frequency),
            durationDays: item.duration_days != null ? entered(item.duration_days) : blank(null),
            quantity: item.quantity != null ? entered(item.quantity) : blank(null),
            instructions: item.instructions ? entered(item.instructions) : blank(''),
            food: item.food_timing ?? null,
          },
        ]
      : [],
  )
  if (rows.length > 0) next.rows = rows
  return next
}

/** The slice of a past prescription "repeat" reads. The text columns exist on the API but not yet in `schema.ts`. */
export interface RepeatSource {
  patient_id: string
  created_at: string
  chief_complaint: string | null
  diagnosis: string | null
  examination_findings?: string | null
  extra_fields?: RxExtraField[]
  advice: string | null
  notes: string | null
  investigations?: string | null
  procedure?: string | null
  consult?: string | null
  follow_up_date: string | null
  items: {
    frequency: string
    duration_days: number | null
    quantity: number | null
    instructions: string | null
    food_timing?: 'before' | 'after' | 'with' | null
    medicine: { id: string; name: string }
  }[]
}

/**
 * "Repeat last prescription": lay a past prescription over the pad through
 * `applyTemplate`, then mark all of it `defaulted` — last visit's decision, not
 * one made today, so it stays flagged "carried over" until the doctor touches
 * it. Vitals and patient are never copied (vitals are per-visit).
 *
 * Follow-up keeps the interval it had (visit date to follow-up date), counted
 * from today. Medicines go through `rowFromPrevious`, the same path as
 * "continue previous medicines", so both carry over identically.
 */
export function applyPrevious(draft: RxDraft, rx: RepeatSource, newKey: () => string): RxDraft {
  const days = rx.follow_up_date
    ? differenceInCalendarDays(parseISO(rx.follow_up_date), parseISO(rx.created_at))
    : NaN
  const out = applyTemplate(
    draft,
    {
      id: '',
      name: '',
      chief_complaint: rx.chief_complaint,
      diagnosis: rx.diagnosis,
      examination_findings: rx.examination_findings ?? null,
      extra_fields: rx.extra_fields ?? [],
      advice: rx.advice,
      investigations: rx.investigations ?? null,
      procedure: rx.procedure ?? null,
      consult: rx.consult ?? null,
      notes: rx.notes,
      follow_up_days: days >= 0 && days <= 365 ? days : null,
      items: [],
      created_at: '',
      updated_at: '',
    },
    newKey,
  )
  for (const key of [...TEMPLATE_TEXT_FIELDS.map(([k]) => k), 'followUpDate'] as const) {
    if (out[key] !== draft[key]) out[key] = defaulted(out[key].value)
  }
  out.extraFields = out.extraFields.map((f) =>
    draft.extraFields.includes(f) ? f : { ...f, value: defaulted(f.value.value) },
  )
  if (rx.items.length > 0) {
    out.rows = rx.items.map((item) =>
      rowFromPrevious(newKey(), {
        medicine_id: item.medicine.id,
        medicine_name: item.medicine.name,
        frequency: item.frequency,
        duration_days: item.duration_days,
        quantity: item.quantity,
        instructions: item.instructions,
        food_timing: item.food_timing,
      }),
    )
  }
  return out
}

/**
 * The pad's non-patient content as a `POST /prescription-templates` body.
 * Rows without a matched medicine or a frequency cannot be stored and are
 * dropped; the follow-up date becomes days from today.
 */
export function templateFromDraft(draft: RxDraft, name: string): PrescriptionTemplateCreate {
  const text = (field: FieldState<string>): string | null => field.value.trim() || null
  const days = draft.followUpDate.value
    ? differenceInCalendarDays(parseISO(draft.followUpDate.value), new Date())
    : NaN
  return {
    name: name.trim(),
    chief_complaint: text(draft.chiefComplaint),
    diagnosis: text(draft.diagnosis),
    examination_findings: text(draft.examinationFindings),
    extra_fields: extraPayload(draft.extraFields),
    advice: text(draft.advice),
    investigations: text(draft.investigations),
    procedure: text(draft.procedure),
    consult: text(draft.consult),
    notes: text(draft.notes),
    follow_up_days: days >= 0 && days <= 365 ? days : null,
    items: draft.rows.flatMap((row) =>
      row.medicineId && row.frequency.value.trim()
        ? [
            {
              medicine_id: row.medicineId,
              frequency: row.frequency.value.trim(),
              duration_days: row.durationDays.value || null,
              quantity: row.quantity.value || null,
              instructions: buildInstructions(row),
              food_timing: row.food,
            },
          ]
        : [],
    ),
  }
}

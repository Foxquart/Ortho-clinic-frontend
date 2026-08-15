/**
 * The prescription row model.
 *
 * The backend does not yet store structured doses, per-field provenance, or a
 * genuinely blank dose — `dosage` and `frequency` are required free-text
 * strings with `min_length: 1`. The prototype spec requires the opposite: a
 * field the doctor never spoke and never filled must render blank and must
 * block printing, and nothing may invent a value on their behalf.
 *
 * So the structure lives here, in the client, and is flattened only at the
 * moment of submission. When the API grows structured fields, `toApiItem`
 * is the single function that changes.
 */

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
  /** Free-text amount per administration, e.g. "1 tab", "10 ml". */
  dosage: FieldState<string>
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
    dosage: blank(''),
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
  field: 'medicine' | 'dosage' | 'frequency'
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
  if (row.dosage.provenance === 'blank' || row.dosage.value.trim() === '') {
    issues.push({ rowKey: row.key, field: 'dosage', message: 'Dose not set' })
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
  dosage: string
  frequency: string
  duration_days?: number | null
  quantity?: number | null
  instructions?: string | null
}

function buildInstructions(row: RxRow): string | null {
  // PRN, max-per-day and food timing have no backend fields yet, so they are
  // folded into free text rather than dropped.
  const parts: string[] = []
  if (row.instructions.value.trim()) parts.push(row.instructions.value.trim())
  if (row.food) parts.push(`${row.food} food`)
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

  const dosage = row.dosage.value.trim()
  if (!dosage) throw new Error(`Row ${row.key} has no dose`)

  const frequency = row.frequency.value.trim()
  if (!frequency) throw new Error(`Row ${row.key} has no frequency`)

  return {
    medicine_id: row.medicineId,
    dosage,
    // Free text on both sides; "1-0-1" is the convention this clinic uses.
    frequency,
    duration_days: row.durationDays.value,
    quantity: row.quantity.value,
    instructions: buildInstructions(row),
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
  return { m: parsed[0] as number | null, a: parsed[1] as number | null, n: parsed[2] as number | null }
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
    dosage: string
    frequency: string
    duration_days?: number | null
    quantity?: number | null
    instructions?: string | null
  },
): RxRow {
  return {
    key,
    medicineId: item.medicine_id,
    medicineName: item.medicine_name ?? '',
    dosage: defaulted(item.dosage),
    // The stored string travels back verbatim — "1-0-1" and "SOS" alike.
    frequency: defaulted(item.frequency),
    durationDays: item.duration_days != null ? defaulted(item.duration_days) : blank(null),
    quantity: item.quantity != null ? defaulted(item.quantity) : blank(null),
    instructions: item.instructions ? defaulted(item.instructions) : blank(''),
    prn: /\bPRN\b/i.test(item.instructions ?? ''),
    maxPerDay: null,
    food: /before food/i.test(item.instructions ?? '')
      ? 'before'
      : /after food/i.test(item.instructions ?? '')
        ? 'after'
        : /with food/i.test(item.instructions ?? '')
          ? 'with'
          : null,
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
  diagnosis: FieldState<string>
  chiefComplaint: FieldState<string>
  rows: RxRow[]
  advice: FieldState<string>
  /** No API field exists; appended to `notes` on submit under a heading. */
  investigations: FieldState<string>
  notes: FieldState<string>
  /** ISO `YYYY-MM-DD`. */
  followUpDate: FieldState<string>
}

export function newDraft(): RxDraft {
  return {
    patient: { ...EMPTY_PATIENT },
    diagnosis: blank(''),
    chiefComplaint: blank(''),
    rows: [],
    advice: blank(''),
    investigations: blank(''),
    notes: blank(''),
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
export function toApiRequest(draft: RxDraft): Record<string, unknown> {
  const issues = draftIssues(draft)
  if (issues.length > 0) {
    throw new Error(`Draft is not ready: ${issues.map((i) => i.message).join(', ')}`)
  }

  const investigations = draft.investigations.value.trim()
  const notes = [draft.notes.value.trim(), investigations ? `Investigations:\n${investigations}` : '']
    .filter(Boolean)
    .join('\n\n')

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
    diagnosis: draft.diagnosis.value.trim() || null,
    chief_complaint: draft.chiefComplaint.value.trim() || null,
    advice: draft.advice.value.trim() || null,
    notes: notes || null,
    follow_up_date: draft.followUpDate.value.trim() || null,
    items: draft.rows.map(toApiItem),
  }
}

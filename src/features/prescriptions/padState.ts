/**
 * The glue between the pure model in `model.ts` and the DOM the pad renders.
 *
 * `model.ts` deliberately knows nothing about the screen — it reports *what*
 * is missing, not *where*. This module owns that second half: the stable field
 * ids, the mapping from a `RowIssue` to the control that fixes it, and the
 * per-row bookkeeping (spoken name, formulary candidates) that the API shape
 * has nowhere to live.
 */

import type { MedicineResponse } from '@/api/schema'
import type { AllergyConflict, Provenance, RowIssue, RxDraft, RxRow } from './model'

/* -------------------------------------------------------------------------- */
/*  Row keys                                                                   */
/* -------------------------------------------------------------------------- */

let rowCounter = 0

/** A client-side row id. Never sent to the API. */
export function nextRowKey(): string {
  rowCounter += 1
  return `row-${rowCounter}`
}

/* -------------------------------------------------------------------------- */
/*  Per-row bookkeeping that RxRow has no field for                            */
/* -------------------------------------------------------------------------- */

/**
 * What we know about a row *besides* its prescribed content.
 *
 * `spokenName` is kept even after a match succeeds: when the doctor reads the
 * printed sheet back, "you said Ultracet, this is Ultracet-P" is the check
 * that catches a wrong pick.
 */
export interface RowMeta {
  /** The words dictation heard, if this row came from speech. */
  spokenName: string | null
  /** Formulary hits for `spokenName`, ranked by the server. Never filtered here. */
  candidates: MedicineResponse[]
  /** A lookup is in flight. */
  resolving: boolean
  /** The lookup finished and produced no confident match. */
  resolved: boolean
}

export const EMPTY_ROW_META: RowMeta = {
  spokenName: null,
  candidates: [],
  resolving: false,
  resolved: false,
}

export type RowMetaMap = Record<string, RowMeta>

export function metaFor(map: RowMetaMap, key: string): RowMeta {
  return map[key] ?? EMPTY_ROW_META
}

/**
 * A row is *unmatched* when speech heard a drug name the formulary has not
 * confirmed. It is a distinct state from "empty": the doctor did name a
 * medicine, we just cannot prove which one — so the spoken words stay on
 * screen and the row keeps blocking the print.
 */
export function isUnmatched(row: RxRow, meta: RowMeta): boolean {
  return row.medicineId === null && meta.spokenName !== null
}

/* -------------------------------------------------------------------------- */
/*  Provenance → the class the control inside the rail wears                    */
/* -------------------------------------------------------------------------- */

/**
 * A blank field wears the dashed graphite outline of its `ProvenanceField`
 * wrapper and nothing else — its own border and fill are dropped, so it reads
 * as an outline waiting to be filled rather than as an ordinary empty input
 * with a box around it. The em-dash placeholder is the only thing in it.
 */
export function provenanceControlClass(provenance: Provenance): string | undefined {
  return provenance === 'blank'
    ? 'border-transparent bg-transparent placeholder:text-provenance-blank hover:border-transparent focus:border-transparent focus:ring-0'
    : undefined
}

/* -------------------------------------------------------------------------- */
/*  Allergy acknowledgement identity                                           */
/* -------------------------------------------------------------------------- */

/**
 * A stable identity for "this exact set of conflicts".
 *
 * An acknowledgement is for the conflicts the doctor actually read. Add a
 * fourth NSAID after overriding three and the override must lapse — otherwise
 * one click at the start of a consultation silently covers everything
 * prescribed after it.
 */
export function conflictSignature(conflicts: readonly AllergyConflict[]): string {
  return conflicts
    .map((c) => `${c.rowKey}:${c.allergy}`)
    .sort()
    .join('|')
}

/* -------------------------------------------------------------------------- */
/*  Field ids — the contract between an issue and the control that fixes it    */
/* -------------------------------------------------------------------------- */

export const FIELD_IDS = {
  patient: 'rx-patient',
  patientFirst: 'rx-patient-first',
  patientLast: 'rx-patient-last',
  patientPhone: 'rx-patient-phone',
  addMedicine: 'rx-add-medicine',
  vitalsBp: 'rx-vitals-bp',
  vitalsSpo2: 'rx-vitals-spo2',
  vitalsPulse: 'rx-vitals-pulse',
  vitalsWeight: 'rx-vitals-weight',
  diagnosis: 'rx-diagnosis',
  procedure: 'rx-procedure',
  consult: 'rx-consult',
  chiefComplaint: 'rx-chief-complaint',
  advice: 'rx-advice',
  investigations: 'rx-investigations',
  notes: 'rx-notes',
  followUp: 'rx-follow-up',
} as const

export const rowFieldId = {
  medicine: (key: string) => `rx-med-${key}`,
  frequency: (key: string) => `rx-freq-${key}`,
  days: (key: string) => `rx-days-${key}`,
  quantity: (key: string) => `rx-qty-${key}`,
  food: (key: string) => `rx-food-${key}`,
  instructions: (key: string) => `rx-notes-${key}`,
} as const

/**
 * Which control does this issue point at?
 *
 * `patientIssues` reports all three name/phone problems with the same
 * `field: 'medicine'` discriminator — the model's `RowIssue` shape predates
 * the inline patient and I am not allowed to widen it — so the message text is
 * the only thing left to switch on. Kept in one function so the coupling is in
 * exactly one place if the model ever grows a proper discriminator.
 */
export function issueFieldId(issue: RowIssue): string {
  if (issue.rowKey === 'patient') {
    if (issue.message.startsWith('First')) return FIELD_IDS.patientFirst
    if (issue.message.startsWith('Last')) return FIELD_IDS.patientLast
    if (issue.message.startsWith('Phone')) return FIELD_IDS.patientPhone
    return FIELD_IDS.patient
  }
  if (issue.rowKey === 'rows') return FIELD_IDS.addMedicine
  if (issue.field === 'frequency') return rowFieldId.frequency(issue.rowKey)
  return rowFieldId.medicine(issue.rowKey)
}

/**
 * A sentence a doctor can act on without hunting: which line, and what about
 * it. "Dose not set" alone is useless on a five-medicine sheet.
 */
export function describeIssue(issue: RowIssue, draft: RxDraft): string {
  if (issue.rowKey === 'patient' || issue.rowKey === 'rows') return issue.message

  const index = draft.rows.findIndex((r) => r.key === issue.rowKey)
  const row = index >= 0 ? draft.rows[index] : null
  const label = row?.medicineName.trim() || (index >= 0 ? `Medicine ${index + 1}` : 'Medicine')

  if (issue.field === 'medicine') {
    return row?.medicineName.trim()
      ? `“${label}” is not matched to the formulary`
      : `${label} — no medicine chosen`
  }
  if (issue.field === 'frequency') return `${label} — how often, e.g. 1-0-1 or SOS`
  return `${label} — ${issue.message.toLowerCase()}`
}

/** Where the issue sits, for grouping the summary. */
export function issueSection(issue: RowIssue): 'patient' | 'medicines' {
  return issue.rowKey === 'patient' ? 'patient' : 'medicines'
}

/* -------------------------------------------------------------------------- */
/*  Focus                                                                      */
/* -------------------------------------------------------------------------- */

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Bring a control into view and put the caret in it.
 *
 * Scroll first, focus with `preventScroll` second: letting the browser do its
 * own focus scroll on top of ours produces a double jump.
 */
export function focusField(id: string): void {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLElement)) return
  el.scrollIntoView({
    block: 'center',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
  el.focus({ preventScroll: true })
}

/* -------------------------------------------------------------------------- */
/*  Server-side validation, mapped back onto fields                            */
/* -------------------------------------------------------------------------- */

/**
 * `ApiError.fieldErrors()` returns paths like `items.2.frequency` and
 * `patient.phone`. Translate them into our field ids so a 422 lands on the
 * control that caused it instead of in a toast.
 */
export function mapServerFieldErrors(
  fieldErrors: Record<string, string>,
  draft: RxDraft,
): { fieldId: string; message: string }[] {
  const out: { fieldId: string; message: string }[] = []

  for (const [path, message] of Object.entries(fieldErrors)) {
    const item = /^items\.(\d+)\.(\w+)$/.exec(path)
    if (item) {
      const row = draft.rows[Number(item[1])]
      if (!row) continue
      const field = item[2]
      const id =
        field === 'frequency'
          ? rowFieldId.frequency(row.key)
          : field === 'duration_days'
            ? rowFieldId.days(row.key)
            : field === 'quantity'
              ? rowFieldId.quantity(row.key)
              : field === 'instructions'
                ? rowFieldId.instructions(row.key)
                : rowFieldId.medicine(row.key)
      out.push({ fieldId: id, message })
      continue
    }

    const patient = /^patient\.(\w+)$/.exec(path)
    if (patient) {
      const field = patient[1]
      out.push({
        fieldId:
          field === 'first_name'
            ? FIELD_IDS.patientFirst
            : field === 'last_name'
              ? FIELD_IDS.patientLast
              : FIELD_IDS.patientPhone,
        message,
      })
      continue
    }

    const top: Record<string, string> = {
      diagnosis: FIELD_IDS.diagnosis,
      chief_complaint: FIELD_IDS.chiefComplaint,
      advice: FIELD_IDS.advice,
      notes: FIELD_IDS.notes,
      follow_up_date: FIELD_IDS.followUp,
      patient_id: FIELD_IDS.patient,
      items: FIELD_IDS.addMedicine,
    }
    out.push({ fieldId: top[path] ?? FIELD_IDS.patient, message })
  }

  return out
}

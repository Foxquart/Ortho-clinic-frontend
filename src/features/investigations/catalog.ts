import type { InvestigationResponse } from '@/api/schema'

/**
 * One selectable test on the pad.
 *
 * `id` is null for the built-in fallback list and for a freehand line: those
 * exist only as text and are never sent as `investigation_ids`. Keeping the id
 * nullable is what lets the picker work before the catalogue endpoint ships.
 */
export interface InvestigationOption {
  id: string | null
  /** What prints. Also the line the picker writes into the text field. */
  name: string
  /** Grouping heading, e.g. `Blood`. Null groups under `General`. */
  category: string | null
}

/** The heading for options with no category. Never a server value. */
export const GENERAL_CATEGORY = 'General'

/**
 * The tests the printed page already has a box for, plus the common ones the
 * clinic asks for verbally. Used verbatim when `GET /investigations` is not
 * available (404 on an older backend, or no network), so the pad is useful on
 * day one and only gets richer when the catalogue exists.
 *
 * Order is the order the doctor reads them in: the paper's own order.
 */
export const INVESTIGATION_FALLBACK: readonly InvestigationOption[] = [
  { id: null, name: 'CBC', category: 'Blood' },
  { id: null, name: 'HBsAg', category: 'Blood' },
  { id: null, name: 'HIV', category: 'Blood' },
  { id: null, name: 'FBS', category: 'Blood' },
  { id: null, name: 'LFT', category: 'Blood' },
  { id: null, name: 'Thyroid Profile', category: 'Blood' },
  { id: null, name: 'Lipid Profile', category: 'Blood' },
  { id: null, name: 'Blood Group', category: 'Blood' },
  { id: null, name: 'BTCT', category: 'Blood' },
  { id: null, name: 'HCV', category: 'Blood' },
  { id: null, name: 'HbA1c', category: 'Blood' },
  { id: null, name: 'PPBS', category: 'Blood' },
  { id: null, name: 'KFT', category: 'Blood' },
  { id: null, name: 'ESR', category: 'Blood' },
  { id: null, name: 'X-ray', category: 'Radiology / Pathology' },
  { id: null, name: 'USG', category: 'Radiology / Pathology' },
  { id: null, name: 'MRI', category: 'Radiology / Pathology' },
  { id: null, name: 'CT Scan', category: 'Radiology / Pathology' },
  { id: null, name: 'ECG', category: 'Cardiovascular' },
  { id: null, name: 'Echocardiography', category: 'Cardiovascular' },
]

/** Server rows -> picker options. Inactive rows are the admin's retired list. */
export function toInvestigationOptions(
  rows: readonly InvestigationResponse[] | undefined,
): InvestigationOption[] {
  const active = (rows ?? []).filter((row) => row.is_active)
  if (active.length === 0) return [...INVESTIGATION_FALLBACK]
  return active.map((row) => ({
    id: row.id,
    name: row.name.trim(),
    category: row.category?.trim() || null,
  }))
}

export interface InvestigationGroup {
  /** Category name, or `General`. */
  name: string
  options: InvestigationOption[]
}

/**
 * Groups in the order the options arrive — the server's sort order — with
 * `General` last, mirroring the advice picker.
 */
export function groupInvestigations(options: readonly InvestigationOption[]): InvestigationGroup[] {
  const byName = new Map<string, InvestigationOption[]>()
  for (const option of options) {
    if (!option.name) continue
    const name = option.category?.trim() || GENERAL_CATEGORY
    const list = byName.get(name)
    if (list) list.push(option)
    else byName.set(name, [option])
  }
  return [...byName.entries()]
    .sort(([a], [b]) => (a === GENERAL_CATEGORY ? 1 : 0) - (b === GENERAL_CATEGORY ? 1 : 0))
    .map(([name, list]) => ({ name, options: list }))
}

/* -------------------------------------------------------------------------- */
/*  Text <-> ids                                                               */
/* -------------------------------------------------------------------------- */

/** The investigations text is line-delimited; a line is one test. */
export function investigationLines(value: string): Set<string> {
  return new Set(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

export function appendInvestigationLine(value: string, name: string): string {
  const existing = value.trimEnd()
  return existing ? `${existing}\n${name}` : name
}

export function removeInvestigationLine(value: string, name: string): string {
  return value
    .split('\n')
    .filter((line) => line.trim() !== name)
    .join('\n')
}

/**
 * Every catalogue id whose name is still a line in `text`.
 *
 * This is how the ids stay honest when the text is edited by something other
 * than the picker — the textarea, dictation, a template or "repeat last
 * prescription". The text stays the source of truth, exactly as it is for
 * advice; the ids are derived views of it.
 */
export function idsInText(text: string, options: readonly InvestigationOption[]): string[] {
  const lines = investigationLines(text)
  const ids: string[] = []
  for (const option of options) {
    if (option.id && lines.has(option.name)) ids.push(option.id)
  }
  return ids
}

/**
 * Merge ids that are already selected with those the text now mentions, and
 * drop any id whose line has been deleted.
 *
 * An id the current option list cannot resolve (the catalogue is in fallback
 * mode, or the row was retired after it was picked) is left alone rather than
 * silently discarded — losing structure on a transient fetch failure would be
 * worse than carrying an id the text no longer mentions.
 */
export function reconcileInvestigationIds(
  currentIds: readonly string[],
  text: string,
  options: readonly InvestigationOption[],
): string[] {
  const lines = investigationLines(text)
  const nameById = new Map(
    options.flatMap((option) => (option.id ? [[option.id, option.name] as const] : [])),
  )
  const kept = currentIds.filter((id) => {
    const name = nameById.get(id)
    return name === undefined || lines.has(name)
  })
  return [...new Set([...kept, ...idsInText(text, options)])]
}

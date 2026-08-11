import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ear, Loader2, Search, Trash2, TriangleAlert } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Select } from '@/components/ui/Controls'
import { Tooltip } from '@/components/ui/Menu'
import type { MedicineResponse } from '@/api/schema'
import { DoseScheduleInput } from './DoseSchedule'
import { FieldLabel, ProvenanceField } from './Provenance'
import { RxFieldStateMic } from './RxMic'
import { normaliseMedicineName } from './dictation'
import { isUnmatched, provenanceControlClass, rowFieldId, type RowMeta } from './padState'
import { entered, rowIssues, suggestQuantity, type DoseSchedule, type RxRow } from './model'

const FOOD_OPTIONS = [
  { value: 'after', label: 'After food' },
  { value: 'before', label: 'Before food' },
  { value: 'with', label: 'With food' },
] as const

/** Does any recorded allergy appear in this medicine's name? */
function matchesAllergy(medicine: string, allergies: readonly string[]): string | null {
  const haystack = medicine.toLowerCase()
  for (const allergy of allergies) {
    const needle = allergy.trim().toLowerCase()
    if (needle.length >= 3 && haystack.includes(needle)) return allergy
  }
  return null
}

export interface RxRowEditorProps {
  row: RxRow
  index: number
  meta: RowMeta
  allergies: readonly string[]
  /** Field id → server message, from a 422. */
  errors: Record<string, string>
  onChange: (next: RxRow) => void
  onRemove: () => void
  canRemove: boolean
  /** Enter was pressed in this row — move on. */
  onEnter: () => void
}

/**
 * One prescribed medicine.
 *
 * The three things that decide whether this line can be printed — which drug,
 * how much, when — sit on one line and are read together. Everything optional
 * drops to a second line the eye can skip.
 */
export function RxRowEditor({
  row,
  index,
  meta,
  allergies,
  errors,
  onChange,
  onRemove,
  canRemove,
  onEnter,
}: RxRowEditorProps) {
  // Seed the search with what was heard, so the candidate list is already
  // right when the doctor opens it.
  const [medicineQuery, setMedicineQuery] = useState(() => meta.spokenName ?? '')
  const debounced = useDebouncedValue(medicineQuery.trim(), 180)
  const seeded = useRef(meta.spokenName)

  useEffect(() => {
    if (meta.spokenName && meta.spokenName !== seeded.current) {
      seeded.current = meta.spokenName
      setMedicineQuery(meta.spokenName)
    }
  }, [meta.spokenName])

  const medicines = useQuery({
    queryKey: qk.medicines.search(debounced),
    queryFn: () =>
      apiGet<MedicineResponse[]>(endpoints.medicines.search, {
        params: { q: debounced, limit: 12 },
      }),
    enabled: debounced.length >= 1,
    staleTime: 30_000,
  })

  const issues = rowIssues(row)
  const has = (field: 'medicine' | 'dosage' | 'schedule') =>
    issues.some((i) => i.field === field)

  const unmatched = isUnmatched(row, meta)
  // Auto-matched from speech, and the formulary's name is not what was said.
  // The doctor gets to see both, because "Ultracet" → "Ultracet-P" is exactly
  // the substitution that needs a second pair of eyes.
  const matchedFromSpeech =
    Boolean(row.medicineId) &&
    meta.spokenName !== null &&
    normaliseMedicineName(meta.spokenName) !== normaliseMedicineName(row.medicineName)
  const allergyHit = row.medicineName ? matchesAllergy(row.medicineName, allergies) : null
  const quantityHint = suggestQuantity(row.schedule.value, row.durationDays.value)

  const selected: MedicineResponse | null = row.medicineId
    ? ({ id: row.medicineId, name: row.medicineName } as MedicineResponse)
    : null

  const patch = (next: Partial<RxRow>) => onChange({ ...row, ...next })

  const choose = (medicine: MedicineResponse) =>
    patch({ medicineId: medicine.id, medicineName: medicine.name })

  const dosageId = rowFieldId.dosage(row.key)
  const scheduleId = rowFieldId.schedule(row.key)
  const instructionsId = rowFieldId.instructions(row.key)

  return (
    <li
      data-row-key={row.key}
      className={cn(
        'relative rounded-lg border bg-surface p-3',
        'transition-colors duration-fast ease-standard',
        allergyHit
          ? 'border-allergy shadow-[inset_3px_0_0_0_var(--color-allergy)]'
          : unmatched
            ? 'border-provenance-heard shadow-[inset_3px_0_0_0_var(--color-provenance-heard)]'
            : 'border-border',
      )}
      onKeyDown={(e) => {
        // Enter walks the pad. It never submits — a prescription is printed
        // deliberately, from the action bar, not by a stray keystroke.
        if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
        const target = e.target as HTMLElement
        if (target.tagName === 'TEXTAREA') return
        if (target.closest('[cmdk-root]')) return
        e.preventDefault()
        onEnter()
      }}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-6 hidden w-5 shrink-0 text-right font-mono text-caption tabular-nums text-text-subtle sm:block"
        >
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          {unmatched && (
            <UnmatchedNotice
              spokenName={meta.spokenName ?? ''}
              candidates={meta.candidates}
              resolving={meta.resolving}
              onChoose={choose}
              onSearch={() => document.getElementById(rowFieldId.medicine(row.key))?.click()}
            />
          )}

          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <div>
              <FieldLabel htmlFor={rowFieldId.medicine(row.key)}>Medicine</FieldLabel>
              <Combobox<MedicineResponse>
                id={rowFieldId.medicine(row.key)}
                value={selected}
                onChange={choose}
                query={medicineQuery}
                onQueryChange={setMedicineQuery}
                items={medicines.data ?? []}
                loading={medicines.isFetching}
                getKey={(m) => m.id}
                getLabel={(m) => m.name}
                invalid={has('medicine')}
                className={cn(!row.medicineId && 'border-dashed border-provenance-blank')}
                placeholder={unmatched ? `“${meta.spokenName}” — not matched` : '—'}
                searchPlaceholder="Brand or generic name…"
                emptyMessage={
                  debounced
                    ? `Nothing in the formulary matches “${debounced}”.`
                    : 'Start typing to search.'
                }
                renderItem={(m) => <MedicineOption medicine={m} />}
              />
              {matchedFromSpeech && (
                <p className="mt-1 flex items-center gap-1 text-caption text-text-subtle">
                  <Ear aria-hidden className="size-3 shrink-0 text-provenance-heard" />
                  Heard “{meta.spokenName}” — matched for you. Check it.
                </p>
              )}
            </div>

            <div>
              <FieldLabel htmlFor={dosageId} provenance={row.dosage.provenance}>
                Dose
              </FieldLabel>
              <ProvenanceField provenance={row.dosage.provenance}>
                <Input
                  id={dosageId}
                  value={row.dosage.value}
                  invalid={has('dosage') || Boolean(errors[dosageId])}
                  // Never an example value in a blank required field.
                  placeholder="—"
                  maxLength={128}
                  autoComplete="off"
                  className={provenanceControlClass(row.dosage.provenance)}
                  onChange={(e) => patch({ dosage: entered(e.target.value) })}
                />
              </ProvenanceField>
            </div>

            <div>
              <FieldLabel htmlFor={scheduleId} provenance={row.schedule.provenance}>
                Timing
              </FieldLabel>
              <ProvenanceField provenance={row.schedule.provenance} className="inline-block">
                <DoseScheduleInput
                  id={scheduleId}
                  value={row.schedule.value}
                  onChange={(next: DoseSchedule) => patch({ schedule: entered(next) })}
                />
              </ProvenanceField>
            </div>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[6rem_7rem_10rem_minmax(0,1fr)]">
            <div>
              <FieldLabel htmlFor={rowFieldId.days(row.key)} provenance={row.durationDays.provenance}>
                Days
              </FieldLabel>
              <Input
                id={rowFieldId.days(row.key)}
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                value={row.durationDays.value ?? ''}
                placeholder="—"
                invalid={Boolean(errors[rowFieldId.days(row.key)])}
                onChange={(e) =>
                  patch({
                    durationDays: entered(e.target.value === '' ? null : Number(e.target.value)),
                  })
                }
              />
            </div>

            <div>
              <FieldLabel htmlFor={rowFieldId.quantity(row.key)}>Quantity</FieldLabel>
              <Input
                id={rowFieldId.quantity(row.key)}
                type="number"
                min={1}
                max={10000}
                inputMode="numeric"
                value={row.quantity.value ?? ''}
                placeholder="—"
                invalid={Boolean(errors[rowFieldId.quantity(row.key)])}
                onChange={(e) =>
                  patch({
                    quantity: entered(e.target.value === '' ? null : Number(e.target.value)),
                  })
                }
                slotRight={
                  // A suggestion the doctor applies, never an auto-fill.
                  quantityHint !== null && row.quantity.value === null ? (
                    <Tooltip content={`Use ${quantityHint} — enough for the full course`}>
                      <button
                        type="button"
                        aria-label={`Set quantity to ${quantityHint}`}
                        onClick={() => patch({ quantity: entered(quantityHint) })}
                        className="rounded px-1 font-mono text-caption text-accent hover:bg-accent-muted"
                      >
                        {quantityHint}
                      </button>
                    </Tooltip>
                  ) : undefined
                }
              />
            </div>

            <div>
              <FieldLabel htmlFor={rowFieldId.food(row.key)}>Food</FieldLabel>
              <Select
                id={rowFieldId.food(row.key)}
                value={row.food ?? undefined}
                onChange={(v) => patch({ food: v as RxRow['food'] })}
                options={FOOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                placeholder="—"
                aria-label="Food timing"
              />
            </div>

            <div>
              <FieldLabel
                htmlFor={instructionsId}
                provenance={row.instructions.provenance}
                action={
                  <RxFieldStateMic
                    id={instructionsId}
                    label={`Dictate instructions for ${row.medicineName || `medicine ${index + 1}`}`}
                    field={row.instructions}
                    onChange={(next) => patch({ instructions: next })}
                  />
                }
              >
                Instructions
              </FieldLabel>
              <ProvenanceField provenance={row.instructions.provenance}>
                <Input
                  id={instructionsId}
                  value={row.instructions.value}
                  maxLength={2000}
                  placeholder="—"
                  invalid={Boolean(errors[instructionsId])}
                  className={provenanceControlClass(row.instructions.provenance)}
                  onChange={(e) => patch({ instructions: entered(e.target.value) })}
                />
              </ProvenanceField>
            </div>
          </div>

          {allergyHit && (
            <p
              className="mt-2.5 flex items-center gap-2 rounded-md bg-allergy px-2.5 py-1.5 text-caption font-medium text-allergy-fg"
            >
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              This patient is recorded as allergic to “{allergyHit}”.
            </p>
          )}

          {issues.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-caption text-provenance-blank">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-xs border border-dashed border-provenance-blank"
              />
              {issues.map((i) => i.message).join(' · ')} — this line cannot be printed yet.
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          disabled={!canRemove}
          aria-label={row.medicineName ? `Remove ${row.medicineName}` : `Remove item ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </li>
  )
}

function MedicineOption({ medicine }: { medicine: MedicineResponse }) {
  return (
    <span className="flex flex-col">
      <span className="flex items-baseline gap-2">
        <span className="truncate text-text">{medicine.name}</span>
        {medicine.strength && (
          <span className="shrink-0 font-mono text-caption text-text-subtle">
            {medicine.strength}
          </span>
        )}
      </span>
      {(medicine.generic_name ?? medicine.brand_name) && (
        <span className="truncate text-caption text-text-subtle">
          {[medicine.generic_name, medicine.brand_name].filter(Boolean).join(' · ')}
        </span>
      )}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Unmatched dictation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Dictation heard a drug name the formulary would not confirm.
 *
 * The spoken words stay on screen verbatim — deleting what the doctor said
 * because a fuzzy search was not confident enough would be the worst possible
 * response — and the server's ranked candidates sit one click away. Nothing is
 * chosen on the doctor's behalf, and the row keeps blocking the print until
 * one of them is.
 */
function UnmatchedNotice({
  spokenName,
  candidates,
  resolving,
  onChoose,
  onSearch,
}: {
  spokenName: string
  candidates: readonly MedicineResponse[]
  resolving: boolean
  onChoose: (medicine: MedicineResponse) => void
  onSearch: () => void
}) {
  return (
    <div className="mb-2.5 rounded-md border border-provenance-heard/40 bg-provenance-heard-muted px-2.5 py-2">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-text">
        <Ear aria-hidden className="size-3.5 shrink-0 text-provenance-heard" />
        <span className="text-provenance-heard">Heard</span>
        <strong className="font-semibold text-text">“{spokenName}”</strong>
        <span className="text-text-muted">— no confident match in the formulary.</span>
      </p>

      {resolving ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-caption text-text-muted">
          <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
          Searching the formulary…
        </p>
      ) : candidates.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-text-muted">Did you mean</span>
          {candidates.slice(0, 4).map((medicine) => (
            <button
              key={medicine.id}
              type="button"
              onClick={() => onChoose(medicine)}
              className={cn(
                'inline-flex items-baseline gap-1.5 rounded-sm border border-border-field bg-surface px-2 py-0.5',
                'text-caption text-text transition-colors duration-instant ease-standard',
                'hover:border-accent hover:bg-accent-muted',
              )}
            >
              {medicine.name}
              {medicine.strength && (
                <span className="font-mono text-micro text-text-subtle">{medicine.strength}</span>
              )}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={onSearch} iconLeft={<Search className="size-3.5" />}>
            Search
          </Button>
        </div>
      ) : (
        <p className="mt-1.5 text-caption text-text-muted">
          The formulary returned nothing for it. Search by hand, or add it to the formulary first.
        </p>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Ear, Loader2, Search, Trash2, TriangleAlert } from 'lucide-react'
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
import type { MedicineResponse, Page_MedicineResponse_ } from '@/api/schema'
import { FieldLabel, ProvenanceField, TAP_ICON, TAP_TARGET } from './Provenance'
// Per-field mic icons hidden at user request. Import commented out with the
// action={...} block below — restore both together.
// import { RxFieldStateMic } from './RxMic'
import { normaliseMedicineName } from './dictation'
import { applyMedicineDefaults } from './medicineDefaults'
import { isUnmatched, provenanceControlClass, rowFieldId, type RowMeta } from './padState'
import { entered, rowIssues, suggestQuantity, type RxRow } from './model'

const FOOD_OPTIONS = [
  { value: 'after', label: 'After food' },
  { value: 'before', label: 'Before food' },
  { value: 'with', label: 'With food' },
] as const

/**
 * One tap each for the frequencies this clinic writes all day. The mono value
 * is what lands in the field; the words are what the doctor thinks in.
 * "SOS" also marks the row as-needed (PRN).
 */
const FREQUENCY_PRESETS = [
  { value: '1-0-0', label: 'Morning' },
  { value: '1-0-1', label: 'Morning & night' },
  { value: '1-1-1', label: 'Thrice daily' },
  { value: '0-0-1', label: 'At night' },
  { value: 'SOS', label: 'As needed' },
] as const

/** How the formulary is browsed when nothing has been typed yet. */
const BROWSE_PARAMS = { page: 1, page_size: 10, sort_by: 'name', sort_order: 'asc' } as const

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
 * The things that decide whether this line can be printed and dispensed —
 * which drug, how often, for how long — sit on one line and are read
 * together. Instructions stay visible because they are clinical; quantity and
 * food timing fold behind "More" so an ordinary row is one glance and done.
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

  const searching = debounced.length >= 1

  const medicines = useQuery({
    queryKey: qk.medicines.search(debounced),
    queryFn: () =>
      apiGet<MedicineResponse[]>(endpoints.medicines.search, {
        params: { q: debounced, limit: 12 },
      }),
    enabled: searching,
    staleTime: 30_000,
  })

  // With nothing typed, the formulary is browsed rather than hidden: the
  // search endpoint requires a non-empty `q`, and an empty dropdown over a
  // populated formulary reads as "no medicines exist". A failed browse
  // degrades to the typed-search behaviour, never to an error state.
  const browse = useQuery({
    queryKey: qk.medicines.list(BROWSE_PARAMS),
    queryFn: () =>
      apiGet<Page_MedicineResponse_>(endpoints.medicines.list, { params: BROWSE_PARAMS }),
    enabled: !searching,
    staleTime: 60_000,
  })

  const options = searching
    ? (medicines.data ?? [])
    : (browse.data?.items ?? []).filter((m) => m.is_active)

  const issues = rowIssues(row)
  const has = (field: 'medicine' | 'frequency') =>
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
  const quantityHint = suggestQuantity(row.frequency.value, row.durationDays.value)

  const selected: MedicineResponse | null = row.medicineId
    ? ({ id: row.medicineId, name: row.medicineName } as MedicineResponse)
    : null

  const patch = (next: Partial<RxRow>) => onChange({ ...row, ...next })

  // Selecting a medicine also pulls in its prescription defaults: blank
  // fields fill as `defaulted` ("Carried over"), touched fields are never
  // overwritten, and a swap clears the previous medicine's defaults first.
  const choose = (medicine: MedicineResponse) => onChange(applyMedicineDefaults(row, medicine))

  const frequencyId = rowFieldId.frequency(row.key)
  const quantityId = rowFieldId.quantity(row.key)
  const instructionsId = rowFieldId.instructions(row.key)

  // Quantity and food fold away by default; a row that already carries either
  // (dictated, carried over, or from a server error) arrives unfolded, because
  // hiding a filled-in value is worse than showing an extra line.
  const [showMore, setShowMore] = useState(
    () => row.quantity.value !== null || row.food !== null,
  )
  useEffect(() => {
    if (errors[quantityId] || errors[rowFieldId.food(row.key)]) setShowMore(true)
  }, [errors, quantityId, row.key])
  // A value landing in the folded section after mount — a medicine default
  // filling the food timing, a dictation update — unfolds it, for the same
  // reason as above: a filled-in value must never sit hidden.
  useEffect(() => {
    if (row.quantity.value !== null || row.food !== null) setShowMore(true)
  }, [row.quantity.value, row.food])

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
        // Buttons (frequency presets, More, remove) keep their native Enter.
        if (target.closest('button')) return
        if (target.closest('[cmdk-root]')) return
        e.preventDefault()
        onEnter()
      }}
    >
      {/* A container, not a viewport consumer. This row sits in whichever column
          the pad gives it — a ~430px form column on a laptop, full width on a
          phone — and viewport breakpoints got that wrong in both directions:
          at 1600px wide `lg:` fired and forced a four-column grid needing
          ~400px of fixed track into a 428px column, which is what collapsed the
          Medicine and Dose labels on top of each other. */}
      <div className="@container flex items-start gap-2">
        <span
          aria-hidden
          className="mt-6 hidden w-5 shrink-0 text-right font-mono text-caption tabular-nums text-text-subtle @xs:block"
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

          {/* Three shapes, chosen by the column this row is sitting in:
              stacked when very narrow, then medicine over frequency/days,
              then a single dense line once there is room for all three. */}
          {/* Frequency and Days each bottom-align their control inside
              the row rather than top-align it. Their labels carry a provenance
              tag and the narrow Days track cannot hold "Days · Carried over"
              on one line, so on a tablet that one label wrapped and dropped
              its input half a row below the other — on every medicine
              "Continue previous" brings across. Aligned from the bottom, the
              label may be one line or two and the fields still read as
              one line of the prescription. */}
          <div className="grid gap-2.5 @xs:grid-cols-2 @md:grid-cols-[minmax(0,1fr)_4.5rem] @3xl:grid-cols-[minmax(0,1fr)_minmax(8rem,10rem)_4.5rem]">
            <div className="@xs:col-span-2 @md:col-span-2 @3xl:col-span-1">
              <FieldLabel
                htmlFor={rowFieldId.medicine(row.key)}
                hint="The drug to prescribe. Click to browse your medicines, or type to search by name, generic or brand."
              >
                Medicine
              </FieldLabel>
              <Combobox<MedicineResponse>
                id={rowFieldId.medicine(row.key)}
                value={selected}
                onChange={choose}
                query={medicineQuery}
                onQueryChange={setMedicineQuery}
                items={options}
                loading={searching ? medicines.isFetching : browse.isFetching}
                getKey={(m) => m.id}
                getLabel={(m) => m.name}
                invalid={has('medicine')}
                className={cn(TAP_TARGET, !row.medicineId && 'border-dashed border-provenance-blank')}
                placeholder={unmatched ? `“${meta.spokenName}” — not matched` : '—'}
                searchPlaceholder="Brand or generic name…"
                emptyMessage={
                  searching
                    ? `Nothing in the formulary matches “${debounced}”.`
                    : 'No medicines in the formulary yet.'
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

            <div className="flex flex-col justify-end">
              <FieldLabel
                htmlFor={frequencyId}
                provenance={row.frequency.provenance}
                hint="When it is taken. 1-0-1 means one in the morning, none at midday, one at night. SOS means only when needed."
              >
                Frequency
              </FieldLabel>
              <ProvenanceField provenance={row.frequency.provenance}>
                <Input
                  id={frequencyId}
                  value={row.frequency.value}
                  invalid={has('frequency') || Boolean(errors[frequencyId])}
                  placeholder='1-0-1, or "before bed"'
                  maxLength={128}
                  autoComplete="off"
                  className={cn(TAP_TARGET, provenanceControlClass(row.frequency.provenance))}
                  onChange={(e) => patch({ frequency: entered(e.target.value) })}
                />
              </ProvenanceField>
            </div>

            <div className="flex flex-col justify-end">
              <FieldLabel
                htmlFor={rowFieldId.days(row.key)}
                provenance={row.durationDays.provenance}
                hint="How many days the patient continues this medicine."
              >
                Days
              </FieldLabel>
              <ProvenanceField provenance={row.durationDays.provenance}>
                <Input
                  id={rowFieldId.days(row.key)}
                  type="number"
                  min={1}
                  max={3650}
                  inputMode="numeric"
                  value={row.durationDays.value ?? ''}
                  placeholder="—"
                  invalid={Boolean(errors[rowFieldId.days(row.key)])}
                  className={cn(TAP_TARGET, provenanceControlClass(row.durationDays.provenance))}
                  onChange={(e) =>
                    patch({
                      durationDays: entered(e.target.value === '' ? null : Number(e.target.value)),
                    })
                  }
                />
              </ProvenanceField>
            </div>
          </div>

          <div
            role="group"
            aria-label="Frequency presets"
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            {FREQUENCY_PRESETS.map((preset) => {
              const active = row.frequency.value.trim() === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    // A preset is typed-by-tap: it is the doctor's own choice,
                    // so it lands as `entered`. SOS is the one that means
                    // as-needed; picking a timed preset un-marks PRN.
                    patch({ frequency: entered(preset.value), prn: preset.value === 'SOS' })
                  }
                  className={cn(
                    'inline-flex min-h-tap items-center gap-1.5 rounded-full border px-3 text-label lg:min-h-10',
                    'transition-colors duration-instant ease-standard',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                    active
                      ? 'border-accent/40 bg-accent-muted text-accent-muted-fg'
                      : 'border-border bg-surface text-text-muted hover:border-accent hover:bg-accent-muted hover:text-accent-muted-fg',
                  )}
                >
                  <span className="font-mono tabular-nums">{preset.value}</span>
                  <span>{preset.label}</span>
                </button>
              )
            })}
          </div>

          {/* Instructions and the More toggle share a line the moment there is
              one to share. In a phone-width column there is not: a 44px field
              with a button parked in its last 70px is a field you cannot read
              what you typed into, so the toggle drops below and sits left. */}
          <div className="mt-2.5 flex flex-col gap-2 @xs:flex-row @xs:flex-wrap @xs:items-end @xs:gap-2.5">
            <div className="min-w-0 @xs:flex-1">
              <FieldLabel
                htmlFor={instructionsId}
                provenance={row.instructions.provenance}
                hint="Anything the patient must know for this medicine, for example after food or with warm water. Printed with the medicine."

                // Per-field mic icons hidden at user request. Uncomment this block
                // and the RxFieldStateMic import above to restore it.
                // action={
                //   <RxFieldStateMic
                //     id={instructionsId}
                //     label={`Dictate instructions for ${row.medicineName || `medicine ${index + 1}`}`}
                //     field={row.instructions}
                //     onChange={(next) => patch({ instructions: next })}
                //   />
                // }
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
                  className={cn(TAP_TARGET, provenanceControlClass(row.instructions.provenance))}
                  onChange={(e) => patch({ instructions: entered(e.target.value) })}
                />
              </ProvenanceField>
            </div>

            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showMore}
              className={cn(TAP_TARGET, 'self-start @xs:self-auto')}
              onClick={() => setShowMore((v) => !v)}
              iconRight={
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-transform duration-fast ease-standard',
                    showMore && 'rotate-180',
                  )}
                />
              }
            >
              {showMore ? 'Less' : 'More'}
            </Button>
          </div>

          {showMore && (
            <div className="mt-2.5 grid gap-2.5 @xs:grid-cols-[6rem_minmax(0,1fr)]">
              <div>
                <FieldLabel
                  htmlFor={quantityId}
                  hint="Total units to hand over for the whole course. Suggested automatically from frequency and days when possible."
                >
                  Quantity
                </FieldLabel>
                <Input
                  id={quantityId}
                  type="number"
                  min={1}
                  max={10000}
                  inputMode="numeric"
                  value={row.quantity.value ?? ''}
                  placeholder="—"
                  invalid={Boolean(errors[quantityId])}
                  className={TAP_TARGET}
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
                <FieldLabel
                  htmlFor={rowFieldId.food(row.key)}
                  hint="Whether to take it before, after or with food."
                >
                  Food
                </FieldLabel>
                <Select
                  id={rowFieldId.food(row.key)}
                  value={row.food ?? undefined}
                  onChange={(v) => patch({ food: v as RxRow['food'] })}
                  options={FOOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  placeholder="—"
                  aria-label="Food timing"
                  className={TAP_TARGET}
                />
              </div>
            </div>
          )}

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
          className={cn('shrink-0', TAP_ICON)}
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
                'inline-flex min-h-tap items-center gap-1.5 rounded-sm border border-border-field bg-surface px-2.5',
                'text-caption text-text transition-colors duration-instant ease-standard',
                'hover:border-accent hover:bg-accent-muted lg:min-h-0 lg:items-baseline lg:px-2 lg:py-0.5',
              )}
            >
              {medicine.name}
              {medicine.strength && (
                <span className="font-mono text-micro text-text-subtle">{medicine.strength}</span>
              )}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className={TAP_TARGET}
            onClick={onSearch}
            iconLeft={<Search className="size-3.5" />}
          >
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

import { Table, TD, TH, THead, TR } from '@/components/ui/Table'
import { cn } from '@/lib/cn'
import { humanizeEnum } from '@/lib/format'
import type { PrescriptionItemResponse } from '@/api/schema'

/** The stored duration, or an em dash. Shared so the two renders cannot drift. */
function durationLabel(days: number | null): string | null {
  if (days == null) return null
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * One labelled value inside a phone card. `—` when the field was left blank —
 * an absent duration is worth a line of its own, because "no duration given"
 * is a thing a doctor checking a sheet needs to SEE, not infer from a gap.
 *
 * `numeric` and `mono` are handed down to match the desktop columns exactly:
 * tabular figures on the counts, the monospace face on the frequency (so
 * "1-0-1" keeps the shape it was typed in).
 */
function Field({
  label,
  value,
  mono,
  numeric,
}: {
  label: string
  value: string | null
  mono?: boolean
  numeric?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-text-subtle uppercase">{label}</dt>
      <dd
        data-numeric={numeric || undefined}
        className={cn(
          'text-label mt-0.5',
          value ? 'text-text' : 'text-text-subtle',
          mono && 'font-mono',
        )}
      >
        {value ?? '—'}
      </dd>
    </div>
  )
}

/**
 * The medicine lines, read the way a prescription is read: one row per drug,
 * strength next to the name, the stored frequency exactly as it was written
 * ("1-0-1", "SOS", "before bed"), everything else in a fixed column so the eye
 * can run straight down it.
 *
 * Two renders of the same data, chosen at `sm`. Seven columns need ~610px, so
 * on a phone the table survives only by scrolling sideways inside its wrapper —
 * and a prescription that has to be dragged left and right to be read is not a
 * prescription anyone can check. Below `sm` each medicine becomes its own card:
 * name and strength as the heading, the rest as labelled pairs, everything
 * visible without a horizontal gesture. From `sm` up the table is exactly what
 * it always was, because on a desktop the aligned columns ARE the feature.
 *
 * Read-only by construction — prescriptions are append-only over HTTP.
 */
export function RxMedicinesView({ items }: { items: PrescriptionItemResponse[] }) {
  // `sort_order` is the doctor's own ordering; the array order is not promised.
  // Sorted once, up here, so the phone and desktop renders cannot disagree
  // about what medicine number 2 is.
  const rows = [...items].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      {/* Phone: one card per medicine. */}
      <ol className="divide-border border-border divide-y border-t sm:hidden">
        {rows.map((item, index) => {
          const subtitle = [item.medicine.generic_name, humanizeEnum(item.medicine.dosage_form)]
            .filter(Boolean)
            .join(' · ')

          return (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-caption text-text-subtle shrink-0" data-numeric>
                  {index + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-body text-text font-medium">
                    {item.medicine.name}
                    {item.medicine.strength && (
                      <span className="text-label text-text-muted ml-1.5">
                        {item.medicine.strength}
                      </span>
                    )}
                  </p>
                  {subtitle && <p className="text-caption text-text-subtle mt-0.5">{subtitle}</p>}
                </div>
              </div>

              {/* Two columns even at 320px: these values are short ("1-0-1",
                  "5 days", "10") and stacking them one per line would
                  turn a three-drug prescription into a page of scrolling — the
                  exact thing this render exists to remove. */}
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 pl-5">
                <Field label="Frequency" value={item.frequency || null} mono />
                <Field label="Duration" value={durationLabel(item.duration_days)} numeric />
                <Field
                  label="Qty"
                  value={item.quantity == null ? null : String(item.quantity)}
                  numeric
                />
                {/* Instructions are a sentence, not a value — full width, and
                    only when there is one, so a blank does not cost a line. */}
                {item.instructions && (
                  <div className="col-span-2 min-w-0">
                    <dt className="text-micro text-text-subtle uppercase">Instructions</dt>
                    <dd className="text-caption text-text-muted mt-0.5">{item.instructions}</dd>
                  </div>
                )}
              </dl>
            </li>
          )
        })}
      </ol>

      {/* Desktop: unchanged. */}
      <div className="hidden sm:block">
        <Table label="Prescribed medicines">
          <THead>
            <TH width="2.5rem" align="right">
              #
            </TH>
            <TH>Medicine</TH>
            <TH width="7.5rem">Frequency</TH>
            <TH width="6rem" align="right">
              Duration
            </TH>
            <TH width="4.5rem" align="right">
              Qty
            </TH>
            <TH>Instructions</TH>
          </THead>
          <tbody>
            {rows.map((item, index) => (
              <TR key={item.id} className="align-top">
                <TD align="right" numeric className="text-caption text-text-subtle pt-2.5">
                  {index + 1}
                </TD>
                <TD className="pt-2">
                  <span className="text-body text-text font-medium">{item.medicine.name}</span>
                  {item.medicine.strength && (
                    <span className="text-label text-text-muted ml-1.5">
                      {item.medicine.strength}
                    </span>
                  )}
                  <span className="text-caption text-text-subtle mt-0.5 block">
                    {[item.medicine.generic_name, humanizeEnum(item.medicine.dosage_form)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </TD>
                <TD className="text-label text-text pt-2.5 font-mono">{item.frequency}</TD>
                <TD align="right" className="text-label text-text pt-2.5 whitespace-nowrap">
                  {item.duration_days == null ? (
                    <span className="text-text-subtle">—</span>
                  ) : (
                    <span data-numeric>{durationLabel(item.duration_days)}</span>
                  )}
                </TD>
                <TD align="right" numeric className="text-label text-text pt-2.5">
                  {item.quantity ?? <span className="text-text-subtle">—</span>}
                </TD>
                <TD className="text-caption text-text-muted pt-2.5">
                  {item.instructions ?? <span className="text-text-subtle">—</span>}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  )
}

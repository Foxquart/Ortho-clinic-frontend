/**
 * The two places an allergy is allowed to appear.
 *
 * `theme.css` is explicit: the allergy role is patient danger, not UI danger.
 * It is ALWAYS a solid fill with an icon — never a tint, never dismissible,
 * never behind a disclosure. Both components below obey that, including the
 * one that has to live inside a dense table row.
 *
 * The absence of a warning is also information, so it is stated out loud
 * rather than rendered as nothing — and "none recorded" is kept distinct from
 * "asked, and there are none", because only one of those two is reassuring.
 */

import { AlertTriangle, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { cn } from '@/lib/cn'
import { cleanAllergies } from './api'

/** How many allergen names fit on a table row before it stops being scannable. */
const CHIP_NAMES = 2

/**
 * The table-row treatment. One solid chip per patient, not per allergen, so a
 * column of them still reads as a column.
 */
export function AllergyChip({ allergies }: { allergies: string[] | null | undefined }) {
  const list = cleanAllergies(allergies)
  if (list.length === 0) return null

  const shown = list.slice(0, CHIP_NAMES)
  const overflow = list.length - shown.length

  return (
    <span
      title={list.join(', ')}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-xs bg-allergy px-1.5 py-0.5',
        'text-micro uppercase text-allergy-fg',
      )}
    >
      <AlertTriangle aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">Allergic to </span>
      <span className="truncate">{shown.join(', ')}</span>
      {overflow > 0 && <span className="shrink-0 opacity-80">+{overflow}</span>}
    </span>
  )
}

/**
 * The detail-screen banner. Full width, solid, unmissable, and never collapsed.
 * When there is nothing to warn about it says so quietly instead of vanishing.
 */
export function AllergyBanner({
  allergies,
  className,
}: {
  allergies: string[] | null | undefined
  className?: string
}) {
  const list = cleanAllergies(allergies)

  if (list.length === 0) {
    // `null` means nobody has ever asked. `[]` means somebody asked and the
    // answer was none. Collapsing the two would invent a reassurance.
    const asked = Array.isArray(allergies)
    return (
      <p
        className={cn(
          'flex items-center gap-2 text-caption text-text-muted',
          className,
        )}
      >
        {asked ? (
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-text-subtle" />
        ) : (
          <ShieldQuestion aria-hidden className="size-4 shrink-0 text-warning" />
        )}
        {asked
          ? 'No known allergies.'
          : 'No allergies recorded — this is not the same as none. Ask before prescribing an NSAID.'}
      </p>
    )
  }

  return (
    <div
      role="note"
      aria-label="Allergy warning"
      className={cn(
        'flex items-start gap-3 rounded-lg bg-allergy px-4 py-3 text-allergy-fg shadow-sm',
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-micro uppercase opacity-90">
          {list.length === 1 ? 'Allergy' : 'Allergies'}
        </p>
        <p className="mt-0.5 text-heading font-semibold">{list.join(' · ')}</p>
      </div>
    </div>
  )
}

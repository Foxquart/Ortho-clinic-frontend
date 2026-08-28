import { CircleDashed, Mic, PenLine, WandSparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Menu'
import type { Provenance } from './model'

const COPY: Record<Provenance, { label: string; explain: string }> = {
  heard: { label: 'Heard', explain: 'Transcribed from what you said during this consultation.' },
  defaulted: {
    label: 'Carried over',
    explain:
      'Filled from a previous prescription or a default, not from this consultation — check it before printing.',
  },
  entered: { label: 'Typed', explain: 'You typed this yourself. This is the baseline.' },
  blank: {
    label: 'Blank',
    explain:
      'Never spoken and never typed. It stays empty — nothing is filled in on your behalf — and printing is blocked until you set it.',
  },
}

/**
 * Minimum touch target, applied to a pad control the doctor actually taps.
 *
 * Every control here is 26–32px tall, which is right under a mouse and about
 * half of what a thumb needs. The shared primitives are not the place to fix
 * that — they are used on screens that are not touch-first — so the pad grows
 * its own controls to the 44px `--spacing-tap` token and hands the height back
 * at `lg`, leaving the laptop pad unchanged to the pixel. `lg` and not `sm`
 * because a tablet held in one hand is a touchscreen at 900px too.
 */
export const TAP_TARGET = 'min-h-tap lg:min-h-0'

/** {@link TAP_TARGET} for a square icon button, which is width-bound as well. */
export const TAP_ICON = 'min-h-tap min-w-tap lg:min-h-0 lg:min-w-0'

/**
 * The visual treatment for where a value came from.
 *
 * Shape carries the meaning, not hue: a solid rail, a dotted rail, a dashed
 * outline and nothing at all are four states you can tell apart in greyscale,
 * across the room, at 200% zoom. Colour only reinforces them.
 *
 * `entered` gets no rail on purpose (DESIGN.md §7): a value the doctor typed is
 * the baseline, and marking the baseline would drain the marks of meaning. The
 * legend names it so the absence reads as a state rather than an oversight.
 */
export function ProvenanceField({
  provenance,
  children,
  className,
}: {
  provenance: Provenance
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-provenance={provenance}
      className={cn(
        provenance === 'heard' && 'prov-heard',
        provenance === 'defaulted' && 'prov-defaulted',
        provenance === 'blank' && 'prov-blank',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Small badge naming the provenance, sat next to the field's label.
 *
 * Shown for every state except `entered`, which is the unmarked baseline.
 */
export function ProvenanceTag({
  provenance,
  className,
}: {
  provenance: Provenance
  className?: string
}) {
  if (provenance === 'entered') return null

  const { label, explain } = COPY[provenance]
  const Icon =
    provenance === 'heard' ? Mic : provenance === 'defaulted' ? WandSparkles : CircleDashed

  return (
    <Tooltip content={explain}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-xs px-1 py-px text-micro uppercase',
          provenance === 'heard' && 'bg-provenance-heard-muted text-provenance-heard',
          provenance === 'defaulted' &&
            'bg-provenance-defaulted-muted text-provenance-defaulted',
          provenance === 'blank' && 'bg-provenance-blank-muted text-provenance-blank',
          className,
        )}
      >
        <Icon aria-hidden className="size-2.5" />
        {label}
      </span>
    </Tooltip>
  )
}

/**
 * The pad's standard field label: name, provenance, and a slot on the right
 * for the per-field microphone. Every labelled control on the pad uses this, so
 * the mic is always in the same place and the provenance is always next to the
 * name it describes.
 */
export function FieldLabel({
  htmlFor,
  children,
  provenance,
  action,
  hint,
  className,
}: {
  htmlFor?: string
  children: React.ReactNode
  provenance?: Provenance
  action?: React.ReactNode
  /**
   * Plain-language explanation of what the field means, shown on hover of the
   * label. Written for the doctor, not for us: say what to put in and what it
   * does, never restate the label. The dotted underline is the affordance.
   */
  hint?: string
  className?: string
}) {
  const label = (
    <label
      htmlFor={htmlFor}
      className={cn(
        'text-micro uppercase text-text-muted',
        hint &&
          'cursor-help underline decoration-border-strong decoration-dotted underline-offset-4',
      )}
    >
      {children}
    </label>
  )
  return (
    <div className={cn('mb-1 flex min-h-5 items-center gap-1.5', className)}>
      {hint ? (
        <Tooltip content={<span className="max-w-64 text-pretty">{hint}</span>} side="top">
          {label}
        </Tooltip>
      ) : (
        label
      )}
      {provenance && <ProvenanceTag provenance={provenance} />}
      {action && <span className="ml-auto flex items-center">{action}</span>}
    </div>
  )
}

const LEGEND: { provenance: Provenance; sample: React.ReactNode; note: string }[] = [
  {
    provenance: 'heard',
    sample: <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-provenance-heard" />,
    note: 'you said it',
  },
  {
    provenance: 'defaulted',
    sample: (
      <span
        aria-hidden
        className="h-3.5 border-l-2 border-dotted border-provenance-defaulted"
      />
    ),
    note: 'from a past visit — verify',
  },
  {
    provenance: 'entered',
    sample: <PenLine aria-hidden className="size-3 text-text-subtle" />,
    note: 'no marker — typed is the baseline',
  },
  {
    provenance: 'blank',
    sample: (
      <span
        aria-hidden
        className="h-3.5 w-4 rounded-xs border border-dashed border-provenance-blank"
      />
    ),
    note: 'blocks printing',
  },
]

/**
 * All four states in one line, so the rails are never a private code the
 * doctor has to learn twice. `entered` is listed precisely because it looks
 * like nothing — an unexplained absence is not a state.
 */
export function ProvenanceLegend({ className }: { className?: string }) {
  return (
    <dl className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      <dt className="sr-only">Field source key</dt>
      <span aria-hidden className="text-micro uppercase text-text-subtle">
        Field source
      </span>
      {LEGEND.map(({ provenance, sample, note }) => (
        <dd
          key={provenance}
          className="flex items-center gap-1.5 text-caption text-text-muted"
        >
          <span className="grid w-4 place-items-center">{sample}</span>
          {/* Muted, not full-strength: the legend is metadata and must never
              read as loud as the prescription it annotates. */}
          <span className="text-text-muted">{COPY[provenance].label}</span>
          <span className="text-text-subtle">· {note}</span>
        </dd>
      ))}
    </dl>
  )
}

import { cn } from '@/lib/cn'
import { parseSchedule } from './model'

/**
 * The read-side rendering of the clinic's `"1-0-1"` frequency convention.
 *
 * The string is parsed with `parseSchedule` from the shared model — never
 * re-implemented here — and shown as three labelled slots so the doctor reads
 * the timing instead of decoding it. Anything that does not parse (free text
 * like "SOS" or "every 6 hours") falls back to the raw string verbatim: a
 * frequency we cannot understand must never be silently reshaped.
 */

const SLOTS = [
  { key: 'm', letter: 'M', label: 'Morning' },
  { key: 'a', letter: 'A', label: 'Afternoon' },
  { key: 'n', letter: 'N', label: 'Night' },
] as const

/** `0.5` → `½`, `1.5` → `1½`. Whole numbers are unchanged. */
function unit(value: number): string {
  const whole = Math.floor(value)
  if (value - whole !== 0.5) return String(value)
  return whole === 0 ? '½' : `${whole}½`
}

export function RxScheduleView({
  frequency,
  className,
}: {
  frequency: string
  className?: string
}) {
  const schedule = parseSchedule(frequency)

  if (!schedule) {
    return <span className={cn('text-label text-text font-mono', className)}>{frequency}</span>
  }

  // Spoken form for screen readers and for the hover tooltip. Uses the exact
  // numbers, not the ½ glyph, so nothing is ambiguous when read aloud.
  const spoken = SLOTS.map((slot) => {
    const value = schedule[slot.key]
    return `${slot.label} ${value === null ? 'not set' : value}`
  }).join(', ')

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} title={spoken}>
      <span className="sr-only">{spoken}</span>
      {SLOTS.map((slot) => {
        const value = schedule[slot.key]
        const active = value !== null && value > 0
        return (
          <span
            key={slot.key}
            aria-hidden
            className={cn(
              'flex w-7 flex-col items-center rounded-xs border py-0.5',
              active
                ? 'border-accent/25 bg-accent-muted text-accent'
                : 'border-border bg-surface text-text-subtle',
            )}
          >
            <span data-numeric className="text-label leading-none font-semibold">
              {value === null ? '·' : unit(value)}
            </span>
            <span className="text-micro mt-0.5 leading-none">{slot.letter}</span>
          </span>
        )
      })}
    </span>
  )
}

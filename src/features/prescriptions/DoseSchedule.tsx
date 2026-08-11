import { useRef } from 'react'
import { cn } from '@/lib/cn'
import type { DoseSchedule } from './model'

const SLOTS = [
  { key: 'm' as const, label: 'M', full: 'Morning' },
  { key: 'a' as const, label: 'A', full: 'Afternoon' },
  { key: 'n' as const, label: 'N', full: 'Night' },
]

/** Legal doses, in order, for stepping. Halves are legal. */
const STEPS = [0, 0.5, 1, 1.5, 2, 3, 4]

function nextStep(value: number | null, direction: 1 | -1): number | null {
  if (value === null) return direction === 1 ? 1 : 0
  const index = STEPS.indexOf(value)
  if (index === -1) {
    // A hand-typed value outside the ladder; move by half in that direction.
    const moved = value + direction * 0.5
    return moved < 0 ? 0 : moved
  }
  const nextIndex = index + direction
  if (nextIndex < 0) return null // stepping below zero clears the slot
  return STEPS[Math.min(nextIndex, STEPS.length - 1)] ?? value
}

function display(value: number | null): string {
  if (value === null) return ''
  return Number.isInteger(value) ? String(value) : String(value)
}

/**
 * The morning–afternoon–night dose control.
 *
 * A slot that has never been set is `null` and renders empty — not zero. The
 * difference matters: `0` is "explicitly none this time of day", `null` is
 * "nobody has said", and only the second one blocks printing.
 */
export function DoseScheduleInput({
  value,
  onChange,
  disabled,
  id,
  compact = false,
  'aria-describedby': describedBy,
}: {
  value: DoseSchedule
  onChange: (next: DoseSchedule) => void
  disabled?: boolean
  id?: string
  compact?: boolean
  'aria-describedby'?: string
}) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  const set = (key: 'm' | 'a' | 'n', next: number | null) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <div
      role="group"
      aria-label="Dose by time of day"
      aria-describedby={describedBy}
      className="inline-flex items-stretch gap-px overflow-hidden rounded-md border border-border bg-border"
    >
      {SLOTS.map((slot, index) => {
        const slotValue = value[slot.key]
        const isBlank = slotValue === null

        return (
          <div key={slot.key} className="flex flex-col bg-surface">
            <label
              htmlFor={index === 0 ? id : undefined}
              className={cn(
                'select-none px-2 pt-1 text-center text-micro uppercase',
                isBlank ? 'text-text-subtle' : 'text-text-muted',
              )}
              title={slot.full}
            >
              {slot.label}
            </label>
            <input
              id={index === 0 ? id : undefined}
              ref={(el) => {
                refs.current[slot.key] = el
              }}
              type="text"
              inputMode="decimal"
              disabled={disabled}
              value={display(slotValue)}
              aria-label={`${slot.full} dose`}
              placeholder="–"
              onChange={(e) => {
                const raw = e.target.value.trim()
                if (raw === '') return set(slot.key, null)
                // Accept "1", "0.5", ".5", and the half-symbol people type.
                const normalised = raw === '½' ? '0.5' : raw
                const parsed = Number(normalised)
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20) return
                set(slot.key, parsed)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  set(slot.key, nextStep(slotValue, 1))
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  set(slot.key, nextStep(slotValue, -1))
                } else if (e.key === 'Backspace' && display(slotValue) === '') {
                  e.preventDefault()
                  set(slot.key, null)
                }
              }}
              className={cn(
                'w-9 bg-transparent pb-1 text-center font-mono text-body tabular-nums outline-none',
                'focus:bg-accent-muted',
                compact && 'w-8 text-label',
                isBlank && 'placeholder:text-provenance-blank',
                slotValue === 0 && 'text-text-subtle',
              )}
            />
          </div>
        )
      })}
    </div>
  )
}

/** Read-only rendering of a schedule, for detail views and print previews. */
export function DoseScheduleDisplay({
  value,
  className,
}: {
  value: DoseSchedule
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {SLOTS.map((slot) => {
        const v = value[slot.key]
        return (
          <span
            key={slot.key}
            title={`${slot.full}: ${v === null ? 'not set' : v}`}
            className={cn(
              'grid size-6 place-items-center rounded-xs font-mono text-caption tabular-nums',
              v === null
                ? 'border border-dashed border-provenance-blank text-provenance-blank'
                : v === 0
                  ? 'bg-surface-hover text-text-subtle'
                  : 'bg-accent-muted text-accent',
            )}
          >
            {v === null ? '–' : display(v)}
          </span>
        )
      })}
    </span>
  )
}

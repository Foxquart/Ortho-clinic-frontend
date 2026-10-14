/**
 * Today / Yesterday / 7 days / All — the date window of the list, with the
 * head-count for each so the doctor knows what is behind a chip before
 * pressing it. A radio group with a roving tab stop: Tab enters it once, the
 * arrow keys move (and select) within it.
 */

import { cn } from '@/lib/cn'
import type { PatientView } from './usePatientFeed'

const CHIPS: readonly { view: PatientView; en: string }[] = [
  { view: 'today', en: 'Today' },
  { view: 'yesterday', en: 'Yesterday' },
  { view: 'week', en: '7 days' },
  { view: 'all', en: 'All' },
]

export function ViewChips({
  value,
  onChange,
  counts,
  className,
}: {
  value: PatientView
  onChange: (view: PatientView) => void
  counts: Record<PatientView, number | undefined>
  className?: string
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = (index + step + CHIPS.length) % CHIPS.length
    onChange(CHIPS[next].view)
    ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Show patients seen"
      className={cn(
        'border-border bg-bg-sunken grid grid-cols-4 gap-0.5 rounded-lg border p-0.5',
        className,
      )}
    >
      {CHIPS.map((chip, index) => {
        const active = chip.view === value
        const count = counts[chip.view]
        return (
          <button
            key={chip.view}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(chip.view)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'min-h-tap flex min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 sm:min-h-12',
              'duration-fast ease-standard transition-[background-color,color,box-shadow,transform]',
              'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-1',
              'active:scale-[0.97] motion-reduce:active:scale-100',
              active
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-muted hover:bg-surface/60 hover:text-text',
            )}
          >
            <span className="text-label max-w-full truncate font-semibold">{chip.en}</span>
            <span className="text-caption text-text-muted max-w-full truncate" data-numeric>
              <span className={cn('font-semibold', active && 'text-text')}>
                {count === undefined ? '–' : count.toLocaleString()}
              </span>
              {/* Screen readers get "Today, 37 patients". */}
              <span className="sr-only">
                {count === undefined ? '' : ` ${count === 1 ? 'patient' : 'patients'}`}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

import { useRef } from 'react'
import { CalendarDays, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDate, todayIso } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { NAMED_RANGES, isIsoDay, type NamedRange } from './range'

const CHIPS: Record<NamedRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': '7 days',
  all: 'All',
}

export interface RxToolbarProps {
  text: string
  onTextChange: (value: string) => void
  onClearSearch: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
  /** ↓ from the search box drops into the list. */
  onArrowDown: () => void
  range: string
  onRange: (range: string) => void
  /** From `/prescriptions/stats/today`; omitted while loading or if that call fails. */
  todayCount?: number
  weekCount?: number
  /** Phone-only "+" beside the search box (the header button is hidden below `sm`). */
  onNew?: () => void
}

/**
 * Search + date chips. The search box is the first thing in the tab order and
 * `/` jumps to it from anywhere on the screen (bound by the screen, not here).
 * Everything is 44px tall on a phone and 32–40px from `sm`.
 */
export function RxToolbar({
  text,
  onTextChange,
  onClearSearch,
  searchRef,
  onArrowDown,
  range,
  onRange,
  todayCount,
  weekCount,
  onNew,
}: RxToolbarProps) {
  const dateRef = useRef<HTMLInputElement>(null)
  const customDay = isIsoDay(range) ? range : null
  const counts: Partial<Record<NamedRange, number>> = { today: todayCount, '7d': weekCount }

  const openPicker = () => {
    const el = dateRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center">
      <div className="flex items-center gap-2 lg:w-96">
        <div className="min-w-0 flex-1">
          <Input
            ref={searchRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search prescriptions by patient name, phone number or Rx number"
            placeholder="Search name, phone or Rx no."
            maxLength={100}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                if (text) onClearSearch()
                else e.currentTarget.blur()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                onArrowDown()
              }
            }}
            iconLeft={<Search />}
            slotRight={
              text ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    onClearSearch()
                    searchRef.current?.focus()
                  }}
                  className="text-text-subtle duration-fast hover:bg-surface-hover hover:text-text focus-visible:outline-focus relative grid size-7 place-items-center rounded-md transition-colors after:absolute after:-inset-2 focus-visible:outline-2"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : (
                <Kbd className="hidden sm:inline-flex">/</Kbd>
              )
            }
            className="h-11 pr-10 sm:h-10"
          />
        </div>
        {onNew && (
          <Button
            variant="primary"
            aria-label="New prescription"
            onClick={onNew}
            className="size-11 shrink-0 sm:hidden"
          >
            <Plus aria-hidden className="size-5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label="Show prescriptions from"
          className="border-border bg-bg-sunken flex min-w-0 flex-1 items-stretch gap-0.5 rounded-lg border p-0.5 sm:flex-none"
        >
          {NAMED_RANGES.map((value) => {
            const active = range === value
            const count = counts[value]
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onRange(value)}
                className={cn(
                  'text-caption sm:text-label duration-fast ease-standard focus-visible:outline-focus flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md px-1 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-1 sm:min-h-8 sm:flex-none sm:px-3',
                  active
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-text-muted hover:bg-surface-hover/70 hover:text-text',
                )}
              >
                <span className="flex items-baseline gap-1">
                  {CHIPS[value]}
                  {count != null && (
                    <span className="text-text-subtle font-normal" data-numeric>
                      {count.toLocaleString()}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {/* A button that opens the native picker rather than a visible date
            field: three date inputs' worth of width would not fit a phone, and
            the native picker is what a thumb expects. The input is real and
            carries the value; it is just not the thing you tap. */}
        <div className="relative shrink-0">
          <Button
            variant="secondary"
            aria-label={
              customDay ? `Showing ${formatDate(customDay)}. Pick another date` : 'Pick a date'
            }
            title={customDay ? 'Pick another date' : 'Pick a date'}
            onClick={openPicker}
            className={cn(
              'h-11 min-w-11 px-3 sm:h-10',
              customDay && 'border-accent text-accent-muted-fg bg-accent-muted',
            )}
          >
            <CalendarDays aria-hidden className="size-4" />
            {customDay && <span data-numeric>{formatDate(customDay)}</span>}
          </Button>
          <input
            ref={dateRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            max={todayIso()}
            value={customDay ?? ''}
            onChange={(e) => {
              if (isIsoDay(e.target.value)) onRange(e.target.value)
            }}
            className="pointer-events-none absolute inset-0 size-full opacity-0"
          />
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import * as RP from '@radix-ui/react-popover'
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parse,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A date field that always reads and writes `DD/MM/YYYY`.
 *
 * The platform control (`<input type="date">`) formats its own display from the
 * operating system's locale. That is why the same build shows `17/11/2026` on
 * one machine and `11/16/2026` on another, and no attribute or style can change
 * it. This component keeps the familiar text field and puts a calendar in a
 * popover beside it, so the format is the app's decision rather than the
 * machine's.
 *
 * The value that crosses the component boundary is always the API's
 * `YYYY-MM-DD`, never the displayed text.
 */
export interface DateFieldProps {
  id?: string
  /** API form, `YYYY-MM-DD`, or `''`. */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  'aria-describedby'?: string
}

const ISO = 'yyyy-MM-dd'
const DISPLAY = 'dd/MM/yyyy'
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function isoToText(value: string): string {
  const date = value ? parseISO(value) : null
  return date && isValid(date) ? format(date, DISPLAY) : ''
}

/** Inserts the slashes as digits arrive; deleting one re-forms the rest. */
function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  let out = digits.slice(0, 2)
  if (digits.length > 2) out += `/${digits.slice(2, 4)}`
  if (digits.length > 4) out += `/${digits.slice(4, 8)}`
  return out
}

function parseText(text: string): string | null {
  if (text.length !== 10) return null
  const date = parse(text, DISPLAY, new Date())
  return isValid(date) ? format(date, ISO) : null
}

export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  invalid,
  disabled,
  className,
  'aria-describedby': describedBy,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToText(value))
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const date = value ? parseISO(value) : null
    return startOfMonth(date && isValid(date) ? date : new Date())
  })

  // A reset, a template, a clicked day — anything that changes the model from
  // outside must reach the text box.
  useEffect(() => {
    setText(isoToText(value))
    if (value) {
      const date = parseISO(value)
      if (isValid(date)) setView(startOfMonth(date))
    }
  }, [value])

  const outside = (date: Date): boolean => {
    const iso = format(date, ISO)
    return Boolean((min && iso < min) || (max && iso > max))
  }

  const commit = (iso: string) => {
    setText(isoToText(iso))
    onChange(iso)
    setOpen(false)
  }

  const handleText = (raw: string) => {
    const masked = maskDate(raw)
    setText(masked)
    if (masked === '') {
      onChange('')
      return
    }
    const iso = parseText(masked)
    if (iso && !(min && iso < min) && !(max && iso > max)) onChange(iso)
  }

  const handleBlur = () => {
    const iso = parseText(text)
    if (iso && !(min && iso < min) && !(max && iso > max)) {
      onChange(iso)
      setText(isoToText(iso))
      return
    }
    // Incomplete or impossible: show the last value the model accepted rather
    // than inventing one. The parent's own error says what is missing.
    setText(isoToText(value))
  }

  const first = startOfWeek(startOfMonth(view), { weekStartsOn: 1 })
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(first)
    date.setDate(first.getDate() + i)
    return date
  })

  const today = new Date()
  const selected = value ? parseISO(value) : null
  const selectedValid = selected && isValid(selected) ? selected : null

  return (
    <RP.Root open={open} onOpenChange={setOpen}>
      <RP.Anchor asChild>
        <div className={cn('relative flex items-center', className)}>
          <input
            id={id}
            value={text}
            onChange={(e) => handleText(e.target.value)}
            onBlur={handleBlur}
            onFocus={(e) => e.currentTarget.select()}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="DD/MM/YYYY"
            maxLength={10}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(
              'h-control w-full min-w-0 rounded-md border border-border-field bg-surface px-2.5 pr-9 text-body text-text',
              'placeholder:text-text-subtle',
              'transition-[border-color,box-shadow] duration-fast ease-standard',
              'hover:border-border-strong',
              'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/35',
              'disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-sunken disabled:text-text-subtle',
              'aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30',
            )}
          />
          <RP.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open calendar"
              className={cn(
                'absolute right-1.5 flex size-7 items-center justify-center rounded text-text-subtle',
                'transition-colors duration-instant ease-standard',
                'hover:bg-surface-hover hover:text-text',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                'disabled:cursor-not-allowed disabled:text-text-subtle',
              )}
            >
              <CalendarDays aria-hidden className="size-4" />
            </button>
          </RP.Trigger>
        </div>
      </RP.Anchor>

      <RP.Portal>
        <RP.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-60 w-[17.5rem] rounded-lg border border-border bg-surface-raised p-3 shadow-overlay',
            'data-[state=open]:animate-[menu-in_130ms_var(--ease-out-quint)]',
            'origin-(--radix-popover-content-transform-origin)',
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView((v) => addMonths(v, -1))}
              className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors duration-instant hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <span aria-live="polite" className="text-label font-medium text-text">
              {format(view, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView((v) => addMonths(v, 1))}
              className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors duration-instant hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>

          <div aria-hidden className="grid grid-cols-7 gap-0.5 pb-1">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-micro text-center text-text-subtle">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((date) => {
              const iso = format(date, ISO)
              const isSelected = selectedValid ? isSameDay(date, selectedValid) : false
              const isToday = isSameDay(date, today)
              const disabledDay = outside(date)

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabledDay}
                  aria-label={format(date, 'EEEE d MMMM yyyy')}
                  aria-pressed={isSelected}
                  onClick={() => commit(iso)}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-md text-caption tabular-nums',
                    'transition-colors duration-instant ease-standard',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                    !isSameMonth(date, view) && 'text-text-subtle/60',
                    isSelected
                      ? 'bg-accent text-accent-contrast'
                      : 'text-text hover:bg-surface-hover',
                    !isSelected && isToday && 'ring-1 ring-inset ring-accent/40',
                    disabledDay && 'cursor-not-allowed text-text-subtle/40 hover:bg-transparent',
                  )}
                >
                  {format(date, 'd')}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => commit(format(today, ISO))}
              disabled={outside(today)}
              className="text-caption font-medium text-accent transition-colors duration-instant hover:underline disabled:cursor-not-allowed disabled:text-text-subtle"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('')
                setText('')
                setOpen(false)
              }}
              className="text-caption text-text-muted transition-colors duration-instant hover:text-text"
            >
              Clear
            </button>
          </div>
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  )
}

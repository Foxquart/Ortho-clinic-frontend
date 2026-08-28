import { Plus } from 'lucide-react'
import type { AppointmentDetailResponse, AppointmentStatus } from '@/api/schema'
import { Button } from '@/components/ui/Button'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import { formatDate, formatTime, fullName, humanizeEnum, todayIso } from '@/lib/format'
import { DAY_LABEL, STATUS_DOT, dayOfWeekFor, occupiesSlot } from './model'

export interface WeekViewProps {
  /** The seven ISO dates of the visible week, Monday first. */
  days: readonly string[]
  appointments: readonly AppointmentDetailResponse[]
  isPending: boolean
  error: unknown
  onRetry: () => void
  statusFilter: AppointmentStatus | null
  selectedDate: string
  onSelectDay: (date: string) => void
  canWrite: boolean
  onBook: (date: string) => void
}

export function WeekView({
  days,
  appointments,
  isPending,
  error,
  onRetry,
  statusFilter,
  selectedDate,
  onSelectDay,
  canWrite,
  onBook,
}: WeekViewProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />

  const today = todayIso()
  const byDate = new Map<string, AppointmentDetailResponse[]>()
  for (const appointment of appointments) {
    const list = byDate.get(appointment.appointment_date)
    if (list) list.push(appointment)
    else byDate.set(appointment.appointment_date, [appointment])
  }

  return (
    /* Never seven columns until `xl`. Below `sm` this is a single stack — the
       week read as a scrolling agenda, one day card after another, which is the
       only shape a 320px screen can hold. The day view is still the default on
       arrival, so nobody lands here by accident; this is what the Week button
       gives someone who asked for it on a phone. */
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((date) => {
        const day = dayOfWeekFor(date)
        const items = (byDate.get(date) ?? []).sort((a, b) =>
          a.start_time.localeCompare(b.start_time),
        )
        const booked = items.filter((a) => occupiesSlot(a.status)).length
        const isToday = date === today
        const isSelected = date === selectedDate

        return (
          <section
            key={date}
            aria-label={`${day ? DAY_LABEL[day] : ''} ${formatDate(date)}`}
            className={cn(
              /* The 160px floor exists to keep seven side-by-side columns the
                 same height. Stacked on a phone there is nothing to line up
                 with, and an empty Sunday holding 160px of nothing is just
                 scrolling the doctor has to do to reach Monday. */
              'flex min-h-24 flex-col rounded-lg border bg-surface sm:min-h-40',
              isSelected ? 'border-accent/50 shadow-sm' : 'border-border',
            )}
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-border px-2.5 py-2">
              <button
                type="button"
                onClick={() => onSelectDay(date)}
                className={cn(
                  'flex items-baseline gap-1.5 rounded-sm text-left',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
              >
                <span
                  className={cn(
                    'text-micro uppercase',
                    isToday ? 'text-accent' : 'text-text-subtle',
                  )}
                >
                  {day ? DAY_LABEL[day].slice(0, 3) : ''}
                </span>
                <span
                  className={cn('text-label font-semibold', isToday ? 'text-accent' : 'text-text')}
                  data-numeric
                >
                  {Number(date.slice(8, 10))}
                </span>
              </button>
              {isPending ? (
                <Skeleton className="h-3 w-4" />
              ) : (
                booked > 0 && (
                  <span className="text-caption text-text-subtle" data-numeric>
                    {booked}
                  </span>
                )
              )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-px p-1">
              {isPending ? (
                Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-7 w-full rounded-md" />
                ))
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-4">
                  <p className="text-caption text-text-subtle">
                    {statusFilter ? 'No matches' : 'Nothing booked'}
                  </p>
                  {canWrite && !statusFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Plus className="size-3.5" />}
                      onClick={() => onBook(date)}
                      aria-label={`Book an appointment on ${formatDate(date)}`}
                    >
                      Book
                    </Button>
                  )}
                </div>
              ) : (
                items.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => onSelectDay(date)}
                    title={`${formatTime(appointment.start_time)} · ${fullName(
                      appointment.patient.first_name,
                      appointment.patient.last_name,
                    )} · ${humanizeEnum(appointment.status)}`}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md px-1.5 py-1 text-left',
                      'transition-colors duration-fast ease-standard hover:bg-surface-hover',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                      !occupiesSlot(appointment.status) && 'opacity-60',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          STATUS_DOT[appointment.status],
                        )}
                      />
                      <span className="text-caption text-text-muted" data-numeric>
                        {formatTime(appointment.start_time)}
                      </span>
                    </span>
                    <span className="w-full truncate text-caption text-text">
                      {fullName(appointment.patient.first_name, appointment.patient.last_name)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

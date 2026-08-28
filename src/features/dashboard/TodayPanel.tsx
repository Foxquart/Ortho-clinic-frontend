/**
 * Today, as the surgeon actually experiences it.
 *
 * `GET /dashboard/summary` cannot lead this screen. Its `recent_appointments`
 * are ordered `created_at desc` — the five most recently BOOKED, which mixes
 * yesterday, this morning and next Tuesday into one list. A doctor opening the
 * app at 9am is asking "who is in front of me today, and who is next", and that
 * question needs the day in time order.
 *
 * So this asks `GET /appointments?from_date=<today>&to_date=<today>` directly.
 * It is the same endpoint the Appointments screen uses, no new backend work,
 * and it is the difference between a dashboard that reports and a dashboard
 * that is usable at the start of a clinic.
 */
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowRight, CalendarClock, Check } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { cn } from '@/lib/cn'
import { formatTime, humanizeEnum } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import type { AppointmentDetailResponse, Paginated } from '@/api/schema'

/** Statuses that still represent someone the doctor is going to see. */
const PENDING = new Set(['scheduled', 'confirmed', 'in_progress'])

/** Statuses that are over, one way or another. */
const CLOSED = new Set(['completed', 'cancelled', 'no_show'])


function isoToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Today's appointments, in the order they happen. */
export function useTodayAppointments() {
  const date = isoToday()

  return useQuery({
    queryKey: ['dashboard', 'today-appointments', date],
    queryFn: async () => {
      const page = await apiGet<Paginated<AppointmentDetailResponse>>(
        endpoints.appointments.list,
        { params: { from_date: date, to_date: date, page_size: 50 } },
      )
      /* Sorted here rather than trusting a sort param: the API's default order
         is not documented as by-time, and a schedule out of order is worse than
         no schedule. `start_time` is `HH:MM:SS`, so string order is time order. */
      return [...page.items].sort((a, b) => a.start_time.localeCompare(b.start_time))
    },
    staleTime: 60_000,
  })
}

function patientName(a: AppointmentDetailResponse): string {
  return `${a.patient.first_name} ${a.patient.last_name}`.trim() || 'Unnamed patient'
}

/* -------------------------------------------------------------------------- */
/*  The hero: who is next                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one thing worth putting at display size on this screen.
 *
 * Not a statistic — a person. It is the only element here that answers a
 * question the doctor has *right now* rather than reporting a total, so it is
 * the only one that earns the accent ground and a display-scale name.
 */
export function NextPatient({
  appointments,
  loading,
}: {
  appointments: AppointmentDetailResponse[] | undefined
  loading: boolean
}) {
  const next = appointments?.find((a) => PENDING.has(a.status))
  const remaining = appointments?.filter((a) => PENDING.has(a.status)).length ?? 0

  if (loading) {
    return (
      <div className="bg-accent-muted h-40 animate-pulse rounded-2xl motion-reduce:animate-none" />
    )
  }

  /* A finished day should feel finished, not empty. */
  if (!next) {
    return (
      <div className="bg-bg-sunken flex min-h-40 flex-col justify-center gap-2 rounded-2xl border border-border px-6 py-7">
        <div className="text-text-muted flex items-center gap-2">
          <Check aria-hidden className="text-success size-4" />
          <span className="text-label font-medium">
            {appointments && appointments.length > 0
              ? 'Everyone booked for today has been seen.'
              : 'Nothing booked for today.'}
          </span>
        </div>
        <p className="text-caption text-text-subtle">
          You can still write a prescription for a walk-in.
        </p>
      </div>
    )
  }

  /* The two after this one. The hero was half empty at desktop width, and a
     surgeon's actual next question after "who is now" is "who is after that" —
     so the dead space earns its keep instead of being padded out. */
  const then = (appointments ?? []).filter((a) => PENDING.has(a.status) && a.id !== next.id).slice(0, 3)

  return (
    <div className="bg-accent-muted grid gap-6 rounded-2xl px-6 py-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
      <div className="min-w-0">
        <div className="text-micro text-accent-muted-fg/80 flex items-center gap-2 uppercase">
          <CalendarClock aria-hidden className="size-3.5" />
          Next patient
        </div>

        <p className="text-accent-muted-fg mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          {patientName(next)}
        </p>

        <p className="text-accent-muted-fg/85 numeric mt-1.5 text-body">
          {formatTime(next.start_time)}
          {next.reason ? <span className="text-accent-muted-fg/70"> · {next.reason}</span> : null}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button variant="primary" asChild className="min-h-11">
            <Link to={`/prescriptions/new?patientId=${next.patient_id}`}>
              Write prescription
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          <Button variant="secondary" asChild className="min-h-11">
            <Link to={`/patients/${next.patient_id}`}>Open patient</Link>
          </Button>
        </div>
      </div>

      {then.length > 0 && (
        <div className="border-accent-muted-fg/15 sm:min-w-[11rem] sm:border-l sm:pl-8">
          <p className="text-micro text-accent-muted-fg/70 uppercase">Then</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {then.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2.5">
                <span className="numeric text-accent-muted-fg/70 w-16 shrink-0 text-caption tabular-nums">
                  {formatTime(a.start_time)}
                </span>
                <span className="text-accent-muted-fg/90 min-w-0 truncate text-label font-medium">
                  {patientName(a)}
                </span>
              </li>
            ))}
          </ul>
          {remaining > then.length + 1 && (
            <p className="text-caption text-accent-muted-fg/60 mt-3">
              +{remaining - then.length - 1} more
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  The rail: the whole day, in order                                         */
/* -------------------------------------------------------------------------- */

/**
 * A timeline, not another list card — because the day IS a sequence, and a
 * vertical rail says that in a way stacked rows do not. It is also the only
 * shape on the screen that is not a rectangle in a grid, which is what stops
 * the dashboard reading as three bands of the same thing.
 */
/**
 * Three states, not six.
 *
 * The first version coloured every status separately — green, amber, teal, red,
 * grey — which turned the rail into a traffic light the reader had to decode.
 * What a surgeon actually needs from a glance down the day is: what is done,
 * what is happening now, what is still coming. So `done` recedes to a filled
 * neutral, `now` is the only thing that takes the accent, and everything ahead
 * is a hollow ring. The precise status is still written in words at the end of
 * the row, where it can be read rather than decoded.
 */
type Phase = 'done' | 'now' | 'ahead'

function phaseOf(status: string): Phase {
  if (status === 'in_progress') return 'now'
  return CLOSED.has(status) ? 'done' : 'ahead'
}

export function TodaySchedule({
  appointments,
  loading,
}: {
  appointments: AppointmentDetailResponse[] | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <ol className="flex flex-col gap-1" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <li
            key={i}
            className="bg-bg-sunken h-14 animate-pulse rounded-lg motion-reduce:animate-none"
          />
        ))}
      </ol>
    )
  }

  if (!appointments || appointments.length === 0) {
    return (
      <p className="text-body text-text-muted px-1 py-6">
        No appointments booked for today.{' '}
        <Link to="/appointments" className="text-accent font-medium hover:underline">
          Open the schedule
        </Link>
      </p>
    )
  }

  return (
    <ol className="flex flex-col">
      {appointments.map((appointment, index) => {
        const phase = phaseOf(appointment.status)
        const first = index === 0
        const last = index === appointments.length - 1

        return (
          <li key={appointment.id}>
            <Link
              to="/appointments"
              className={cn(
                /* 4.25rem, not 3.75: a two-digit hour — "10:00 am", and every
                   afternoon row — needed 66px and wrapped onto a second line in
                   60, which made those rows twice as tall as the morning ones
                   and turned the rail into a ragged column. The 8px comes off
                   the patient name, which truncates gracefully; a time does
                   not. */
                'group grid grid-cols-[4.25rem_1rem_minmax(0,1fr)_auto] items-center gap-x-3',
                'rounded-lg py-2.5 pr-3 sm:grid-cols-[4.5rem_1rem_minmax(0,1fr)_auto]',
                'transition-colors duration-fast hover:bg-surface-hover',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              )}
            >
              <span
                className={cn(
                  'numeric text-right text-label tabular-nums whitespace-nowrap',
                  phase === 'done' ? 'text-text-subtle' : 'text-text font-medium',
                )}
              >
                {formatTime(appointment.start_time)}
              </span>

              {/* The rail, drawn PER ROW as two half-height segments that meet
                  behind the dot. Two consequences, both the reason the old
                  single full-height line looked wrong: nothing is drawn above
                  the first dot or below the last, and the dot never needs a
                  page-coloured knockout ring to punch a hole in a line running
                  underneath it — which is what broke on hover, when the row
                  ground stopped matching the ring. */}
              <span aria-hidden className="relative flex h-full items-center justify-center">
                {!first && (
                  <span className="bg-border absolute inset-x-1/2 top-0 h-[calc(50%-0.4rem)] w-px" />
                )}
                {!last && (
                  <span className="bg-border absolute inset-x-1/2 bottom-0 h-[calc(50%-0.4rem)] w-px" />
                )}
                <span
                  className={cn(
                    'relative rounded-full transition-colors duration-fast',
                    phase === 'done' && 'bg-border-strong size-1.5',
                    phase === 'ahead' && 'border-border-strong bg-bg size-2 border',
                    phase === 'now' && 'bg-accent ring-accent/25 size-2.5 ring-4',
                  )}
                />
              </span>

              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate text-body',
                    phase === 'done' ? 'text-text-muted' : 'text-text font-medium',
                  )}
                >
                  {patientName(appointment)}
                </span>
                {appointment.reason && (
                  <span className="text-caption text-text-subtle block truncate">
                    {appointment.reason}
                  </span>
                )}
              </span>

              <span
                className={cn(
                  'text-caption shrink-0 whitespace-nowrap',
                  phase === 'now' ? 'text-accent font-medium' : 'text-text-subtle',
                )}
              >
                {humanizeEnum(appointment.status)}
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

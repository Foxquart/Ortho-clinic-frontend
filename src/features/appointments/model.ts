/**
 * The appointment domain rules the screen is built on.
 *
 * The OpenAPI document encodes none of this: `PATCH /appointments/{id}/status`
 * declares only 200 and 422, and `AppointmentStatus` is a flat enum with no
 * state machine (see `docs/API_NOTES.md` §1). The transition table below was
 * confirmed against the server's own guard, which answers **409 `conflict`**
 * with `Cannot transition appointment from 'x' to 'y'.` for anything it does
 * not allow. So this map is a UI convenience — it stops us offering a move that
 * will fail — and never an authority. Every write still handles a 409.
 */

import type {
  AppointmentDetailResponse,
  AppointmentStatus,
  AvailableSlotResponse,
  DayOfWeek,
  TimeString,
  WeeklyAvailabilityResponse,
} from '@/api/schema'
import type { BadgeTone } from '@/components/ui/Badge'
import { parseApiDate } from '@/lib/format'

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Legal next statuses, keyed by the current one. `completed` and `cancelled`
 * are terminal and deliberately map to an empty list — a doctor is never shown
 * an action that the server will reject.
 */
export const STATUS_TRANSITIONS = {
  scheduled: ['confirmed', 'in_progress', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: ['scheduled'],
} as const satisfies Record<AppointmentStatus, readonly AppointmentStatus[]>

export function nextStatuses(status: AppointmentStatus): readonly AppointmentStatus[] {
  return STATUS_TRANSITIONS[status]
}

/** Tones are fixed by the design rulebook; do not re-pick them per screen. */
export const STATUS_TONE: Record<AppointmentStatus, BadgeTone> = {
  scheduled: 'info',
  confirmed: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

/** The same six roles as a bare fill, for the week view's chips. */
export const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-info',
  confirmed: 'bg-accent',
  in_progress: 'bg-warning',
  completed: 'bg-success',
  cancelled: 'bg-border-strong',
  no_show: 'bg-danger',
}

/** Imperative labels for the menu — "Confirm", not "Confirmed". */
export const STATUS_ACTION_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Put back on the schedule',
  confirmed: 'Confirm',
  in_progress: 'Start consultation',
  completed: 'Mark completed',
  cancelled: 'Cancel appointment',
  no_show: 'Mark as no-show',
}

export function isDestructiveTarget(status: AppointmentStatus): boolean {
  return status === 'cancelled' || status === 'no_show'
}

/**
 * A cancelled or no-show appointment releases its slot server-side — the slot
 * generator skips exactly these two — so the same half hour can legitimately
 * show both a cancelled row and a free slot.
 */
export function occupiesSlot(status: AppointmentStatus): boolean {
  return status !== 'cancelled' && status !== 'no_show'
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/** `09:00:00` (what the API emits) → `09:00` — the form of a slot's identity. */
export function hhmm(time: TimeString): string {
  return time.slice(0, 5)
}

/* -------------------------------------------------------------------------- */
/* Days                                                                       */
/* -------------------------------------------------------------------------- */

export const DAY_LABEL: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const ISO_DAY_ORDER: readonly DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

/** The `DayOfWeek` an ISO date falls on, or null if the date is unparseable. */
export function dayOfWeekFor(isoDate: string): DayOfWeek | null {
  const parsed = parseApiDate(isoDate)
  return parsed ? (ISO_DAY_ORDER[parsed.getDay()] ?? null) : null
}

/** The clinic's active blocks for one calendar date, earliest first. */
export function hoursForDate(
  availability: readonly WeeklyAvailabilityResponse[],
  isoDate: string,
): WeeklyAvailabilityResponse[] {
  const day = dayOfWeekFor(isoDate)
  if (!day) return []
  return availability
    .filter((block) => block.is_active && block.day_of_week === day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
}

/* -------------------------------------------------------------------------- */
/* The day rail                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One row of the day. `GET /appointments/slots` returns only the *free* half
 * hours — a taken one is simply absent — so "free vs taken" only reads honestly
 * once the day's bookings are merged back in.
 */
export type RailItem =
  | {
      kind: 'booking'
      key: string
      startTime: TimeString
      appointment: AppointmentDetailResponse
    }
  | { kind: 'free'; key: string; startTime: TimeString; endTime: TimeString }

export function buildDayRail(
  appointments: readonly AppointmentDetailResponse[],
  slots: readonly AvailableSlotResponse[],
): RailItem[] {
  const items: RailItem[] = [
    ...appointments.map(
      (appointment): RailItem => ({
        kind: 'booking',
        key: appointment.id,
        startTime: appointment.start_time,
        appointment,
      }),
    ),
    ...slots.map(
      (slot): RailItem => ({
        kind: 'free',
        key: `free-${slot.start_time}`,
        startTime: slot.start_time,
        endTime: slot.end_time,
      }),
    ),
  ]

  // Bookings sort above a free slot that starts at the same minute, so a
  // released half hour reads as "this was cancelled, and it is now open".
  return items.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      (a.kind === b.kind ? 0 : a.kind === 'booking' ? -1 : 1),
  )
}

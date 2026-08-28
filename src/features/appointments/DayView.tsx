import { Link } from 'react-router-dom'
import {
  Ban,
  CalendarOff,
  CalendarPlus,
  Check,
  CheckCheck,
  MoreHorizontal,
  Play,
  RotateCcw,
  UserX,
} from 'lucide-react'
import type {
  AppointmentDetailResponse,
  AppointmentStatus,
  AvailableSlotResponse,
  WeeklyAvailabilityResponse,
} from '@/api/schema'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Card, CardHeader } from '@/components/ui/Surface'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/Menu'
import { cn } from '@/lib/cn'
import { formatDate, formatRelativeDay, formatTime, fullName, humanizeEnum } from '@/lib/format'
import {
  DAY_LABEL,
  STATUS_ACTION_LABEL,
  STATUS_TONE,
  buildDayRail,
  dayOfWeekFor,
  isDestructiveTarget,
  nextStatuses,
  occupiesSlot,
} from './model'

const TARGET_ICON: Record<AppointmentStatus, React.ReactNode> = {
  scheduled: <RotateCcw aria-hidden />,
  confirmed: <Check aria-hidden />,
  in_progress: <Play aria-hidden />,
  completed: <CheckCheck aria-hidden />,
  cancelled: <Ban aria-hidden />,
  no_show: <UserX aria-hidden />,
}

export interface DayViewProps {
  date: string
  appointments: readonly AppointmentDetailResponse[]
  slots: readonly AvailableSlotResponse[]
  hours: readonly WeeklyAvailabilityResponse[]
  isPending: boolean
  error: unknown
  onRetry: () => void
  /** `null` when no status filter is applied — which changes what "empty" means. */
  statusFilter: AppointmentStatus | null
  onClearFilter: () => void
  canWrite: boolean
  canManageHours: boolean
  onBook: (startTime: string | null) => void
  onOpenHours: () => void
  onStatusChange: (appointment: AppointmentDetailResponse, target: AppointmentStatus) => void
  /** The appointment whose status write is in flight, if any. */
  pendingId: string | null
}

export function DayView({
  date,
  appointments,
  slots,
  hours,
  isPending,
  error,
  onRetry,
  statusFilter,
  onClearFilter,
  canWrite,
  canManageHours,
  onBook,
  onOpenHours,
  onStatusChange,
  pendingId,
}: DayViewProps) {
  const day = dayOfWeekFor(date)
  const closed = hours.length === 0
  const booked = appointments.filter((a) => occupiesSlot(a.status)).length

  // A status filter turns the day into a filtered list: free slots are not
  // "scheduled" or "completed", so showing them alongside would be a lie.
  const rail = statusFilter
    ? buildDayRail(appointments, [])
    : buildDayRail(appointments, slots)

  const summary = closed
    ? 'Clinic closed'
    : [
        `${booked} booked`,
        statusFilter ? null : `${slots.length} free`,
        hours
          .map((h) => `${formatTime(h.start_time)}–${formatTime(h.end_time)}`)
          .join(', '),
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={formatRelativeDay(date)}
        description={
          <span>
            {day ? `${DAY_LABEL[day]}, ${formatDate(date)}` : formatDate(date)}
            <span aria-hidden className="mx-1.5 text-text-subtle">
              ·
            </span>
            {summary}
          </span>
        }
      />

      {error ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : isPending ? (
        <DaySkeleton />
      ) : closed && appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarOff />}
          title={day ? `The clinic is closed on ${DAY_LABEL[day]}s` : 'No clinic hours'}
          description="No weekly hours are set for this day, so there is nothing to book into."
          action={
            canManageHours && (
              <Button variant="secondary" size="sm" onClick={onOpenHours}>
                Set clinic hours
              </Button>
            )
          }
        />
      ) : rail.length === 0 && statusFilter ? (
        <EmptyState
          icon={<CalendarOff />}
          title={`No ${humanizeEnum(statusFilter).toLowerCase()} appointments on this day`}
          description="Other appointments may exist — the status filter is hiding them."
          action={
            <Button variant="secondary" size="sm" onClick={onClearFilter}>
              Show all statuses
            </Button>
          }
        />
      ) : rail.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus />}
          title="Nothing booked"
          description="The day is completely open. Every half hour within clinic hours is free."
          action={
            canWrite && (
              <Button variant="primary" size="sm" onClick={() => onBook(null)}>
                Book an appointment
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {rail.map((item) =>
            item.kind === 'booking' ? (
              <BookingRow
                key={item.key}
                appointment={item.appointment}
                canWrite={canWrite}
                busy={pendingId === item.appointment.id}
                onStatusChange={onStatusChange}
              />
            ) : (
              <FreeRow
                key={item.key}
                date={date}
                startTime={item.startTime}
                canWrite={canWrite}
                onBook={onBook}
              />
            ),
          )}
        </ul>
      )}
    </Card>
  )
}

function BookingRow({
  appointment,
  canWrite,
  busy,
  onStatusChange,
}: {
  appointment: AppointmentDetailResponse
  canWrite: boolean
  busy: boolean
  onStatusChange: (appointment: AppointmentDetailResponse, target: AppointmentStatus) => void
}) {
  const patient = appointment.patient
  const name = fullName(patient.first_name, patient.last_name)
  const targets = nextStatuses(appointment.status)
  const released = !occupiesSlot(appointment.status)

  return (
    /* The row wraps on a phone, and only the status badge is allowed to fall to
       the second line. At 320px the fixed parts — time, rail, "ends", badge and
       the status menu — left the patient's NAME about 40px, which is the one
       thing in the row that has to be readable. `order-last` below `sm` moves
       the badge past the menu button so the badge is what wraps and the menu
       stays where the thumb expects it, top-right of the row. */
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 transition-colors duration-fast ease-standard',
        'hover:bg-surface-hover',
        busy && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'w-14 shrink-0 whitespace-nowrap text-right text-label sm:w-18',
          released ? 'text-text-subtle' : 'text-text',
        )}
        data-numeric
      >
        {formatTime(appointment.start_time)}
      </span>
      <span
        aria-hidden
        className={cn('h-8 w-0.5 shrink-0 rounded-full', released ? 'bg-border' : 'bg-accent/45')}
      />

      {/* `basis-24` is a wrap threshold, not a width: `flex-1` still gives the
          name every pixel the line has spare. It is small enough that the time,
          the rail, the name and the status menu always fit on one line at
          320px, which is what keeps the menu button pinned to the top-right of
          the row instead of drifting down beside the badge. */}
      <div className="min-w-0 flex-1 basis-24">
        <Link
          to={`/patients/${appointment.patient_id}`}
          /* `block`, not the default inline: `truncate` is `overflow:hidden`,
             which an inline box ignores — so the name used to run out of its
             column and sit UNDER the status badge on a phone. */
          className={cn(
            'block truncate rounded-sm text-body font-medium text-text',
            'hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          )}
        >
          {name}
        </Link>
        <p className="truncate text-caption text-text-muted">
          <span data-numeric>{patient.phone}</span>
          {appointment.reason && (
            <>
              <span aria-hidden className="mx-1.5 text-text-subtle">
                ·
              </span>
              {appointment.reason}
            </>
          )}
        </p>
      </div>

      <span className="hidden shrink-0 text-caption text-text-subtle sm:block" data-numeric>
        ends {formatTime(appointment.end_time)}
      </span>

      {/* `basis-full` below `sm` so the badge takes the second line at every
          phone width rather than only at the ones where it happens not to fit —
          a status that is inline at 390px and stacked at 320px is two different
          rows. Indented to the name column so the wrapped line still reads as
          part of this appointment and not the start of the next one. */}
      <span className="order-last flex items-center ms-[4.25rem] basis-full sm:order-none sm:ms-0 sm:basis-auto">
        <Badge tone={STATUS_TONE[appointment.status]} dot>
          {humanizeEnum(appointment.status)}
        </Badge>
      </span>

      <div className="ms-auto w-7 shrink-0 sm:ms-0">
        {canWrite && targets.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label={`Change status for ${name}, ${formatTime(appointment.start_time)}`}
              >
                <MoreHorizontal aria-hidden className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Move to</MenuLabel>
              {targets.map((target) => (
                <MenuItem
                  key={target}
                  icon={TARGET_ICON[target]}
                  destructive={isDestructiveTarget(target)}
                  onSelect={() => onStatusChange(appointment, target)}
                >
                  {STATUS_ACTION_LABEL[target]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>
    </li>
  )
}

function FreeRow({
  date,
  startTime,
  canWrite,
  onBook,
}: {
  date: string
  startTime: string
  canWrite: boolean
  onBook: (startTime: string) => void
}) {
  return (
    <li className="group flex min-h-tap items-center gap-3 px-4 py-1.5 sm:min-h-0">
      <span
        className="w-14 shrink-0 whitespace-nowrap text-right text-caption text-text-subtle sm:w-18"
        data-numeric
      >
        {formatTime(startTime)}
      </span>
      <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-border" />
      <span className="flex-1 text-caption text-text-subtle">Free</span>
      {canWrite && (
        <Button
          variant="ghost"
          size="sm"
          /* Always visible and 44px tall on a touch device: a control revealed
             by hover is a control that does not exist on a phone, and "book
             this free slot" is the whole point of the row. */
          className="min-h-tap px-3 opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none sm:min-h-0 sm:px-2.5 [@media(hover:none)]:opacity-100"
          onClick={() => onBook(startTime)}
          aria-label={`Book the ${formatTime(startTime)} slot on ${formatDate(date)}`}
        >
          Book
        </Button>
      )}
    </li>
  )
}

/** Matches the real row heights so nothing shifts when the day arrives. */
function DaySkeleton() {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2">
          <Skeleton className="h-3 w-14 shrink-0 sm:w-18" />
          <Skeleton className="h-8 w-0.5 shrink-0" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${40 + ((i * 17) % 35)}%` }} />
          <Skeleton className="h-4 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  )
}

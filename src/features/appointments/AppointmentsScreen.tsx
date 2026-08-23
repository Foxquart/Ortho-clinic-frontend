import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addDays, startOfWeek } from 'date-fns'
import { toast } from 'sonner'
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Plus, Settings2 } from 'lucide-react'
import type { AppointmentDetailResponse, AppointmentStatus } from '@/api/schema'
import { APPOINTMENT_STATUSES } from '@/api/schema'
import { toApiError } from '@/api/errors'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { SegmentedControl, Select } from '@/components/ui/Controls'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Surface'
import { formatDate, formatTime, fullName, humanizeEnum, parseApiDate, toIsoDate, todayIso } from '@/lib/format'
import { AvailabilitySheet } from './AvailabilitySheet'
import { BookAppointmentDialog } from './BookAppointmentDialog'
import { DayView } from './DayView'
import { WeekView } from './WeekView'
import { hoursForDate, occupiesSlot } from './model'
import {
  DAY_PAGE_SIZE,
  WEEK_PAGE_SIZE,
  useAppointments,
  useAvailableSlots,
  useUpdateStatus,
  useWeeklyAvailability,
} from './queries'

type ViewMode = 'day' | 'week'

const VIEW_OPTIONS = [
  { value: 'day' as const, label: 'Day', icon: <CalendarDays aria-hidden className="size-3.5" /> },
  { value: 'week' as const, label: 'Week', icon: <Columns3 aria-hidden className="size-3.5" /> },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...APPOINTMENT_STATUSES.map((status) => ({ value: status, label: humanizeEnum(status) })),
]

function shiftDate(isoDate: string, days: number): string {
  const parsed = parseApiDate(isoDate)
  return parsed ? toIsoDate(addDays(parsed, days)) : todayIso()
}

/** The seven ISO dates of the week `isoDate` falls in, Monday first. */
function weekOf(isoDate: string): string[] {
  const parsed = parseApiDate(isoDate) ?? new Date()
  const monday = startOfWeek(parsed, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(monday, i)))
}

/**
 * A rejected status change is a 409 with the server's own from/to in the
 * message. Quoting that raw at a doctor explains nothing, so we say what
 * actually happened: the row on screen was stale.
 */
function explainStatusConflict(
  message: string,
  name: string,
  target: AppointmentStatus,
): string {
  const match = /from '(\w+)' to '(\w+)'/.exec(message)
  const current = match?.[1]
  if (current) {
    return `${name}'s appointment is already ${humanizeEnum(current).toLowerCase()}, and ${humanizeEnum(
      target,
    ).toLowerCase()} is not a legal step from there. The day has been refreshed with the current status.`
  }
  return `That change was refused because the appointment had already moved on. The day has been refreshed.`
}

export function AppointmentsScreen() {
  const { can } = useAuth()
  const canWrite = can('appointments.write')
  // Booking and status need doctor-or-admin; the four availability routes are
  // admin-only server-side, so hours writes need the narrower gate too.
  const canManageHours = canWrite && can('clinic.write')

  const dateInputId = useId()
  const [view, setView] = useState<ViewMode>('day')
  const [date, setDate] = useState<string>(() => todayIso())
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  // `?hours=1` deep-links straight into the weekly-hours editor, so "set my
  // available days" is one click from the dashboard and Settings instead of a
  // control the doctor has to know to look for on this screen.
  const [searchParams] = useSearchParams()
  const [hoursOpen, setHoursOpen] = useState(() => searchParams.get('hours') === '1')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingRequest, setBookingRequest] = useState<{
    date: string
    startTime: string | null
  }>({ date: todayIso(), startTime: null })
  const [pendingId, setPendingId] = useState<string | null>(null)

  const status = statusFilter === 'all' ? null : statusFilter
  const week = weekOf(date)
  const isToday = date === todayIso()

  const dayQuery = useAppointments(
    {
      from_date: date,
      to_date: date,
      page: 1,
      page_size: DAY_PAGE_SIZE,
      sort_by: 'start_time',
      sort_order: 'asc',
      ...(status ? { status } : {}),
    },
    view === 'day',
  )

  const weekQuery = useAppointments(
    {
      from_date: week[0],
      to_date: week[6],
      page: 1,
      page_size: WEEK_PAGE_SIZE,
      sort_by: 'start_time',
      sort_order: 'asc',
      ...(status ? { status } : {}),
    },
    view === 'week',
  )

  // Free slots are only meaningful on an unfiltered day.
  const slots = useAvailableSlots(view === 'day' && !status ? date : null)
  const availability = useWeeklyAvailability()
  const updateStatus = useUpdateStatus()

  const weekAppointments = weekQuery.data?.items ?? []
  const weekBooked = weekAppointments.filter((a) => occupiesSlot(a.status)).length

  function openBooking(forDate: string, startTime: string | null) {
    setBookingRequest({ date: forDate, startTime })
    setBookingOpen(true)
  }

  function handleStatusChange(
    appointment: AppointmentDetailResponse,
    target: AppointmentStatus,
  ) {
    const name = fullName(appointment.patient.first_name, appointment.patient.last_name)
    setPendingId(appointment.id)
    updateStatus.mutate(
      { appointment, target },
      {
        onSuccess: () => {
          toast.success(`${name} — ${humanizeEnum(target).toLowerCase()}`, {
            description: `${formatTime(appointment.start_time)}, ${formatDate(
              appointment.appointment_date,
            )}`,
          })
        },
        onError: (error) => {
          const e = toApiError(error)
          if (e.isConflict) {
            toast.error('That status change no longer applies', {
              description: explainStatusConflict(e.message, name, target),
            })
            return
          }
          toast.error('Could not change the status', {
            description: e.correlationId ? `${e.message} (ref ${e.correlationId})` : e.message,
          })
        },
        onSettled: () => setPendingId(null),
      },
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <PageHeader
        title="Appointments"
        description="Who is coming in, and when."
        actions={
          <>
            <Button
              variant="tonal"
              iconLeft={<Settings2 className="size-4" />}
              onClick={() => setHoursOpen(true)}
            >
              Clinic hours
            </Button>
            {canWrite && (
              <Button
                variant="primary"
                iconLeft={<Plus className="size-4" />}
                onClick={() => openBooking(date, null)}
              >
                Book appointment
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Schedule view"
          value={view}
          onChange={setView}
          options={VIEW_OPTIONS}
        />

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            aria-label={view === 'week' ? 'Previous week' : 'Previous day'}
            onClick={() => setDate(shiftDate(date, view === 'week' ? -7 : -1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <label htmlFor={dateInputId} className="sr-only">
            {view === 'week' ? 'Week containing date' : 'Date'}
          </label>
          <Input
            id={dateInputId}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayIso())}
            className="w-40"
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label={view === 'week' ? 'Next week' : 'Next day'}
            onClick={() => setDate(shiftDate(date, view === 'week' ? 7 : 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDate(todayIso())}
            disabled={isToday}
            className="ml-1"
          >
            Today
          </Button>
        </div>

        <div className="ms-auto w-44">
          <Select
            aria-label="Filter by status"
            size="sm"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as AppointmentStatus | 'all')}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {view === 'day' ? (
        <DayView
          date={date}
          appointments={dayQuery.data?.items ?? []}
          slots={slots.data ?? []}
          hours={hoursForDate(availability.data ?? [], date)}
          isPending={dayQuery.isPending || availability.isPending}
          error={dayQuery.error ?? slots.error}
          onRetry={() => {
            void dayQuery.refetch()
            void slots.refetch()
          }}
          statusFilter={status}
          onClearFilter={() => setStatusFilter('all')}
          canWrite={canWrite}
          canManageHours={canManageHours}
          onBook={(startTime) => openBooking(date, startTime)}
          onOpenHours={() => setHoursOpen(true)}
          onStatusChange={handleStatusChange}
          pendingId={pendingId}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-heading font-semibold text-text">
              {formatDate(week[0])} – {formatDate(week[6])}
            </h2>
            {!weekQuery.isPending && (
              <p className="text-caption text-text-muted" data-numeric>
                {weekBooked} booked this week
              </p>
            )}
          </div>
          <WeekView
            days={week}
            appointments={weekAppointments}
            isPending={weekQuery.isPending}
            error={weekQuery.error}
            onRetry={() => void weekQuery.refetch()}
            statusFilter={status}
            selectedDate={date}
            onSelectDay={(next) => {
              setDate(next)
              setView('day')
            }}
            canWrite={canWrite}
            onBook={(forDate) => openBooking(forDate, null)}
          />
        </div>
      )}

      <BookAppointmentDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        initialDate={bookingRequest.date}
        initialStartTime={bookingRequest.startTime}
        availability={availability.data ?? []}
        onOpenHours={() => {
          setBookingOpen(false)
          setHoursOpen(true)
        }}
        canManageHours={canManageHours}
      />

      <AvailabilitySheet
        open={hoursOpen}
        onOpenChange={setHoursOpen}
        canManage={canManageHours}
      />
    </div>
  )
}

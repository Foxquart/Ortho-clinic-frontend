import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CalendarOff } from 'lucide-react'
import type {
  AppointmentDetailResponse,
  PatientSearchResult,
  WeeklyAvailabilityResponse,
} from '@/api/schema'
import { toApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import { formatDate, formatTime, fullName, todayIso } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  DAY_PAGE_SIZE,
  useAppointments,
  useAvailableSlots,
  useBookAppointment,
  usePatientSearch,
} from './queries'
import { DAY_LABEL, dayOfWeekFor, hhmm, hoursForDate, occupiesSlot } from './model'

/**
 * Mirrors `AppointmentCreateRequest`'s declared bounds so a 422 is never the
 * first the doctor hears of a problem. One deviation from the schema: the
 * document marks `patient_id` optional, but the staff booking route rejects a
 * body without one (`patient_id is required for admin booking.`), so the form
 * requires it.
 */
const schema = z.object({
  patient_id: z.string().min(1, 'Choose who this appointment is for'),
  appointment_date: z.string().min(1, 'Pick a date'),
  start_time: z.string().min(1, 'Pick a time'),
  reason: z.string().max(512, 'Keep the reason under 512 characters').optional(),
  notes: z.string().max(1024, 'Keep notes under 1024 characters').optional(),
})

type FormValues = z.infer<typeof schema>

export interface BookAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The day the doctor was looking at when they hit Book. */
  initialDate: string
  /** A slot they clicked directly, or null when they used the toolbar. */
  initialStartTime: string | null
  availability: readonly WeeklyAvailabilityResponse[]
  onOpenHours: () => void
  canManageHours: boolean
}

export function BookAppointmentDialog({
  open,
  onOpenChange,
  initialDate,
  initialStartTime,
  availability,
  onOpenHours,
  canManageHours,
}: BookAppointmentDialogProps) {
  const slotLabelId = useId()
  const [patient, setPatient] = useState<PatientSearchResult | null>(null)
  const [patientQuery, setPatientQuery] = useState('')
  const debouncedQuery = useDebouncedValue(patientQuery, 200)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      patient_id: '',
      appointment_date: initialDate,
      start_time: initialStartTime ?? '',
      reason: '',
      notes: '',
    },
  })

  const date = watch('appointment_date')
  const startTime = watch('start_time')

  // Re-open is a fresh booking: nothing from the last one should linger.
  useEffect(() => {
    if (!open) return
    reset({
      patient_id: '',
      appointment_date: initialDate,
      start_time: initialStartTime ?? '',
      reason: '',
      notes: '',
    })
    setPatient(null)
    setPatientQuery('')
  }, [open, initialDate, initialStartTime, reset])

  const patients = usePatientSearch(open ? debouncedQuery : '')
  const slots = useAvailableSlots(open && date ? date : null)
  // The slot route returns only free half hours, so the day's own bookings are
  // what makes "taken" visible at all.
  const dayBookings = useAppointments(
    {
      from_date: date,
      to_date: date,
      page: 1,
      page_size: DAY_PAGE_SIZE,
      sort_by: 'start_time',
      sort_order: 'asc',
    },
    open && Boolean(date),
  )

  const book = useBookAppointment()

  const hours = hoursForDate(availability, date)
  const day = dayOfWeekFor(date)
  const freeSlots = slots.data ?? []
  const takenSlots = (dayBookings.data?.items ?? []).filter((a) => occupiesSlot(a.status))
  const slotsPending = slots.isPending || dayBookings.isPending

  const rows = [
    ...freeSlots.map((slot) => ({
      time: slot.start_time,
      taken: false as const,
      appointment: null as AppointmentDetailResponse | null,
    })),
    ...takenSlots.map((appointment) => ({
      time: appointment.start_time,
      taken: true as const,
      appointment,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time) || (a.taken === b.taken ? 0 : a.taken ? 1 : -1))

  const onSubmit = handleSubmit((values) => {
    book.mutate(
      {
        patient_id: values.patient_id,
        appointment_date: values.appointment_date,
        // The API accepts HH:MM and emits HH:MM:SS; send the short form.
        start_time: hhmm(values.start_time),
        reason: values.reason?.trim() ? values.reason.trim() : undefined,
        notes: values.notes?.trim() ? values.notes.trim() : undefined,
        // `source` defaults to "public" even on the staff route, which would
        // make desk bookings indistinguishable in the audit trail. The schema
        // calls it a free string, but the server only accepts
        // public | admin | dashboard — anything else is a 422 on `body.source`.
        source: 'dashboard',
      },
      {
        onSuccess: (created) => {
          toast.success(
            `Booked ${fullName(created.patient.first_name, created.patient.last_name)} — ${formatDate(
              created.appointment_date,
            )}, ${formatTime(created.start_time)}`,
          )
          onOpenChange(false)
        },
        onError: (error) => {
          const e = toApiError(error)

          if (e.isValidation) {
            const fields = e.fieldErrors()
            let matched = false
            for (const [path, message] of Object.entries(fields)) {
              if (
                path === 'patient_id' ||
                path === 'appointment_date' ||
                path === 'start_time' ||
                path === 'reason' ||
                path === 'notes'
              ) {
                setError(path, { message })
                matched = true
              }
            }
            if (!matched) toast.error(e.message)
            return
          }

          if (e.isConflict) {
            // 409 here means the half hour went while this form was open.
            void slots.refetch()
            void dayBookings.refetch()
            setValue('start_time', '')
            setError('start_time', {
              message: 'That slot was taken while this form was open. Pick another time.',
            })
            return
          }

          if (e.status === 400 && /availability|clinic/i.test(e.message)) {
            setError('start_time', {
              message: `That time is outside the clinic's hours for ${
                day ? DAY_LABEL[day] : 'this day'
              }.`,
            })
            return
          }

          if (e.status === 404) {
            setError('patient_id', { message: 'That patient no longer exists. Choose another.' })
            return
          }

          toast.error(e.message)
        },
      },
    )
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Book an appointment"
        description="Consultations are half an hour, inside the clinic's weekly hours."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              loading={book.isPending}
              disabled={rows.every((row) => row.taken)}
            >
              Book appointment
            </Button>
          </>
        }
      >
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Patient" required error={errors.patient_id?.message}>
            {(a) => (
              <Combobox<PatientSearchResult>
                id={a.id}
                aria-describedby={a['aria-describedby']}
                invalid={Boolean(errors.patient_id)}
                value={patient}
                onChange={(item) => {
                  setPatient(item)
                  setValue('patient_id', item.id, { shouldValidate: true })
                }}
                query={patientQuery}
                onQueryChange={setPatientQuery}
                items={patients.data ?? []}
                loading={patients.isFetching}
                getKey={(item) => item.id}
                getLabel={(item) => `${fullName(item.first_name, item.last_name)} · ${item.phone}`}
                placeholder="Search by name or phone…"
                searchPlaceholder="Name or phone…"
                emptyMessage={
                  patientQuery.trim().length === 0
                    ? 'Type a name or phone number'
                    : `No patient matches “${patientQuery.trim()}”`
                }
                renderItem={(item) => (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-text">
                      {fullName(item.first_name, item.last_name)}
                    </span>
                    <span className="truncate text-caption text-text-muted" data-numeric>
                      {item.phone}
                    </span>
                  </span>
                )}
              />
            )}
          </Field>

          <Field label="Date" required error={errors.appointment_date?.message}>
            {(a) => (
              <Input
                {...a}
                {...register('appointment_date', {
                  onChange: () => setValue('start_time', '', { shouldValidate: false }),
                })}
                type="date"
                min={todayIso()}
                className="w-48"
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span id={slotLabelId} className="text-label text-text-muted">
              Time <span aria-hidden className="text-danger">*</span>
            </span>

            {slotsPending ? (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : hours.length === 0 ? (
              <EmptySlots
                title={day ? `The clinic is closed on ${DAY_LABEL[day]}s` : 'No clinic hours'}
                description="No weekly hours are set for this day, so no slot can be booked."
                action={
                  canManageHours && (
                    <Button variant="secondary" size="sm" onClick={onOpenHours}>
                      Set clinic hours
                    </Button>
                  )
                }
              />
            ) : freeSlots.length === 0 ? (
              <EmptySlots
                title="Every slot is taken"
                description={`Nothing is free on ${formatDate(date)}. Try another day.`}
              />
            ) : (
              <fieldset className="min-w-0">
                <legend className="sr-only">
                  Available times on {formatDate(date)}
                </legend>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {rows.map((row) => {
                    const value = row.time
                    const selected = Boolean(startTime) && hhmm(startTime) === hhmm(value)
                    const takenBy = row.appointment
                      ? fullName(
                          row.appointment.patient.first_name,
                          row.appointment.patient.last_name,
                        )
                      : null

                    return (
                      <label
                        key={`${row.taken ? 'taken' : 'free'}-${value}`}
                        className={cn(
                          'flex h-8 items-center justify-center rounded-md border text-caption',
                          'transition-[border-color,background-color,color] duration-fast ease-standard',
                          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                          row.taken
                            ? 'cursor-not-allowed border-dashed border-border text-text-subtle'
                            : 'cursor-pointer border-border bg-surface text-text hover:border-border-strong',
                          !row.taken &&
                            'has-[:checked]:border-accent has-[:checked]:bg-accent-muted has-[:checked]:text-accent',
                        )}
                        title={takenBy ? `Booked — ${takenBy}` : undefined}
                      >
                        <input
                          type="radio"
                          name="start_time"
                          className="sr-only"
                          value={value}
                          disabled={row.taken}
                          checked={selected && !row.taken}
                          onChange={() =>
                            setValue('start_time', value, { shouldValidate: true })
                          }
                          aria-label={
                            takenBy
                              ? `${formatTime(value)} — booked for ${takenBy}`
                              : `${formatTime(value)} — free`
                          }
                        />
                        <span aria-hidden data-numeric>
                          {formatTime(value)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {errors.start_time?.message && (
              <p role="alert" className="text-caption font-medium text-danger">
                {errors.start_time.message}
              </p>
            )}
            {!errors.start_time && freeSlots.length > 0 && (
              <p className="text-caption text-text-subtle">
                {freeSlots.length} free · dashed times are already booked.
              </p>
            )}
          </div>

          <Field label="Reason" optionalLabel error={errors.reason?.message}>
            {(a) => (
              <Input {...a} {...register('reason')} placeholder="Knee pain, follow-up…" />
            )}
          </Field>

          <Field label="Notes for the file" optionalLabel error={errors.notes?.message}>
            {(a) => <Textarea {...a} {...register('notes')} rows={2} />}
          </Field>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

function EmptySlots({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <CalendarOff aria-hidden className="size-5 text-text-subtle" />
      <p className="text-body font-medium text-text">{title}</p>
      <p className="max-w-xs text-caption text-text-muted">{description}</p>
      {action}
    </div>
  )
}

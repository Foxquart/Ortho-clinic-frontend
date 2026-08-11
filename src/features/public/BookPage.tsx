import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { ApiError } from '@/api/errors'
import type { AppointmentDetailResponse } from '@/api/schema'
import { cn } from '@/lib/cn'
import { formatTime, todayIso } from '@/lib/format'
import {
  ButtonLink,
  Container,
  Eyebrow,
  LEDE_TYPE,
  LoadingBlock,
  PAGE_TITLE_TYPE,
  Panel,
  SiteError,
} from './Parts'
import { HoursList } from './Collections'
import {
  DAY_LABEL,
  dayOfWeekForIso,
  isClinicOpenOn,
  longDayLabel,
  nextOpenDates,
  shortDayLabel,
  text,
} from './content'
import {
  prewarmCsrf,
  useBookAppointment,
  usePublicAvailability,
  usePublicClinic,
  usePublicDoctor,
  usePublicSlots,
} from './usePublicData'
import { siteTitle, usePageTitle } from './usePageTitle'
import { SITE_ROOT } from './routes'

/**
 * Mirrors `AppointmentCreateByPatientRequest` exactly, so nobody is bounced by
 * a server 422 the form could have caught:
 *   patient_first_name  required, 1..64
 *   patient_last_name   required, 1..64
 *   patient_phone       required, 6..20
 *   reason              optional, <= 512
 * `appointment_date` and `start_time` are chosen with the date and slot
 * pickers rather than typed, so they are validated separately.
 */
const bookingSchema = z.object({
  patient_first_name: z
    .string()
    .trim()
    .min(1, 'Please enter your first name')
    .max(64, 'First name must be 64 characters or fewer'),
  patient_last_name: z
    .string()
    .trim()
    .min(1, 'Please enter your last name')
    .max(64, 'Last name must be 64 characters or fewer'),
  patient_phone: z
    .string()
    .trim()
    .min(6, 'Please enter a phone number of at least 6 characters')
    .max(20, 'Phone number must be 20 characters or fewer'),
  reason: z.string().trim().max(512, 'Please keep this under 512 characters').optional(),
})

type BookingValues = z.infer<typeof bookingSchema>

interface Confirmation {
  appointment: AppointmentDetailResponse
  patientName: string
}

export function BookPage() {
  const clinicQuery = usePublicClinic()
  const doctorQuery = usePublicDoctor()
  const availabilityQuery = usePublicAvailability()

  const clinic = clinicQuery.data
  const doctor = doctorQuery.data
  const availability = useMemo(() => availabilityQuery.data ?? [], [availabilityQuery.data])

  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  usePageTitle(
    siteTitle(confirmation ? 'Appointment requested' : 'Book an appointment', clinic?.clinic_name),
  )

  const suggestedDates = useMemo(() => nextOpenDates(availability, 5), [availability])

  // Land on the next day the clinic is actually open, so the first thing a
  // patient sees is real availability rather than an empty Sunday.
  useEffect(() => {
    if (date !== null) return
    if (availabilityQuery.isPending) return
    setDate(suggestedDates[0] ?? todayIso())
  }, [availabilityQuery.isPending, date, suggestedDates])

  useEffect(() => {
    prewarmCsrf()
  }, [])

  const slotsQuery = usePublicSlots(confirmation ? null : date)
  const freeSlots = useMemo(
    () => (slotsQuery.data ?? []).filter((s) => s.status === 'available'),
    [slotsQuery.data],
  )

  // A slot can disappear between rendering and submitting. Drop the selection
  // rather than letting the patient submit something that no longer exists.
  useEffect(() => {
    if (slot && slotsQuery.data && !freeSlots.some((s) => s.start_time === slot)) {
      setSlot(null)
    }
  }, [freeSlots, slot, slotsQuery.data])

  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      patient_first_name: '',
      patient_last_name: '',
      patient_phone: '',
      reason: '',
    },
  })

  const booking = useBookAppointment()

  // The confirmation replaces the form in place, so nothing scrolls on its own.
  // Go back to the top first, then take focus without letting the browser
  // scroll again — otherwise the heading lands under the sticky header.
  const confirmationRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!confirmation) return
    window.scrollTo({ top: 0, behavior: 'auto' })
    confirmationRef.current?.focus({ preventScroll: true })
  }, [confirmation])

  function chooseDate(next: string) {
    setDate(next)
    setSlot(null)
    setSlotError(null)
    setFormError(null)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    if (!date) {
      setSlotError('Please choose a date.')
      return
    }
    if (!slot) {
      setSlotError('Please choose a time.')
      return
    }
    setSlotError(null)

    try {
      const appointment = await booking.mutateAsync({
        patient_first_name: values.patient_first_name,
        patient_last_name: values.patient_last_name,
        patient_phone: values.patient_phone,
        appointment_date: date,
        start_time: slot,
        reason: values.reason ? values.reason : null,
      })
      setConfirmation({
        appointment,
        patientName: `${values.patient_first_name} ${values.patient_last_name}`,
      })
      form.reset()
      setSlot(null)
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null

      if (apiError?.isConflict) {
        // Somebody took the slot while this form was being filled in. Refresh
        // the list and say so — never surface a raw conflict.
        setSlot(null)
        setFormError(
          'That time was booked by someone else a moment ago. We have refreshed the times below — please pick another.',
        )
        void slotsQuery.refetch()
        return
      }

      if (apiError?.isValidation) {
        const fieldErrors = apiError.fieldErrors()
        let matched = false
        for (const key of [
          'patient_first_name',
          'patient_last_name',
          'patient_phone',
          'reason',
        ] as const) {
          const message = fieldErrors[key]
          if (message) {
            matched = true
            form.setError(key, { type: 'server', message })
          }
        }
        if (fieldErrors.appointment_date || fieldErrors.start_time) {
          matched = true
          setSlotError(fieldErrors.start_time ?? fieldErrors.appointment_date ?? null)
          void slotsQuery.refetch()
        }
        if (!matched) setFormError(apiError.message)
        return
      }

      if (apiError?.status === 0) {
        setFormError(
          'We could not reach the clinic just now. Check your connection and try again, or call us.',
        )
        return
      }

      setFormError(
        apiError?.message ?? 'Something went wrong while booking. Please try again in a moment.',
      )
    }
  })

  const clinicPhone = text(clinic?.phone)
  const openToday = date ? isClinicOpenOn(availability, date) : null
  const dayName = date ? dayOfWeekForIso(date) : null

  if (confirmation) {
    return (
      <BookingConfirmation
        ref={confirmationRef}
        confirmation={confirmation}
        clinicPhone={clinicPhone}
        doctorName={doctor?.full_name ?? null}
        onBookAnother={() => {
          setConfirmation(null)
          setSlot(null)
          setFormError(null)
        }}
      />
    )
  }

  return (
    <Container className="py-12 sm:py-16">
      <div className="flex max-w-2xl flex-col gap-3">
        <Eyebrow>Appointments</Eyebrow>
        <h1 className={cn(PAGE_TITLE_TYPE, 'text-text')}>Book an appointment</h1>
        <p className={cn(LEDE_TYPE, 'text-text-muted')}>
          Pick a day, choose a free time
          {doctor?.full_name ? ` with ${doctor.full_name}` : ''}, and leave your name and phone
          number. The clinic will call you back to confirm.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        {/* --------------------------------------------------------------- */}
        {/* The booking form itself                                          */}
        {/* --------------------------------------------------------------- */}
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
          <Panel className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-heading text-text">1. Choose a day</h2>
              <p className="text-body text-text-muted">
                These are the next days the clinic is open.
              </p>
            </div>

            {availabilityQuery.isPending ? (
              <LoadingBlock lines={2} />
            ) : (
              <>
                {suggestedDates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestedDates.map((iso) => {
                      const selected = iso === date
                      return (
                        <button
                          key={iso}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => chooseDate(iso)}
                          className={cn(
                            'min-h-tap text-label rounded-lg border px-3.5 py-2 font-medium',
                            'duration-fast ease-standard transition-[background-color,border-color,color]',
                            'active:scale-[0.98] motion-reduce:active:scale-100',
                            selected
                              ? 'border-accent bg-accent text-accent-fg shadow-sm'
                              : 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
                          )}
                        >
                          {shortDayLabel(iso)}
                        </button>
                      )
                    })}
                  </div>
                )}

                <Field
                  label={suggestedDates.length > 0 ? 'Or pick another date' : 'Date'}
                  hint="Appointments can be booked up to a year ahead."
                >
                  {(a) => (
                    <Input
                      {...a}
                      type="date"
                      inputSize="lg"
                      min={todayIso()}
                      value={date ?? ''}
                      onChange={(event) => chooseDate(event.target.value)}
                      className="max-w-xs"
                      iconLeft={<CalendarDays />}
                    />
                  )}
                </Field>
              </>
            )}
          </Panel>

          <Panel className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-heading text-text">2. Choose a time</h2>
              {date && <p className="text-body text-text-muted">{longDayLabel(date)}</p>}
            </div>

            <div aria-live="polite" className="min-h-12">
              {!date ? (
                <p className="text-body text-text-muted">Choose a date first.</p>
              ) : slotsQuery.isPending ? (
                <SlotSkeleton />
              ) : slotsQuery.isError ? (
                <SiteError
                  title="We could not load the times for this day"
                  description={
                    clinicPhone
                      ? `Please try again, or call the clinic on ${clinicPhone}.`
                      : 'Please try again in a moment.'
                  }
                  onRetry={() => void slotsQuery.refetch()}
                />
              ) : freeSlots.length === 0 ? (
                <p className="text-body text-text-muted">
                  {openToday === false && dayName
                    ? `The clinic is closed on ${DAY_LABEL[dayName]}s. Please pick one of the open days above.`
                    : 'Every time on this day is already taken. Please try another date.'}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {freeSlots.map((available) => {
                    const selected = available.start_time === slot
                    return (
                      <li key={available.start_time}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setSlot(available.start_time)
                            setSlotError(null)
                            setFormError(null)
                          }}
                          className={cn(
                            'min-h-tap text-label rounded-lg border px-4 py-2 font-medium tabular-nums',
                            'duration-fast ease-standard transition-[background-color,border-color,color]',
                            'active:scale-[0.98] motion-reduce:active:scale-100',
                            selected
                              ? 'border-accent bg-accent text-accent-fg shadow-sm'
                              : 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
                          )}
                        >
                          {formatTime(available.start_time)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {slotError && (
              <p role="alert" className="text-caption text-danger font-medium">
                {slotError}
              </p>
            )}
          </Panel>

          <Panel className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-heading text-text">3. Your details</h2>
              <p className="text-body text-text-muted">
                We only need a name and a phone number to hold the appointment.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                required
                error={form.formState.errors.patient_first_name?.message}
              >
                {(a) => (
                  <Input
                    {...a}
                    {...form.register('patient_first_name')}
                    inputSize="lg"
                    autoComplete="given-name"
                    maxLength={64}
                  />
                )}
              </Field>
              <Field
                label="Last name"
                required
                error={form.formState.errors.patient_last_name?.message}
              >
                {(a) => (
                  <Input
                    {...a}
                    {...form.register('patient_last_name')}
                    inputSize="lg"
                    autoComplete="family-name"
                    maxLength={64}
                  />
                )}
              </Field>
            </div>

            <Field
              label="Phone number"
              required
              hint="The clinic will call this number to confirm your appointment."
              error={form.formState.errors.patient_phone?.message}
            >
              {(a) => (
                <Input
                  {...a}
                  {...form.register('patient_phone')}
                  type="tel"
                  inputSize="lg"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  iconLeft={<Phone />}
                />
              )}
            </Field>

            <Field
              label="What would you like to be seen for?"
              optionalLabel
              hint="A short note helps the clinic prepare — for example “knee pain for three weeks”."
              error={form.formState.errors.reason?.message}
            >
              {(a) => (
                <Textarea
                  {...a}
                  {...form.register('reason')}
                  rows={3}
                  maxLength={512}
                  invalid={Boolean(form.formState.errors.reason)}
                />
              )}
            </Field>

            {formError && (
              <p
                role="alert"
                className="border-danger/25 bg-danger-muted text-body text-danger rounded-md border px-3.5 py-2.5"
              >
                {formError}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={booking.isPending}
                className="w-full sm:w-auto sm:self-start"
              >
                {date && slot
                  ? `Request ${shortDayLabel(date)} at ${formatTime(slot)}`
                  : 'Request appointment'}
              </Button>
              <p className="text-caption text-text-subtle">
                Requesting an appointment does not charge you anything. The clinic will confirm by
                phone.
              </p>
            </div>
          </Panel>
        </form>

        {/* --------------------------------------------------------------- */}
        {/* Context: who you are seeing, when the clinic is open             */}
        {/* --------------------------------------------------------------- */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
          {doctor && (
            <Panel className="flex flex-col gap-2">
              <h2 className="text-heading text-text">{doctor.full_name}</h2>
              {text(doctor.specialization) && (
                <p className="text-body text-text-muted">{doctor.specialization}</p>
              )}
              {text(doctor.qualifications) && (
                <p className="text-caption text-text-subtle">{doctor.qualifications}</p>
              )}
              <Link
                to={`${SITE_ROOT}/about`}
                className="text-label text-accent mt-2 self-start rounded-sm font-medium underline-offset-4 hover:underline"
              >
                Read the full profile
              </Link>
            </Panel>
          )}

          <Panel className="flex flex-col gap-4">
            <h2 className="text-heading text-text">Consulting hours</h2>
            <HoursList availability={availability} loading={availabilityQuery.isPending} />
          </Panel>

          {(clinicPhone || text(clinic?.address)) && (
            <Panel className="flex flex-col gap-3">
              <h2 className="text-heading text-text">Prefer to call?</h2>
              {clinicPhone && (
                <a
                  href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
                  className="text-body text-accent rounded-sm font-medium underline-offset-4 hover:underline"
                >
                  {clinicPhone}
                </a>
              )}
              {text(clinic?.address) && (
                <p className="text-body text-text-muted">
                  {[clinic?.address, clinic?.city, clinic?.postal_code].filter(Boolean).join(', ')}
                </p>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </Container>
  )
}

function SlotSkeleton() {
  return (
    <ul aria-hidden className="flex flex-wrap gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <li
          key={index}
          className="bg-border/60 h-11 w-24 animate-pulse rounded-lg motion-reduce:animate-none"
        />
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Confirmation                                                              */
/* -------------------------------------------------------------------------- */

function BookingConfirmation({
  ref,
  confirmation,
  clinicPhone,
  doctorName,
  onBookAnother,
}: {
  ref: React.Ref<HTMLDivElement>
  confirmation: Confirmation
  clinicPhone: string | null
  doctorName: string | null
  onBookAnother: () => void
}) {
  const { appointment, patientName } = confirmation

  return (
    <Container className="py-16 sm:py-24">
      <div
        ref={ref}
        tabIndex={-1}
        className="border-border bg-surface focus-visible:outline-focus mx-auto flex max-w-xl scroll-mt-24 flex-col gap-6 rounded-xl border p-8 shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-10"
      >
        <span
          aria-hidden
          className="bg-success-muted text-success grid size-12 place-items-center rounded-full [&_svg]:size-6"
        >
          <CheckCircle2 />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="text-text text-[clamp(1.5rem,4vw,2rem)] leading-[1.15] font-semibold tracking-tight">
            Your appointment is requested
          </h1>
          <p className="text-body text-text-muted leading-relaxed">
            We have held this time for you. Nothing else is needed from you right now.
          </p>
        </div>

        <dl className="border-border bg-bg-sunken flex flex-col rounded-lg border px-4">
          <ConfirmationRow label="Who" value={patientName} />
          <ConfirmationRow label="When" value={longDayLabel(appointment.appointment_date)} />
          <ConfirmationRow
            label="Time"
            value={`${formatTime(appointment.start_time)} – ${formatTime(appointment.end_time)}`}
          />
          {doctorName && <ConfirmationRow label="With" value={doctorName} />}
          {text(appointment.reason) && (
            <ConfirmationRow label="Reason" value={appointment.reason as string} />
          )}
        </dl>

        <div className="flex flex-col gap-2">
          <h2 className="text-label text-text font-semibold">What happens next</h2>
          <ul className="text-body text-text-muted flex list-disc flex-col gap-1.5 pl-5">
            <li>The clinic will call you on the number you gave us to confirm this time.</li>
            <li>Arrive about ten minutes early and bring any previous scans or reports.</li>
            <li>
              To change or cancel,{' '}
              {clinicPhone ? (
                <>
                  call{' '}
                  <a
                    href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
                    className="text-accent rounded-sm font-medium underline-offset-4 hover:underline"
                  >
                    {clinicPhone}
                  </a>
                  .
                </>
              ) : (
                'contact the clinic.'
              )}
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="lg" onClick={onBookAnother}>
            Book another appointment
          </Button>
          <ButtonLink to={SITE_ROOT} tone="ghost" size="lg">
            Back to the home page
          </ButtonLink>
        </div>
      </div>
    </Container>
  )
}

function ConfirmationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex flex-col gap-0.5 border-b py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="text-label text-text-muted sm:w-20 sm:shrink-0">{label}</dt>
      <dd className="text-body text-text font-medium">{value}</dd>
    </div>
  )
}

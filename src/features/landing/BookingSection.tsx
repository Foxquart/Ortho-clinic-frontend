import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { CalendarDays, CheckCircle2, Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { ApiError } from '@/api/errors'
import type { AppointmentDetailResponse } from '@/api/schema'
import { cn } from '@/lib/cn'
import { formatTime, todayIso } from '@/lib/format'
import {
  DAY_LABEL,
  dayOfWeekForIso,
  isClinicOpenOn,
  longDayLabel,
  nextOpenDates,
  shortDayLabel,
} from '@/features/public/content'
import {
  prewarmCsrf,
  useBookAppointment,
  usePublicAvailability,
  usePublicSlots,
} from '@/features/public/usePublicData'

/**
 * Mirrors `AppointmentCreateByPatientRequest` exactly so the patient is never
 * bounced by a server 422 the form could have caught first:
 *   patient_first_name  required, 1..64
 *   patient_last_name   required, 1..64
 *   patient_phone       required, 6..20
 *   reason              optional, <= 512
 * `appointment_date` and `start_time` come from the date and slot pickers, so
 * they are validated separately (see `onSubmit`).
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

/**
 * A self-contained appointment booking block for the public landing page.
 * Drops in as a full-width `<section id="book">` — it carries its own heading,
 * the date + slot pickers, the patient form, and the success / error states.
 *
 * The data layer is entirely reused from `@/features/public/usePublicData`;
 * this file only re-skins that flow for the landing page.
 */
export function BookingSection(): JSX.Element {
  const availabilityQuery = usePublicAvailability()
  const availability = useMemo(() => availabilityQuery.data ?? [], [availabilityQuery.data])

  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const suggestedDates = useMemo(() => nextOpenDates(availability, 5), [availability])

  // Land on the next day the clinic is actually open, so the first thing the
  // patient sees is real availability rather than an empty Sunday.
  useEffect(() => {
    if (date !== null) return
    if (availabilityQuery.isPending) return
    setDate(suggestedDates[0] ?? todayIso())
  }, [availabilityQuery.isPending, date, suggestedDates])

  // Warm the CSRF cookie once so the first submit is not paying for a round trip.
  useEffect(() => {
    prewarmCsrf()
  }, [])

  const slotsQuery = usePublicSlots(confirmation ? null : date)
  const freeSlots = useMemo(
    () => (slotsQuery.data ?? []).filter((s) => s.status === 'available'),
    [slotsQuery.data],
  )

  // A slot can vanish between render and submit. Drop a stale selection rather
  // than letting the patient submit a time that no longer exists.
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

  const sectionRef = useRef<HTMLElement | null>(null)
  const confirmationRef = useRef<HTMLDivElement | null>(null)

  // Move focus to the confirmation when it appears, without letting the browser
  // scroll on its own.
  useEffect(() => {
    if (!confirmation) return
    confirmationRef.current?.focus({ preventScroll: true })
  }, [confirmation])

  // A small entrance animation. It is fully guarded by `matchMedia` so it does
  // nothing under `prefers-reduced-motion`, and it only animates a translate +
  // a fade IN from the elements' natural (visible) state — the form is present
  // and usable with or without JS; nothing is left invisible if a tween never
  // runs.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-anim="rise"]', {
          y: 16,
          autoAlpha: 0,
          duration: 0.5,
          ease: 'power2.out',
          stagger: 0.08,
          clearProps: 'transform,opacity,visibility',
        })
      })
      return () => mm.revert()
    },
    { scope: sectionRef },
  )

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
        // Someone took the slot while this form was being filled in. Refresh the
        // list and say so — never surface a raw 409.
        setSlot(null)
        setFormError(
          'That time was just booked by someone else. We have refreshed the times below — please pick another.',
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

      if (apiError?.status === 429 || apiError?.code === 'rate_limited') {
        setFormError(
          'You have tried a few times in quick succession. Please wait a moment and try again.',
        )
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

  const openToday = date ? isClinicOpenOn(availability, date) : null
  const dayName = date ? dayOfWeekForIso(date) : null

  return (
    <section
      id="book"
      ref={sectionRef}
      aria-labelledby="book-heading"
      className="bg-bg w-full scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mx-auto w-full max-w-2xl">
        {confirmation ? (
          <BookingConfirmation
            ref={confirmationRef}
            confirmation={confirmation}
            onBookAnother={() => {
              setConfirmation(null)
              setSlot(null)
              setFormError(null)
            }}
          />
        ) : (
          <>
            <header data-anim="rise" className="flex flex-col gap-3">
              <Badge tone="accent">Appointments</Badge>
              <h2
                id="book-heading"
                className="text-title text-text text-balance"
              >
                Book an appointment
              </h2>
              <p className="text-body text-text-muted max-w-prose">
                Pick a day, choose a free time, and leave your name and phone number. The clinic
                will call you back to confirm — booking here costs you nothing.
              </p>
            </header>

            <form onSubmit={onSubmit} noValidate className="mt-10 flex flex-col gap-8">
              {/* 1. Date ------------------------------------------------- */}
              <fieldset
                data-anim="rise"
                className="border-border bg-surface flex flex-col gap-5 rounded-xl border p-5 shadow-xs sm:p-6"
              >
                <legend className="sr-only">Choose a day</legend>
                <div className="flex flex-col gap-1">
                  <h3 className="text-heading text-text">1. Choose a day</h3>
                  <p className="text-body text-text-muted">
                    These are the next days the clinic is open.
                  </p>
                </div>

                {availabilityQuery.isPending ? (
                  <div
                    aria-hidden
                    className="bg-surface-hover h-11 w-full max-w-xs animate-pulse rounded-lg motion-reduce:animate-none"
                  />
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
                                'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
                                'active:scale-[0.98] motion-reduce:active:scale-100',
                                selected
                                  ? 'border-accent bg-accent text-accent-fg shadow-sm'
                                  : 'border-border-field bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
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
              </fieldset>

              {/* 2. Time ------------------------------------------------- */}
              <fieldset
                data-anim="rise"
                className="border-border bg-surface flex flex-col gap-5 rounded-xl border p-5 shadow-xs sm:p-6"
              >
                <legend className="sr-only">Choose a time</legend>
                <div className="flex flex-col gap-1">
                  <h3 className="text-heading text-text">2. Choose a time</h3>
                  {date && <p className="text-body text-text-muted">{longDayLabel(date)}</p>}
                </div>

                <div aria-live="polite" className="min-h-12">
                  {!date ? (
                    <p className="text-body text-text-muted">Choose a date first.</p>
                  ) : slotsQuery.isPending ? (
                    <SlotSkeleton />
                  ) : slotsQuery.isError ? (
                    <div className="border-danger/25 bg-danger-muted flex flex-col items-start gap-3 rounded-lg border p-4">
                      <p className="text-body text-danger">
                        We could not load the times for this day. Please try again in a moment.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void slotsQuery.refetch()}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : freeSlots.length === 0 ? (
                    // Distinguish a clinic that is CLOSED that weekday from one
                    // that is open but fully booked.
                    openToday === false && dayName ? (
                      <p className="text-body text-text-muted">
                        The clinic is closed on {DAY_LABEL[dayName]}s.{' '}
                        {suggestedDates.length > 0
                          ? 'Please pick one of the open days above.'
                          : 'Please pick another date.'}
                      </p>
                    ) : (
                      <p className="text-body text-text-muted">
                        Every time on this day is already taken. Please try another date.
                      </p>
                    )
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
                                'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
                                'active:scale-[0.98] motion-reduce:active:scale-100',
                                selected
                                  ? 'border-accent bg-accent text-accent-fg shadow-sm'
                                  : 'border-border-field bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
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
              </fieldset>

              {/* 3. Details ---------------------------------------------- */}
              <fieldset
                data-anim="rise"
                className="border-border bg-surface flex flex-col gap-5 rounded-xl border p-5 shadow-xs sm:p-6"
              >
                <legend className="sr-only">Your details</legend>
                <div className="flex flex-col gap-1">
                  <h3 className="text-heading text-text">3. Your details</h3>
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

                {/* One shared, polite live region for form-level errors. */}
                <div aria-live="polite">
                  {formError && (
                    <p
                      role="alert"
                      className="border-danger/25 bg-danger-muted text-body text-danger rounded-md border px-3.5 py-2.5"
                    >
                      {formError}
                    </p>
                  )}
                </div>

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
                    Requesting an appointment does not charge you anything. The clinic will confirm
                    by phone.
                  </p>
                </div>
              </fieldset>
            </form>
          </>
        )}
      </div>
    </section>
  )
}

function SlotSkeleton() {
  return (
    <ul aria-hidden className="flex flex-wrap gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <li
          key={index}
          className="bg-surface-hover h-11 w-24 animate-pulse rounded-lg motion-reduce:animate-none"
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
  onBookAnother,
}: {
  ref: React.Ref<HTMLDivElement>
  confirmation: Confirmation
  onBookAnother: () => void
}) {
  const { appointment, patientName } = confirmation

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-live="polite"
      className="border-border bg-surface focus-visible:outline-focus flex flex-col gap-6 rounded-xl border p-6 shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-8"
    >
      <span
        aria-hidden
        className="bg-success-muted text-success grid size-12 place-items-center rounded-full [&_svg]:size-6"
      >
        <CheckCircle2 />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="text-title text-text">Your appointment is requested</h2>
        <p className="text-body text-text-muted leading-relaxed">
          We have held this time for you. Nothing else is needed from you right now — the clinic
          will call to confirm.
        </p>
      </div>

      <dl className="border-border bg-bg-sunken flex flex-col rounded-lg border px-4">
        <ConfirmationRow label="Who" value={patientName} />
        <ConfirmationRow label="When" value={longDayLabel(appointment.appointment_date)} />
        <ConfirmationRow
          label="Time"
          value={`${formatTime(appointment.start_time)} – ${formatTime(appointment.end_time)}`}
        />
      </dl>

      <div>
        <Button variant="secondary" size="lg" onClick={onBookAnother}>
          Book another appointment
        </Button>
      </div>
    </div>
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

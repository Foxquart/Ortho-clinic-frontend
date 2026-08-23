import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  MapPin,
  Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { ApiError } from '@/api/errors'
import type { AppointmentDetailResponse, ClinicSettingsResponse } from '@/api/schema'
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
  usePublicClinic,
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
 * What the time is for. The API carries one free-text `reason`, so the choice
 * is prepended to whatever the visitor writes, keeping the distinction visible
 * to the clinic without a schema change.
 */
const PURPOSES = [
  {
    id: 'consultation',
    title: 'A consultation',
    detail: 'Something about your teeth or your smile.',
    prefix: 'Consultation.',
  },
  {
    id: 'conversation',
    title: 'A conversation',
    detail: 'Coffee, ideas, or a question you have been carrying.',
    prefix: 'A conversation.',
  },
  {
    id: 'event',
    title: 'An event or talk',
    detail: 'Speaking, teaching, or a community evening.',
    prefix: 'An event or talk.',
  },
] as const

type Purpose = (typeof PURPOSES)[number]['id']

const REASON_COPY: Record<Purpose, { label: string; hint: string }> = {
  consultation: {
    label: 'What would you like to be seen for?',
    hint: 'A short note helps me prepare, for example "crowded front teeth" or "thinking about aligners".',
  },
  conversation: {
    label: 'What shall we talk about?',
    hint: 'A sentence or two is plenty. It helps me bring the right stories.',
  },
  event: {
    label: 'Tell me about the event',
    hint: 'The audience, the city, and what you would like the room to leave with.',
  },
}

/** What the patient has picked so far, rendered live in the identity panel. */
interface Selection {
  date: string
  startTime: string
  endTime: string | null
}

/**
 * The appointment booking block for the public landing page: a single centred,
 * cal.com-style card. The left panel anchors "what am I booking" (clinic
 * identity, duration, address, the live selection); the right panel walks the
 * patient through date, then time, then details, then a confirmation that
 * replaces the step content while the identity panel stays put.
 *
 * The data layer is entirely reused from `@/features/public/usePublicData`;
 * this file only re-skins that flow for the landing page.
 */
export function BookingSection(): JSX.Element {
  const clinicQuery = usePublicClinic()
  const availabilityQuery = usePublicAvailability()
  const availability = useMemo(() => availabilityQuery.data ?? [], [availabilityQuery.data])

  const [purpose, setPurpose] = useState<Purpose>('consultation')
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
  // than letting the patient submit a time that no longer exists — this also
  // sends them back to the times list, which is where the fresh truth lives.
  useEffect(() => {
    if (slot && slotsQuery.data && !freeSlots.some((s) => s.start_time === slot)) {
      setSlot(null)
    }
  }, [freeSlots, slot, slotsQuery.data])

  // Slot length for the "30 min" meta row. Derived from the day's slot grid and
  // kept sticky so it does not flicker away while a closed day is selected.
  const slotMinutes = useMemo(() => {
    const first = slotsQuery.data?.[0]
    return first ? minutesBetween(first.start_time, first.end_time) : null
  }, [slotsQuery.data])
  const [knownMinutes, setKnownMinutes] = useState<number | null>(null)
  useEffect(() => {
    if (slotMinutes !== null) setKnownMinutes(slotMinutes)
  }, [slotMinutes])

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
  const detailsRef = useRef<HTMLDivElement | null>(null)

  // Move focus to the confirmation when it appears, without letting the browser
  // scroll on its own.
  useEffect(() => {
    if (!confirmation) return
    confirmationRef.current?.focus({ preventScroll: true })
  }, [confirmation])

  // Picking a time unmounts the times list (the details step replaces it), so
  // hand focus to the details step or keyboard users are dropped on <body>.
  useEffect(() => {
    if (!slot) return
    detailsRef.current?.focus({ preventScroll: true })
  }, [slot])

  // A small entrance animation. It is fully guarded by `matchMedia` so it does
  // nothing under `prefers-reduced-motion`, and it only animates a translate +
  // a fade IN from the elements' natural (visible) state — the card is present
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

    const prefix = PURPOSES.find((p) => p.id === purpose)?.prefix ?? ''

    try {
      const appointment = await booking.mutateAsync({
        patient_first_name: values.patient_first_name,
        patient_last_name: values.patient_last_name,
        patient_phone: values.patient_phone,
        appointment_date: date,
        start_time: slot,
        reason: values.reason ? `${prefix} ${values.reason}` : prefix || null,
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
        // list and say so — never surface a raw 409. Clearing the slot returns
        // the patient to the times list, where the refreshed times appear.
        setSlot(null)
        setFormError(
          'That time was just booked by someone else. We have refreshed the times below. Please pick another.',
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

  // The selection mirrored in the identity panel: the booked appointment once
  // confirmed, otherwise the in-progress date + time pick.
  const pickedSlot = slot ? (freeSlots.find((s) => s.start_time === slot) ?? null) : null
  const selection: Selection | null = confirmation
    ? {
        date: confirmation.appointment.appointment_date,
        startTime: confirmation.appointment.start_time,
        endTime: confirmation.appointment.end_time,
      }
    : date && slot
      ? { date, startTime: slot, endTime: pickedSlot?.end_time ?? null }
      : null

  return (
    <section
      id="book"
      ref={sectionRef}
      aria-labelledby="book-heading"
      className="bg-bg w-full scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24"
    >
      <header data-anim="rise" className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <Badge tone="accent">Appointments</Badge>
        <h2 id="book-heading" className="lp-h2 text-text">
          Book your visit
        </h2>
        <p className="lp-lead">
          Pick a day and a free time, then leave your name and phone number. The clinic will call
          you back to confirm.
        </p>
      </header>

      {/* The cal.com-style card: identity panel on the left, steps on the right. */}
      <div
        data-anim="rise"
        className="border-border bg-surface mx-auto mt-10 w-full max-w-5xl overflow-hidden rounded-2xl border shadow-sm sm:mt-12 md:grid md:grid-cols-[minmax(240px,0.8fr)_1.2fr]"
      >
        <ClinicPanel clinic={clinicQuery.data} minutes={knownMinutes} selection={selection} />

        <div className="p-5 sm:p-6 md:p-8">
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
            <div className="flex flex-col gap-6">
              {/* One shared, polite live region for form-level errors. It stays
                  mounted across the schedule and details steps so a 409 that
                  bounces the patient back to the times list is still announced. */}
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

              {slot === null ? (
                /* Step 1 + 2: pick a day, then a time --------------------- */
                <>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-heading text-text">Pick a day</h3>
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
                  </div>

                  <div className="lp-hairline" aria-hidden />

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-heading text-text">Pick a time</h3>
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
                        // Distinguish a clinic that is CLOSED that weekday from
                        // one that is open but fully booked.
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
                        <ul
                          data-lenis-prevent
                          className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
                        >
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
                                    'h-11 w-full rounded-lg border px-4 text-body font-medium tabular-nums',
                                    'duration-fast ease-standard transition-[background-color,border-color,color]',
                                    'focus-visible:outline-focus focus-visible:outline-2 focus-visible:-outline-offset-2',
                                    'active:scale-[0.99] motion-reduce:active:scale-100',
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
                  </div>
                </>
              ) : (
                /* Step 3: your details ------------------------------------ */
                <div ref={detailsRef} tabIndex={-1} className="flex flex-col gap-5 outline-none">
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSlot(null)
                        setSlotError(null)
                      }}
                    >
                      <ChevronLeft aria-hidden className="size-4" />
                      Back to times
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <h3 className="text-heading text-text">Your details</h3>
                    <p className="text-body text-text-muted">
                      {date
                        ? `For ${longDayLabel(date)} at ${formatTime(slot)}. `
                        : ''}
                      We only need a name and a phone number to hold the appointment.
                    </p>
                  </div>

                  <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
                      hint="A short note helps the clinic prepare. For example: knee pain for three weeks."
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

                    <div className="flex flex-col gap-3">
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        loading={booking.isPending}
                        className="w-full"
                      >
                        Confirm booking
                      </Button>
                      <p className="text-caption text-text-subtle">
                        Requesting an appointment does not charge you anything. The clinic will
                        confirm by phone.
                      </p>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Left panel — clinic identity + live selection                             */
/* -------------------------------------------------------------------------- */

/**
 * The "what am I booking" anchor. On desktop it is the card's left column; on
 * mobile it collapses to a compact strip above the steps (meta rows condense
 * into one caption line). Every fact comes from the public clinic settings;
 * missing data degrades row by row.
 */
function ClinicPanel({
  clinic,
  minutes,
  selection,
}: {
  clinic: ClinicSettingsResponse | undefined
  minutes: number | null
  selection: Selection | null
}) {
  const clinicName = clinic?.clinic_name ?? 'OrthoClinic'
  const address = [clinic?.address, clinic?.city].filter(Boolean).join(', ')
  const compactMeta = [minutes !== null ? `${minutes} min` : null, address || null]
    .filter(Boolean)
    .join(' · ')

  return (
    <aside className="border-border bg-bg-sunken/50 flex flex-col gap-4 border-b p-5 sm:p-6 md:gap-6 md:border-r md:border-b-0 md:p-8">
      <div className="flex items-center gap-3.5 md:flex-col md:items-start md:gap-5">
        <span
          aria-hidden
          className="lp-serif bg-accent-muted grid size-11 shrink-0 place-items-center rounded-xl text-xl text-[color:var(--lp-accent)] md:size-12 md:text-2xl"
        >
          {monogram(clinicName)}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-caption text-text-muted">{clinicName}</p>
          <p className="lp-serif text-text text-[1.4rem] leading-tight md:text-[1.7rem]">
            In-clinic consultation
          </p>
        </div>
      </div>

      {/* Meta rows: desktop list, mobile one-liner. */}
      <ul className="hidden flex-col gap-3 md:flex">
        {minutes !== null && (
          <li className="flex items-start gap-2.5">
            <Clock
              aria-hidden
              strokeWidth={1.5}
              className="mt-0.5 size-4 shrink-0 text-[color:var(--lp-accent)]"
            />
            <span className="text-label text-text-muted">{minutes} min</span>
          </li>
        )}
        {address && (
          <li className="flex items-start gap-2.5">
            <MapPin
              aria-hidden
              strokeWidth={1.5}
              className="mt-0.5 size-4 shrink-0 text-[color:var(--lp-accent)]"
            />
            <span className="text-label text-text-muted">{address}</span>
          </li>
        )}
      </ul>
      {compactMeta && <p className="text-caption text-text-subtle md:hidden">{compactMeta}</p>}

      {/* Live mirror of the picked date + time. `aria-live` so screen reader
          users hear the pick land without hunting for this panel. */}
      <div aria-live="polite" className="md:mt-auto">
        {selection && (
          <div className="bg-accent-muted flex items-start gap-2.5 rounded-lg border border-[color:var(--lp-accent-line)] px-3.5 py-3">
            <CalendarDays
              aria-hidden
              strokeWidth={1.5}
              className="mt-0.5 size-4 shrink-0 text-[color:var(--lp-accent)]"
            />
            <div className="flex flex-col gap-0.5">
              <p className="text-label text-text font-medium">{longDayLabel(selection.date)}</p>
              <p className="text-caption text-text-muted tabular-nums">
                {formatTime(selection.startTime)}
                {selection.endTime ? ` – ${formatTime(selection.endTime)}` : ''}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

/** `"Mehta Ortho Care"` → `"MO"`; falls back to `"OC"` for empty names. */
function monogram(name: string): string {
  const words = name.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word))
  const letters = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
  return letters || 'OC'
}

/** `"16:00:00"`, `"16:30:00"` → 30. Null when either time is unparseable. */
function minutesBetween(start: string, end: string): number | null {
  const toMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})/.exec(value)
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2])
  }
  const a = toMinutes(start)
  const b = toMinutes(end)
  if (a === null || b === null) return null
  const diff = b - a
  return diff > 0 ? diff : null
}

function SlotSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, index) => (
        <li
          key={index}
          className="bg-surface-hover h-11 w-full animate-pulse rounded-lg motion-reduce:animate-none"
        />
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Confirmation — replaces the right panel; the identity panel stays          */
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
    <div ref={ref} tabIndex={-1} aria-live="polite" className="flex flex-col gap-6 outline-none">
      <span
        aria-hidden
        className="bg-success-muted text-success grid size-12 place-items-center rounded-full [&_svg]:size-6"
      >
        <CheckCircle2 />
      </span>

      <div className="flex flex-col gap-2">
        <h3 className="text-title text-text">Your appointment is requested</h3>
        <p className="text-body text-text-muted leading-relaxed">
          We have held this time for you. Nothing else is needed from you right now. The clinic
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
        <Button variant="secondary" size="lg" className="rounded-full" onClick={onBookAnother}>
          Book another time
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

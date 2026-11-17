import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { UserPlus, X } from 'lucide-react'
import type {
  AppointmentVitals,
  PatientSearchResult,
  WeeklyAvailabilityResponse,
} from '@/api/schema'
import { toApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Select } from '@/components/ui/Controls'
import { DateField } from '@/components/ui/DateField'
import { DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatDate, formatTime, fullName, todayIso } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAvailableSlots, useBookAppointment, usePatientSearch } from './queries'
import { DAY_LABEL, dayOfWeekFor, hhmm, hoursForDate } from './model'
import {
  BLANK_NEW_PATIENT,
  newPatientIssues,
  seedFromQuery,
  toInlinePatient,
  type NewPatientValues,
} from './newPatient'

/**
 * Mirrors `AppointmentCreateRequest`'s declared bounds so a 422 is never the
 * first the doctor hears of a problem. The staff route takes exactly one of
 * `patient_id` (someone on file) or an inline `patient` (a new walk-in), so
 * `mode` decides which half of the form is validated.
 *
 * Vitals are held as text so a half-typed number never fights the keyboard;
 * each one is optional, and blank means "not measured", never zero.
 */
const schema = z
  .object({
    mode: z.enum(['existing', 'new']),
    patient_id: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    phone: z.string(),
    gender: z.enum(['', 'male', 'female', 'other']),
    age_years: z.string(),
    age_months: z.string(),
    appointment_date: z.string().min(1, 'Pick a date'),
    // Assigned from the clicked slot or the day's first free time; never typed.
    start_time: z.string(),
    vitals_bp: z.string().trim().max(32, 'Keep it under 32 characters'),
    vitals_spo2: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) >= 0 && Number(v) <= 100), '0–100'),
    vitals_pulse_bpm: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d{2,3}$/.test(v) && Number(v) >= 20 && Number(v) <= 300), '20–300'),
    vitals_height_cm: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= 300),
        '0–300 cm',
      ),
    vitals_weight_kg: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= 500),
        '0–500 kg',
      ),
    reason: z.string().max(512, 'Keep the reason under 512 characters').optional(),
    notes: z.string().max(1024, 'Keep notes under 1024 characters').optional(),
  })
  .superRefine((v, ctx) => {
    const issues: Record<string, string | undefined> =
      v.mode === 'new'
        ? newPatientIssues(v)
        : { patient_id: v.patient_id ? undefined : 'Choose who this appointment is for' }
    for (const [path, message] of Object.entries(issues)) {
      if (message) ctx.addIssue({ code: 'custom', path: [path], message })
    }
  })

type FormValues = z.infer<typeof schema>

const BLANK_FORM = {
  mode: 'existing',
  patient_id: '',
  ...BLANK_NEW_PATIENT,
  vitals_bp: '',
  vitals_spo2: '',
  vitals_pulse_bpm: '',
  vitals_height_cm: '',
  vitals_weight_kg: '',
  reason: '',
  notes: '',
} as const satisfies Partial<FormValues>

/** Server error path -> form field. The DOB is typed as an age, so it lands there. */
const SERVER_FIELD: Record<string, keyof FormValues> = {
  patient_id: 'patient_id',
  'patient.first_name': 'first_name',
  'patient.last_name': 'last_name',
  'patient.phone': 'phone',
  'patient.gender': 'gender',
  'patient.date_of_birth': 'age_years',
  appointment_date: 'appointment_date',
  start_time: 'start_time',
  vitals_bp: 'vitals_bp',
  vitals_spo2: 'vitals_spo2',
  vitals_pulse_bpm: 'vitals_pulse_bpm',
  vitals_height_cm: 'vitals_height_cm',
  vitals_weight_kg: 'vitals_weight_kg',
  reason: 'reason',
  notes: 'notes',
}

/** Blank text is "not measured" and is omitted; zero is a real value. */
function optionalText(value: string): string | undefined {
  const text = value.trim()
  return text === '' ? undefined : text
}

function optionalNumber(value: string): number | undefined {
  const text = value.trim()
  return text === '' ? undefined : Number(text)
}

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
  const [patient, setPatient] = useState<PatientSearchResult | null>(null)
  const [patientQuery, setPatientQuery] = useState('')
  const [slotError, setSlotError] = useState<string | null>(null)
  const debouncedQuery = useDebouncedValue(patientQuery, 200)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    setFocus,
    clearErrors,
    control,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      ...BLANK_FORM,
      appointment_date: initialDate,
      start_time: initialStartTime ?? '',
    },
  })

  const date = watch('appointment_date')
  const startTime = watch('start_time')
  const adding = watch('mode') === 'new'

  const startNewPatient = () => {
    const seeded = getValues('first_name') || getValues('last_name') || getValues('phone')
    if (!seeded) {
      for (const [k, v] of Object.entries(seedFromQuery(patientQuery))) {
        setValue(k as keyof NewPatientValues, v)
      }
    }
    setPatient(null)
    setValue('patient_id', '')
    clearErrors('patient_id')
    setValue('mode', 'new')
    // Moving focus out of the popover is what closes it.
    requestAnimationFrame(() => setFocus('first_name'))
  }

  const cancelNewPatient = () => {
    for (const [k, v] of Object.entries(BLANK_NEW_PATIENT)) setValue(k as keyof NewPatientValues, v)
    setValue('mode', 'existing')
    setFocus('patient_id')
  }

  // Re-open is a fresh booking: nothing from the last one should linger.
  useEffect(() => {
    if (!open) return
    reset({ ...BLANK_FORM, appointment_date: initialDate, start_time: initialStartTime ?? '' })
    setPatient(null)
    setPatientQuery('')
    setSlotError(null)
  }, [open, initialDate, initialStartTime, reset])

  const patients = usePatientSearch(open ? debouncedQuery : '')
  const slots = useAvailableSlots(open && date ? date : null)

  const book = useBookAppointment()

  const hours = hoursForDate(availability, date)
  const day = dayOfWeekFor(date)
  const freeSlots = slots.data ?? []
  const slotsPending = slots.isPending
  const closed = Boolean(day) && hours.length === 0
  /**
   * The time the booking will use: the slot the doctor clicked, or the first
   * free half hour on the chosen day. The picker is gone, but a time is still
   * part of the record — and deriving it here means the current API keeps
   * working while the server gains the option to choose for itself.
   */
  const assignedTime = startTime || freeSlots[0]?.start_time || null

  const onSubmit = handleSubmit((values) => {
    if (!assignedTime) {
      setSlotError('No free time is left on this day. Choose another date.')
      return
    }

    const vitals: AppointmentVitals = {}
    const bp = optionalText(values.vitals_bp)
    if (bp !== undefined) vitals.vitals_bp = bp
    const spo2 = optionalNumber(values.vitals_spo2)
    if (spo2 !== undefined) vitals.vitals_spo2 = spo2
    const pulse = optionalNumber(values.vitals_pulse_bpm)
    if (pulse !== undefined) vitals.vitals_pulse_bpm = pulse
    const height = optionalNumber(values.vitals_height_cm)
    if (height !== undefined) vitals.vitals_height_cm = height
    const weight = optionalNumber(values.vitals_weight_kg)
    if (weight !== undefined) vitals.vitals_weight_kg = weight

    book.mutate(
      {
        ...(values.mode === 'new'
          ? { patient: toInlinePatient(values) }
          : { patient_id: values.patient_id }),
        appointment_date: values.appointment_date,
        // The API accepts HH:MM and emits HH:MM:SS; send the short form.
        start_time: hhmm(assignedTime),
        ...vitals,
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
            let matched = false
            for (const [path, message] of Object.entries(e.fieldErrors())) {
              const field = SERVER_FIELD[path]
              if (field) {
                setError(field, { message })
                matched = true
              }
            }
            const timeMessage = e.fieldErrors().start_time
            if (timeMessage) {
              matched = true
              setSlotError(timeMessage)
            }
            if (!matched) toast.error(e.message)
            return
          }

          if (e.isConflict) {
            // 409 here means our chosen half hour went while the form was open.
            // Refresh the list and let the next press take the new first slot.
            void slots.refetch()
            setValue('start_time', '')
            setSlotError(
              'That time was taken while this form was open. We have refreshed the free times — press Book appointment again.',
            )
            return
          }

          if (e.status === 400 && /availability|clinic/i.test(e.message)) {
            setSlotError(
              `That time is outside the clinic's hours for ${day ? DAY_LABEL[day] : 'this day'}. Choose another date.`,
            )
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
              /* With a date but no free time there is nothing to book; with no
                 date at all the press is what surfaces "Pick a date". */
              disabled={Boolean(date) && !assignedTime}
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
                  setValue('mode', 'existing')
                  setValue('patient_id', item.id, { shouldValidate: true })
                }}
                query={patientQuery}
                onQueryChange={setPatientQuery}
                items={patients.data ?? []}
                loading={patients.isFetching}
                getKey={(item) => item.id}
                getLabel={(item) => `${fullName(item.first_name, item.last_name)} · ${item.phone}`}
                placeholder={adding ? 'New patient — filling in below' : 'Search by name or phone…'}
                searchPlaceholder="Name or phone…"
                emptyMessage={
                  patientQuery.trim().length === 0
                    ? 'Type a name or phone number'
                    : `No patient matches “${patientQuery.trim()}”`
                }
                footer={
                  <button
                    type="button"
                    onClick={startNewPatient}
                    className={cn(
                      'flex min-h-tap w-full items-center gap-2 rounded-md px-2 text-left text-body lg:min-h-0 lg:py-1.5',
                      'text-text transition-colors duration-instant ease-standard',
                      'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
                    )}
                  >
                    <UserPlus aria-hidden className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      Add new patient
                      {patientQuery.trim() && (
                        <span className="text-text-subtle"> — “{patientQuery.trim()}”</span>
                      )}
                    </span>
                  </button>
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

          {adding && (
            <NewPatientFields
              register={register}
              control={control}
              errors={errors}
              onCancel={cancelNewPatient}
            />
          )}

          <Field label="Date" required error={errors.appointment_date?.message}>
            {(a) => (
              <DateField
                id={a.id}
                aria-describedby={a['aria-describedby']}
                invalid={Boolean(errors.appointment_date)}
                value={date}
                min={todayIso()}
                className="w-48"
                onChange={(next) => {
                  setValue('appointment_date', next, { shouldValidate: true })
                  setValue('start_time', '', { shouldValidate: false })
                  setSlotError(null)
                }}
              />
            )}
          </Field>

          {/* The time picker is gone, but a time is still on the record. This
              line says which one, so "9:30" in the day view is never a
              surprise. */}
          {date && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg-sunken/60 px-3 py-2">
              {slotsPending ? (
                <p className="text-caption text-text-muted">Finding the next free time…</p>
              ) : closed ? (
                <>
                  <p className="text-caption text-text-muted">
                    The clinic is closed on {day ? `${DAY_LABEL[day]}s` : 'this day'}. Choose
                    another date.
                  </p>
                  {canManageHours && (
                    <Button variant="secondary" size="sm" onClick={onOpenHours}>
                      Set clinic hours
                    </Button>
                  )}
                </>
              ) : assignedTime ? (
                <p className="text-caption text-text-muted">
                  This will be booked for{' '}
                  <span className="font-medium text-text">{formatTime(assignedTime)}</span>
                  {startTime ? ' — the time you picked.' : ' — the next free time that day.'}
                </p>
              ) : (
                <p className="text-caption text-text-muted">
                  Every time on {formatDate(date)} is taken. Choose another date.
                </p>
              )}

              {slotError && (
                <p role="alert" className="text-caption font-medium text-danger">
                  {slotError}
                </p>
              )}
            </div>
          )}

          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-label font-medium text-text">
              Vitals at booking
              <span className="ml-1.5 text-caption font-normal text-text-subtle">optional</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="BP" optionalLabel error={errors.vitals_bp?.message}>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_bp')}
                    placeholder="120/80"
                    maxLength={32}
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="SpO₂ (%)" optionalLabel error={errors.vitals_spo2?.message}>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_spo2')}
                    inputMode="numeric"
                    placeholder="98"
                    maxLength={3}
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="HR (bpm)" optionalLabel error={errors.vitals_pulse_bpm?.message}>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_pulse_bpm')}
                    inputMode="numeric"
                    placeholder="76"
                    maxLength={3}
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Height (cm)" optionalLabel error={errors.vitals_height_cm?.message}>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_height_cm')}
                    inputMode="decimal"
                    placeholder="170"
                    maxLength={6}
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Weight (kg)" optionalLabel error={errors.vitals_weight_kg?.message}>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_weight_kg')}
                    inputMode="decimal"
                    placeholder="72.5"
                    maxLength={6}
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
          </fieldset>

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

type FormErrors = ReturnType<typeof useForm<FormValues>>['formState']['errors']

const UNSET = '__unset__'

/** Name, phone, sex and age — the phone is the only one the API used to demand. */
function NewPatientFields({
  register,
  control,
  errors,
  onCancel,
}: {
  register: ReturnType<typeof useForm<FormValues>>['register']
  control: ReturnType<typeof useForm<FormValues>>['control']
  errors: FormErrors
  onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-muted/40 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <UserPlus aria-hidden className="size-4 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-label font-medium text-text">
          New patient
          <span className="ml-2 text-caption font-normal text-text-muted">
            Created with the booking. A matching phone — or name and date of birth — reuses the
            record on file.
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel new patient"
          onClick={onCancel}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" required error={errors.first_name?.message}>
          {(a) => <Input {...a} {...register('first_name')} maxLength={64} autoComplete="off" />}
        </Field>
        <Field label="Last name" required error={errors.last_name?.message}>
          {(a) => <Input {...a} {...register('last_name')} maxLength={64} autoComplete="off" />}
        </Field>
        <Field
          label="Phone"
          optionalLabel
          hint="Optional. A returning patient can still be found by name."
          error={errors.phone?.message}
        >
          {(a) => (
            <Input
              {...a}
              {...register('phone')}
              maxLength={20}
              inputMode="tel"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Sex" optionalLabel error={errors.gender?.message}>
          {(a) => (
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select
                  id={a.id}
                  aria-describedby={a['aria-describedby']}
                  aria-invalid={a['aria-invalid']}
                  placeholder="Not recorded"
                  value={field.value === '' ? UNSET : field.value}
                  onChange={(v) => field.onChange(v === UNSET ? '' : v)}
                  options={[
                    { value: UNSET, label: 'Not recorded' },
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              )}
            />
          )}
        </Field>
        <Field
          label="Age"
          optionalLabel
          error={errors.age_years?.message ?? errors.age_months?.message}
          className="sm:col-span-2"
        >
          {(a) => (
            <div className="flex gap-2">
              <Input
                {...a}
                {...register('age_years')}
                inputMode="numeric"
                maxLength={3}
                autoComplete="off"
                slotRight={<span className="text-caption">yrs</span>}
                className="w-28"
              />
              <Input
                aria-label="Age, months"
                aria-invalid={errors.age_months ? true : undefined}
                {...register('age_months')}
                inputMode="numeric"
                maxLength={2}
                autoComplete="off"
                slotRight={<span className="text-caption">mos</span>}
                className="w-28"
              />
            </div>
          )}
        </Field>
      </div>
    </div>
  )
}


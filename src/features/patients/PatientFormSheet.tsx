/**
 * The one patient form, in a right-hand sheet, for both create and edit.
 *
 * The zod schema mirrors `PatientCreateRequest` / `PatientUpdateRequest`
 * exactly (see docs/API_NOTES.md §3), so the server should never be the first
 * thing to tell the doctor a field is wrong. When a 422 arrives anyway it is
 * mapped back onto the fields with `setError` rather than thrown at a toast.
 *
 * The one error the client cannot pre-empt is the 409 on a duplicate phone
 * number: only the server knows who else is already in the book. That case is
 * turned into a link to the existing patient, because that is almost always
 * who the doctor was looking for.
 */

import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowRight, Users } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { GENDERS, BLOOD_GROUPS } from '@/api/schema'
import type { PatientCreateRequest, PatientResponse } from '@/api/schema'
import { todayIso } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Controls'
import { conflictingPatientId, useCreatePatient, useUpdatePatient } from './api'
import { TagInput } from './TagInput'
import {
  hasMeasurements,
  readVitals,
  sameMeasurements,
  writeVitals,
  type Vitals,
  type VitalsMeasurements,
} from './vitals'

/* -------------------------------------------------------------------------- */
/* Schema — every bound below is transcribed from the OpenAPI document        */
/* -------------------------------------------------------------------------- */

/** Radix Select cannot hold an empty-string item, so "not recorded" needs a sentinel. */
const UNSET = '__unset__'

const name = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(64, 'Use 64 characters or fewer')

const schema = z.object({
  first_name: name,
  last_name: name,
  phone: z
    .string()
    .trim()
    .min(6, 'A phone number needs at least 6 characters')
    .max(20, 'Use 20 characters or fewer'),
  date_of_birth: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use the date picker')
    .refine((v) => v === '' || v <= todayIso(), 'A date of birth cannot be in the future')
    .refine((v) => v === '' || v >= '1900-01-01', 'That date is too far back'),
  gender: z.enum(['', 'male', 'female', 'other']),
  email: z.union([z.literal(''), z.email('Enter a valid email address')]),
  city: z.string().trim().max(128, 'Use 128 characters or fewer'),
  address: z.string().trim().max(512, 'Use 512 characters or fewer'),
  blood_group: z.string().trim().max(8, 'Use 8 characters or fewer'),
  allergies: z.array(z.string().trim().min(1)),
  // Vitals are kept as strings in the form and converted on submit, so a
  // half-typed number never fights the keyboard. All optional.
  vitals_bp: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{2,3}\s*\/\s*\d{2,3}$/.test(v), 'Systolic/diastolic, like 120/80'),
  vitals_weight: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d{1,3}(\.\d)?$/.test(v) && Number(v) >= 1 && Number(v) <= 300),
      'Between 1 and 300 kg, one decimal at most',
    ),
  vitals_spo2: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d{2,3}$/.test(v) && Number(v) >= 70 && Number(v) <= 100),
      'A whole number from 70 to 100',
    ),
  vitals_pulse: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d{2,3}$/.test(v) && Number(v) >= 30 && Number(v) <= 250),
      'A whole number from 30 to 250',
    ),
})

type FormValues = z.infer<typeof schema>

/** The form paths a server 422 is allowed to land on. */
const FIELD_KEYS = [
  'first_name',
  'last_name',
  'phone',
  'date_of_birth',
  'gender',
  'email',
  'city',
  'address',
  'blood_group',
  'allergies',
] as const

type FieldKey = (typeof FIELD_KEYS)[number]

function isFieldKey(key: string): key is FieldKey {
  return (FIELD_KEYS as readonly string[]).includes(key)
}

const BLANK: FormValues = {
  first_name: '',
  last_name: '',
  phone: '',
  date_of_birth: '',
  gender: '',
  email: '',
  city: '',
  address: '',
  blood_group: '',
  allergies: [],
  vitals_bp: '',
  vitals_weight: '',
  vitals_spo2: '',
  vitals_pulse: '',
}

/** The form's vitals strings, as the numbers/normalised text that get stored. */
function measurementsFromValues(values: FormValues): VitalsMeasurements {
  const out: VitalsMeasurements = {}
  if (values.vitals_bp) out.bp = values.vitals_bp.replace(/\s+/g, '')
  if (values.vitals_weight) out.weight_kg = Number(values.vitals_weight)
  if (values.vitals_spo2) out.spo2 = Number(values.vitals_spo2)
  if (values.vitals_pulse) out.pulse_bpm = Number(values.vitals_pulse)
  return out
}

/**
 * Every optional field goes to the API as `null` when empty, never as `""`.
 *
 * `medical_history` is rebuilt from the record being edited so that every key
 * it already holds survives; only the namespaced `vitals` block is replaced.
 * `recorded_at` moves to today only when a measurement was entered or changed —
 * re-saving untouched vitals keeps the date they were actually taken.
 */
function toPayload(values: FormValues, existing?: PatientResponse): PatientCreateRequest {
  const history = existing?.medical_history ?? null
  const prior = readVitals(history)
  const next = measurementsFromValues(values)

  const vitals: Vitals = hasMeasurements(next)
    ? {
        ...next,
        recorded_at: sameMeasurements(next, prior)
          ? (prior.recorded_at ?? todayIso())
          : todayIso(),
      }
    : {}

  return {
    first_name: values.first_name,
    last_name: values.last_name,
    phone: values.phone,
    date_of_birth: values.date_of_birth || null,
    gender: values.gender === '' ? null : values.gender,
    email: values.email || null,
    address: values.address || null,
    city: values.city || null,
    blood_group: values.blood_group || null,
    allergies: values.allergies,
    medical_history: writeVitals(history, vitals),
  }
}

function fromPatient(patient: PatientResponse): FormValues {
  const vitals = readVitals(patient.medical_history)
  return {
    first_name: patient.first_name,
    last_name: patient.last_name,
    phone: patient.phone,
    date_of_birth: patient.date_of_birth ?? '',
    gender: patient.gender ?? '',
    email: patient.email ?? '',
    city: patient.city ?? '',
    address: patient.address ?? '',
    blood_group: patient.blood_group ?? '',
    allergies: Array.isArray(patient.allergies) ? patient.allergies : [],
    vitals_bp: vitals.bp ?? '',
    vitals_weight: vitals.weight_kg !== undefined ? String(vitals.weight_kg) : '',
    vitals_spo2: vitals.spo2 !== undefined ? String(vitals.spo2) : '',
    vitals_pulse: vitals.pulse_bpm !== undefined ? String(vitals.pulse_bpm) : '',
  }
}

/**
 * "No match for 9876543210 — add them" should not make the doctor retype it.
 * A query of digits is a phone number; anything else is a name.
 */
function fromQuery(query: string): FormValues {
  const q = query.trim()
  if (!q) return BLANK
  if (/^[\d\s+()-]+$/.test(q)) return { ...BLANK, phone: q.slice(0, 20) }
  const [first, ...rest] = q.split(/\s+/)
  return {
    ...BLANK,
    first_name: (first ?? '').slice(0, 64),
    last_name: rest.join(' ').slice(0, 64),
  }
}

/* -------------------------------------------------------------------------- */
/* Sheet                                                                      */
/* -------------------------------------------------------------------------- */

export interface PatientFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit to create. Pass the record to edit. */
  patient?: PatientResponse
  /**
   * Seed a new patient from the text that found nothing. A plain string rather
   * than an object so its identity is stable across the parent's renders.
   */
  prefillQuery?: string
  onSaved?: (patient: PatientResponse) => void
}

export function PatientFormSheet({
  open,
  onOpenChange,
  patient,
  prefillQuery = '',
  onSaved,
}: PatientFormSheetProps) {
  const formId = useId()
  const editing = patient !== undefined
  const [duplicateId, setDuplicateId] = useState<string | null>(null)

  const defaults = useMemo(
    () => (patient ? fromPatient(patient) : fromQuery(prefillQuery)),
    [patient, prefillQuery],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  // The sheet stays mounted so it can animate out, so the form is reset each
  // time it opens rather than on mount.
  useEffect(() => {
    if (open) {
      reset(defaults)
      setDuplicateId(null)
    }
  }, [open, defaults, reset])

  const create = useCreatePatient()
  const update = useUpdatePatient(patient?.id ?? '')
  const saving = editing ? update.isPending : create.isPending

  function applyError(error: unknown) {
    if (!(error instanceof ApiError)) {
      toast.error('Could not save the patient.')
      return
    }

    if (error.isValidation) {
      const fields = error.fieldErrors()
      let matched = false
      for (const [path, message] of Object.entries(fields)) {
        if (!isFieldKey(path)) continue
        setError(path, { message }, { shouldFocus: !matched })
        matched = true
      }
      // A validation error with nowhere to land must still be visible.
      if (!matched) toast.error(error.message)
      return
    }

    if (error.isConflict) {
      setDuplicateId(conflictingPatientId(error.message))
      setError(
        'phone',
        { message: 'Another patient is already registered with this number.' },
        { shouldFocus: true },
      )
      return
    }

    toast.error(error.message)
  }

  function onSubmit(values: FormValues) {
    setDuplicateId(null)
    const payload = toPayload(values, patient)
    const handlers = {
      onSuccess: (saved: PatientResponse) => {
        toast.success(editing ? 'Patient updated' : `${saved.first_name} ${saved.last_name} added`)
        onOpenChange(false)
        onSaved?.(saved)
      },
      onError: applyError,
    }
    if (editing) update.mutate(payload, handlers)
    else create.mutate(payload, handlers)
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        width="max-w-lg"
        title={editing ? 'Edit patient' : 'New patient'}
        description={
          editing
            ? 'Changes apply to every past prescription that reads from this record.'
            : 'Name and a phone number are enough to start; the rest can wait.'
        }
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              loading={saving}
              disabled={editing && !isDirty}
            >
              {editing ? 'Save changes' : 'Add patient'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {duplicateId && (
            <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning-muted p-3">
              <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-caption text-text">
                  That phone number already belongs to a patient in the book.
                </p>
                <Link
                  to={`/patients/${duplicateId}`}
                  onClick={() => onOpenChange(false)}
                  className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-accent underline-offset-4 hover:underline"
                >
                  Open that patient
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.first_name?.message} required>
              {(a) => (
                <Input {...a} {...register('first_name')} maxLength={64} autoComplete="given-name" />
              )}
            </Field>

            <Field label="Last name" error={errors.last_name?.message} required>
              {(a) => (
                <Input {...a} {...register('last_name')} maxLength={64} autoComplete="family-name" />
              )}
            </Field>
          </div>

          <Field
            label="Phone"
            hint="How the clinic reaches them, and how you will find them again."
            error={errors.phone?.message}
            required
          >
            {(a) => (
              <Input
                {...a}
                {...register('phone')}
                type="tel"
                inputMode="tel"
                maxLength={20}
                autoComplete="tel"
                className="font-mono"
              />
            )}
          </Field>

          <Field
            label="Allergies"
            hint="Shown as a warning on every screen that touches this patient."
            error={errors.allergies?.message}
            optionalLabel
          >
            {(a) => (
              <Controller
                control={control}
                name="allergies"
                render={({ field }) => (
                  <TagInput
                    id={a.id}
                    describedBy={a['aria-describedby']}
                    invalid={a['aria-invalid']}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" error={errors.date_of_birth?.message} optionalLabel>
              {(a) => (
                <Input {...a} {...register('date_of_birth')} type="date" max={todayIso()} />
              )}
            </Field>

            {/* Visible label is "Sex"; the API field stays `gender`. */}
            <Field label="Sex" error={errors.gender?.message} optionalLabel>
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
                        ...GENDERS.map((g) => ({
                          value: g,
                          label: g.charAt(0).toUpperCase() + g.slice(1),
                        })),
                      ]}
                    />
                  )}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Blood group" error={errors.blood_group?.message} optionalLabel>
              {(a) => (
                <Controller
                  control={control}
                  name="blood_group"
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
                        ...BLOOD_GROUPS.map((g) => ({ value: g, label: g })),
                      ]}
                    />
                  )}
                />
              )}
            </Field>

            <Field label="City" error={errors.city?.message} optionalLabel>
              {(a) => (
                <Input {...a} {...register('city')} maxLength={128} autoComplete="address-level2" />
              )}
            </Field>
          </div>

          <Field label="Address" error={errors.address?.message} optionalLabel>
            {(a) => (
              <Textarea {...a} {...register('address')} maxLength={512} rows={2} autoComplete="street-address" />
            )}
          </Field>

          <Field label="Email" error={errors.email?.message} optionalLabel>
            {(a) => (
              <Input {...a} {...register('email')} type="email" maxLength={255} autoComplete="email" />
            )}
          </Field>

          {/* Vitals — stored under medical_history.vitals, see ./vitals.ts.
              Large inputs on purpose: these are typed mid-consultation. */}
          <section className="mt-1 flex flex-col gap-4 border-t border-border pt-4">
            <div>
              <h3 className="text-heading font-semibold text-text">Vitals</h3>
              <p className="mt-0.5 text-caption text-text-muted">
                All optional. The recorded date updates whenever a value is entered or changed.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Blood pressure" error={errors.vitals_bp?.message} optionalLabel>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_bp')}
                    inputSize="lg"
                    placeholder="120/80"
                    maxLength={9}
                    data-numeric
                    className="pr-16"
                    slotRight={<span className="text-caption">mmHg</span>}
                  />
                )}
              </Field>

              <Field label="Weight" error={errors.vitals_weight?.message} optionalLabel>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_weight')}
                    inputSize="lg"
                    inputMode="decimal"
                    placeholder="72.5"
                    maxLength={5}
                    data-numeric
                    className="pr-10"
                    slotRight={<span className="text-caption">kg</span>}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SpO2" error={errors.vitals_spo2?.message} optionalLabel>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_spo2')}
                    inputSize="lg"
                    inputMode="numeric"
                    placeholder="98"
                    maxLength={3}
                    data-numeric
                    slotRight={<span className="text-caption">%</span>}
                  />
                )}
              </Field>

              <Field label="Pulse" error={errors.vitals_pulse?.message} optionalLabel>
                {(a) => (
                  <Input
                    {...a}
                    {...register('vitals_pulse')}
                    inputSize="lg"
                    inputMode="numeric"
                    placeholder="76"
                    maxLength={3}
                    data-numeric
                    className="pr-12"
                    slotRight={<span className="text-caption">bpm</span>}
                  />
                )}
              </Field>
            </div>
          </section>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

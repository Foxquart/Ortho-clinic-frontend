import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { toApiError } from '@/api/errors'
import { cn } from '@/lib/cn'
import { humanizeEnum } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Controls'
import { MEDICINE_DOSAGE_FORMS } from '@/api/schema'
import type {
  MedicineCreateRequest,
  MedicineDosageForm,
  MedicineResponse,
  MedicineUpdateRequest,
} from '@/api/schema'
import { useCreateMedicine, useUpdateMedicine } from './useMedicines'

/**
 * Food timing choices for the defaults section. `none` is the form's own
 * "no default" sentinel — it becomes an omitted/`null` field on the wire,
 * because a Radix Select cannot carry an empty-string value.
 */
const FOOD_TIMING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'before', label: 'Before food' },
  { value: 'after', label: 'After food' },
  { value: 'with', label: 'With food' },
] as const

type FoodTimingChoice = (typeof FOOD_TIMING_OPTIONS)[number]['value']

/**
 * The same one-tap frequencies the prescription pad offers, so the default a
 * medicine carries is written in the exact idiom the pad fills in. Implemented
 * locally on purpose — this sheet must not depend on the prescriptions feature.
 */
const FREQUENCY_PRESETS = [
  { value: '1-0-0', label: 'Morning' },
  { value: '1-0-1', label: 'Morning & night' },
  { value: '1-1-1', label: 'Thrice daily' },
  { value: '0-0-1', label: 'At night' },
  { value: 'SOS', label: 'As needed' },
] as const

/* Mirrors MedicineCreateRequest exactly: `name` is the only required field
   (1..128); everything else is optional with a declared upper bound. Getting
   these wrong means the doctor meets a server 422 the form could have caught. */
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter the medicine name')
    .max(128, 'Keep the name to 128 characters or fewer'),
  generic_name: z.string().trim().max(128, 'Keep this to 128 characters or fewer'),
  brand_name: z
    .string()
    .trim()
    .min(1, 'Enter the brand name')
    .max(128, 'Keep this to 128 characters or fewer'),
  dosage_form: z.enum(MEDICINE_DOSAGE_FORMS),
  strength: z.string().trim().max(32, 'Keep the strength to 32 characters or fewer'),
  category: z.string().trim().max(64, 'Keep the category to 64 characters or fewer'),
  manufacturer: z.string().trim().max(128, 'Keep this to 128 characters or fewer'),
  description: z.string().trim().max(2000, 'Keep the notes to 2000 characters or fewer'),
  default_dosage: z.string().trim().max(128, 'Keep the dose to 128 characters or fewer'),
  default_frequency: z.string().trim().max(64, 'Keep the frequency to 64 characters or fewer'),
  // Held as the input's own string so an emptied field means "no default"
  // rather than NaN; the API's 1..365 bound is enforced here, before a 422.
  default_duration_days: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), 'Days must be a whole number')
    .refine((value) => {
      if (value === '' || !/^\d+$/.test(value)) return true
      const days = Number(value)
      return days >= 1 && days <= 365
    }, 'Days must be between 1 and 365'),
  default_food_timing: z.enum(['none', 'before', 'after', 'with']),
  default_instructions: z
    .string()
    .trim()
    .max(1000, 'Keep the instructions to 1000 characters or fewer'),
})

type MedicineFormValues = z.infer<typeof schema>

const FIELD_KEYS = [
  'name',
  'generic_name',
  'brand_name',
  'dosage_form',
  'strength',
  'category',
  'manufacturer',
  'description',
  'default_dosage',
  'default_frequency',
  'default_duration_days',
  'default_food_timing',
  'default_instructions',
] as const

function isFieldKey(key: string): key is keyof MedicineFormValues {
  return (FIELD_KEYS as readonly string[]).includes(key)
}

const DOSAGE_FORM_OPTIONS = MEDICINE_DOSAGE_FORMS.map((form) => ({
  value: form,
  label: humanizeEnum(form),
}))

function emptyValues(name = ''): MedicineFormValues {
  return {
    name,
    generic_name: '',
    brand_name: '',
    // The server default. Sending `null` on create is a 422.
    dosage_form: 'tablet',
    strength: '',
    category: '',
    manufacturer: '',
    description: '',
    default_dosage: '',
    default_frequency: '',
    default_duration_days: '',
    default_food_timing: 'none',
    default_instructions: '',
  }
}

function valuesOf(medicine: MedicineResponse): MedicineFormValues {
  return {
    name: medicine.name,
    generic_name: medicine.generic_name ?? '',
    brand_name: medicine.brand_name ?? '',
    dosage_form: medicine.dosage_form,
    strength: medicine.strength ?? '',
    category: medicine.category ?? '',
    manufacturer: medicine.manufacturer ?? '',
    description: medicine.description ?? '',
    default_dosage: medicine.default_dosage ?? '',
    default_frequency: medicine.default_frequency ?? '',
    default_duration_days:
      medicine.default_duration_days == null ? '' : String(medicine.default_duration_days),
    default_food_timing: medicine.default_food_timing ?? 'none',
    default_instructions: medicine.default_instructions ?? '',
  }
}

/** `''` days or `'none'` timing means "no default" — omitted or cleared. */
function durationOf(values: MedicineFormValues): number | undefined {
  return values.default_duration_days.trim() === ''
    ? undefined
    : Number(values.default_duration_days.trim())
}

function foodTimingOf(values: MedicineFormValues): 'before' | 'after' | 'with' | undefined {
  return values.default_food_timing === 'none' ? undefined : values.default_food_timing
}

/** On create an empty optional field is omitted; on update it is sent as
 *  `null`, which is how you clear a value that was previously set. */
function createBody(values: MedicineFormValues): MedicineCreateRequest {
  const text = (value: string) => (value.trim() === '' ? undefined : value.trim())
  return {
    name: values.name.trim(),
    dosage_form: values.dosage_form,
    generic_name: text(values.generic_name),
    brand_name: text(values.brand_name),
    strength: text(values.strength),
    category: text(values.category),
    manufacturer: text(values.manufacturer),
    description: text(values.description),
    default_dosage: text(values.default_dosage),
    default_frequency: text(values.default_frequency),
    default_duration_days: durationOf(values),
    default_food_timing: foodTimingOf(values),
    default_instructions: text(values.default_instructions),
  }
}

function updateBody(values: MedicineFormValues): MedicineUpdateRequest {
  const text = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    name: values.name.trim(),
    dosage_form: values.dosage_form,
    generic_name: text(values.generic_name),
    brand_name: text(values.brand_name),
    strength: text(values.strength),
    category: text(values.category),
    manufacturer: text(values.manufacturer),
    description: text(values.description),
    // A cleared default is sent as `null` — that is how PATCH erases a value
    // that was previously set.
    default_dosage: text(values.default_dosage),
    default_frequency: text(values.default_frequency),
    default_duration_days: durationOf(values) ?? null,
    default_food_timing: foodTimingOf(values) ?? null,
    default_instructions: text(values.default_instructions),
  }
}

export interface MedicineSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates; a medicine edits it. */
  medicine: MedicineResponse | null
  /** Pre-fills the name when creating straight out of an empty search. */
  initialName?: string
}

export function MedicineSheet({ open, onOpenChange, medicine, initialName }: MedicineSheetProps) {
  const formId = useId()
  const create = useCreateMedicine()
  const update = useUpdateMedicine()
  const editing = medicine !== null

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<MedicineFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  // Re-seed every time the sheet opens, so a cancelled edit never leaks into
  // the next one.
  /**
   * Catalogue details live behind a disclosure: the doctor's add-a-drug flow is
   * Name -> defaults -> save. Auto-open when the medicine being edited already
   * carries any of them so nothing looks lost.
   */
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    reset(medicine ? valuesOf(medicine) : emptyValues(initialName))
    setMoreOpen(
      Boolean(
        medicine &&
          (medicine.generic_name ||
            medicine.brand_name ||
            medicine.category ||
            medicine.manufacturer ||
            medicine.description),
      ),
    )
  }, [open, medicine, initialName, reset])

  // A validation error on a collapsed field must never be invisible.
  const hiddenFieldError = Boolean(
    errors.generic_name ||
      errors.category ||
      errors.manufacturer ||
      errors.description,
  )
  useEffect(() => {
    if (hiddenFieldError) setMoreOpen(true)
  }, [hiddenFieldError])

  const pending = create.isPending || update.isPending

  const onError = (error: unknown) => {
    const apiError = toApiError(error)

    if (apiError.isValidation) {
      let first = true
      let matched = false
      for (const [path, message] of Object.entries(apiError.fieldErrors())) {
        if (!isFieldKey(path)) continue
        setError(path, { message }, { shouldFocus: first })
        first = false
        matched = true
      }
      if (matched) return
    }

    // A duplicate name is the one conflict this endpoint can raise; it belongs
    // on the field, not in a toast.
    if (apiError.isConflict) {
      setError('name', { message: apiError.message }, { shouldFocus: true })
      return
    }

    setError('root', { message: apiError.message })
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (medicine) {
        await update.mutateAsync({ id: medicine.id, body: updateBody(values) })
        toast.success(`${values.name.trim()} updated`)
      } else {
        await create.mutateAsync(createBody(values))
        toast.success(`${values.name.trim()} added to the formulary`)
      }
      onOpenChange(false)
    } catch (error) {
      onError(error)
    }
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        width="max-w-lg"
        title={editing ? 'Edit medicine' : 'Add medicine'}
        description={
          editing
            ? 'Changes apply everywhere this medicine is prescribed from.'
            : 'Adds an entry to the shared formulary.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              loading={pending}
              disabled={editing && !isDirty}
            >
              {editing ? 'Save changes' : 'Add medicine'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {errors.root?.message && (
            <p
              role="alert"
              className="border-danger/25 bg-danger-muted text-caption text-danger flex items-start gap-2 rounded-md border px-3 py-2"
            >
              <AlertTriangle aria-hidden className="mt-px size-4 shrink-0" />
              {errors.root.message}
            </p>
          )}

          <Field label="Name" error={errors.name?.message} required>
            {(a) => (
              <Input
                {...a}
                {...register('name')}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Paracetamol"
              />
            )}
          </Field>

          <Field
            label="Brand name"
            hint="What you actually write on the prescription."
            error={errors.brand_name?.message}
            required
          >
            {(a) => (
              <Input {...a} {...register('brand_name')} autoComplete="off" placeholder="Crocin" />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dosage form" error={errors.dosage_form?.message}>
              {(a) => (
                <Controller
                  control={control}
                  name="dosage_form"
                  render={({ field }) => (
                    <Select<MedicineDosageForm>
                      id={a.id}
                      aria-describedby={a['aria-describedby']}
                      aria-invalid={a['aria-invalid']}
                      value={field.value}
                      onChange={field.onChange}
                      options={DOSAGE_FORM_OPTIONS}
                    />
                  )}
                />
              )}
            </Field>

            <Field
              label="Strength"
              hint="As printed on the pack."
              error={errors.strength?.message}
              optionalLabel
            >
              {(a) => (
                <Input {...a} {...register('strength')} autoComplete="off" placeholder="500 mg" />
              )}
            </Field>
          </div>

          {/* ------------------------- Prescription defaults ------------------------ */}

          <section
            aria-labelledby={`${formId}-defaults`}
            className="border-border flex flex-col gap-4 border-t pt-4"
          >
            <div>
              <h3 id={`${formId}-defaults`} className="text-body text-text font-semibold">
                Prescription defaults
              </h3>
              <p className="text-caption text-text-muted mt-0.5">
                Filled into the pad automatically when you pick this medicine. Leave blank to
                decide per prescription.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default dose" error={errors.default_dosage?.message} optionalLabel>
                {(a) => (
                  <Input
                    {...a}
                    {...register('default_dosage')}
                    autoComplete="off"
                    placeholder="1 tab"
                  />
                )}
              </Field>

              <Field
                label="Default days"
                error={errors.default_duration_days?.message}
                optionalLabel
              >
                {(a) => (
                  <Input
                    {...a}
                    {...register('default_duration_days')}
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    placeholder="5"
                  />
                )}
              </Field>
            </div>

            <Field
              label="Default frequency"
              hint="Tap a preset or type your own. 1-0-1 means morning and night."
              error={errors.default_frequency?.message}
              optionalLabel
            >
              {(a) => (
                <Controller
                  control={control}
                  name="default_frequency"
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <Input
                        {...a}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                        onBlur={field.onBlur}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder='1-0-1, or "before bed"'
                      />
                      <div
                        role="group"
                        aria-label="Frequency presets"
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        {FREQUENCY_PRESETS.map((preset) => {
                          const active = field.value.trim() === preset.value
                          return (
                            <button
                              key={preset.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => field.onChange(active ? '' : preset.value)}
                              className={cn(
                                'text-label inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3',
                                'duration-instant ease-standard transition-colors',
                                'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none',
                                active
                                  ? 'border-accent/40 bg-accent-muted text-accent-muted-fg'
                                  : 'border-border bg-surface text-text-muted hover:border-accent hover:bg-accent-muted hover:text-accent-muted-fg',
                              )}
                            >
                              <span className="font-mono tabular-nums">{preset.value}</span>
                              <span>{preset.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Food timing" error={errors.default_food_timing?.message} optionalLabel>
                {(a) => (
                  <Controller
                    control={control}
                    name="default_food_timing"
                    render={({ field }) => (
                      <Select<FoodTimingChoice>
                        id={a.id}
                        aria-describedby={a['aria-describedby']}
                        aria-invalid={a['aria-invalid']}
                        value={field.value}
                        onChange={field.onChange}
                        options={FOOD_TIMING_OPTIONS}
                      />
                    )}
                  />
                )}
              </Field>
            </div>

            <Field
              label="Default instructions"
              error={errors.default_instructions?.message}
              optionalLabel
            >
              {(a) => (
                <Textarea
                  {...a}
                  {...register('default_instructions')}
                  rows={2}
                  maxLength={1000}
                  placeholder="With a full glass of water."
                />
              )}
            </Field>
          </section>

          {/* Catalogue details the doctor rarely needs while adding a drug.
              Collapsed so the sheet is Name -> defaults -> save; auto-open when
              editing a medicine that already carries any of these, or when the
              server complains about one. */}
          <section className="border-border border-t pt-3">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="text-label text-text-muted hover:text-text flex min-h-10 w-full items-center gap-2 font-medium transition-colors duration-fast"
            >
              <ChevronDown
                aria-hidden
                className={cn('size-4 transition-transform duration-fast', !moreOpen && '-rotate-90')}
              />
              More details
              <span className="text-caption text-text-subtle font-normal">
                generic, category, notes
              </span>
            </button>
            {moreOpen && (
              <div className="mt-3 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Generic name" error={errors.generic_name?.message} optionalLabel>
              {(a) => (
                <Input
                  {...a}
                  {...register('generic_name')}
                  autoComplete="off"
                  placeholder="Acetaminophen"
                />
              )}
            </Field>

          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" error={errors.category?.message} optionalLabel>
              {(a) => (
                <Input
                  {...a}
                  {...register('category')}
                  autoComplete="off"
                  placeholder="Analgesic"
                />
              )}
            </Field>

            <Field label="Manufacturer" error={errors.manufacturer?.message} optionalLabel>
              {(a) => (
                <Input
                  {...a}
                  {...register('manufacturer')}
                  autoComplete="off"
                  placeholder="Cipla"
                />
              )}
            </Field>
          </div>

          <Field label="Notes" error={errors.description?.message} optionalLabel>
            {(a) => (
              <Textarea
                {...a}
                {...register('description')}
                rows={3}
                placeholder="Cautions, usual indication, anything the pad should not forget."
              />
            )}
          </Field>
              </div>
            )}
          </section>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

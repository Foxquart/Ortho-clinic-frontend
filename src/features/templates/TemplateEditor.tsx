import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type FieldErrors,
  type FieldPath,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { toApiError } from '@/api/errors'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import {
  easeOutExpo,
  fadeOnly,
  fadeSlideUp,
  listItem,
  listStagger,
  springSoft,
  useReducedMotionSafe,
} from '@/lib/motion'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Select } from '@/components/ui/Controls'
import { ConfirmDialog, DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import type {
  AdvicePresetResponse,
  MedicineResponse,
  Page_MedicineResponse_,
  PrescriptionTemplateCreate,
  PrescriptionTemplateResponse,
} from '@/api/schema'
import { TPL_BN } from './bn'
import { useCreateTemplate, useUpdateTemplate } from './useTemplates'

/* -------------------------------------------------------------------------- */
/*  Form model                                                                */
/* -------------------------------------------------------------------------- */

const FOOD_OPTIONS = [
  { value: 'none', label: 'Not set' },
  { value: 'before', label: 'Before food' },
  { value: 'after', label: 'After food' },
  { value: 'with', label: 'With food' },
] as const

type FoodChoice = (typeof FOOD_OPTIONS)[number]['value']

/** The same one-tap frequencies the pad and the formulary sheet offer. */
const FREQUENCY_PRESETS = [
  { value: '1-0-0', label: 'Morning' },
  { value: '1-0-1', label: 'Morning & night' },
  { value: '1-1-1', label: 'Thrice daily' },
  { value: '0-0-1', label: 'At night' },
  { value: 'SOS', label: 'As needed' },
] as const

/* Numbers ride as the input's own string so an emptied field means "unset",
   not NaN. */
const wholeNumber = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), message)

/* Mirrors PrescriptionTemplateCreate: name 1..128; chief complaint and
   diagnosis <= 512; follow-up 0..365; each item needs a medicine and a
   frequency (1..64), days and quantity >= 1. */
const itemSchema = z.object({
  medicine_id: z.string().min(1, 'Choose a medicine'),
  // Display only: the server resolves the name again on every read.
  medicine_name: z.string(),
  frequency: z
    .string()
    .trim()
    .min(1, 'Enter how often')
    .max(64, 'Keep this to 64 characters or fewer'),
  duration_days: wholeNumber(1, 3650, 'Whole number, 1 or higher'),
  quantity: wholeNumber(1, 10000, 'Whole number, 1 or higher'),
  food_timing: z.enum(['none', 'before', 'after', 'with']),
  instructions: z.string().trim().max(2000, 'Keep this to 2000 characters or fewer'),
})

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name for this template')
    .max(128, 'Keep the name to 128 characters or fewer'),
  chief_complaint: z.string().trim().max(512, 'Keep this to 512 characters or fewer'),
  diagnosis: z.string().trim().max(512, 'Keep this to 512 characters or fewer'),
  examination_findings: z.string().trim(),
  extra_fields: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })),
  advice: z.string().trim(),
  investigations: z.string().trim(),
  procedure: z.string().trim(),
  consult: z.string().trim(),
  notes: z.string().trim(),
  follow_up_days: wholeNumber(0, 365, 'Enter 0 to 365 days'),
  items: z.array(itemSchema),
})

type TemplateFormValues = z.infer<typeof schema>
type ItemValues = TemplateFormValues['items'][number]

const FIELD_PATH =
  /^(name|chief_complaint|diagnosis|examination_findings|advice|investigations|procedure|consult|notes|follow_up_days|items\.\d+\.(medicine_id|frequency|duration_days|quantity|food_timing|instructions))$/

function isFieldPath(path: string): path is FieldPath<TemplateFormValues> {
  return FIELD_PATH.test(path)
}

const emptyItem = (): ItemValues => ({
  medicine_id: '',
  medicine_name: '',
  frequency: '',
  duration_days: '',
  quantity: '',
  food_timing: 'none',
  instructions: '',
})

/** Blank when `template` is null; otherwise a copy of it (renamed by the caller for "start from"). */
function valuesOf(
  template: PrescriptionTemplateResponse | null,
  name = template?.name ?? '',
): TemplateFormValues {
  return {
    name,
    chief_complaint: template?.chief_complaint ?? '',
    diagnosis: template?.diagnosis ?? '',
    examination_findings: template?.examination_findings ?? '',
    // Not editable here yet; carried through so a copy or an edit never drops them.
    extra_fields: template?.extra_fields ?? [],
    advice: template?.advice ?? '',
    investigations: template?.investigations ?? '',
    procedure: template?.procedure ?? '',
    consult: template?.consult ?? '',
    notes: template?.notes ?? '',
    follow_up_days: String(template?.follow_up_days ?? ''),
    items: (template?.items ?? []).map((item) => ({
      medicine_id: item.medicine_id,
      medicine_name: item.medicine_name ?? '',
      frequency: item.frequency,
      duration_days: String(item.duration_days ?? ''),
      quantity: String(item.quantity ?? ''),
      food_timing: item.food_timing ?? 'none',
      instructions: item.instructions ?? '',
    })),
  }
}

/** "Start from": a copy of `source` named "<name> (copy)"; blank when `source` is null. */
const copyOf = (source: PrescriptionTemplateResponse | null) =>
  valuesOf(source, source ? `${source.name} (copy)` : '')

const orNull = (value: string) => (value === '' ? null : value)
const numberOrNull = (value: string) => (value === '' ? null : Number(value))

/** `null` clears a field on PATCH and is a plain "unset" on POST, so one body serves both. */
function bodyOf(
  values: TemplateFormValues,
  before: PrescriptionTemplateResponse | null,
): PrescriptionTemplateCreate {
  const body: PrescriptionTemplateCreate = {
    name: values.name,
    chief_complaint: orNull(values.chief_complaint),
    diagnosis: orNull(values.diagnosis),
    advice: orNull(values.advice),
    investigations: orNull(values.investigations),
    procedure: orNull(values.procedure),
    consult: orNull(values.consult),
    notes: orNull(values.notes),
    follow_up_days: numberOrNull(values.follow_up_days),
    items: values.items.map((item) => ({
      medicine_id: item.medicine_id,
      frequency: item.frequency,
      duration_days: numberOrNull(item.duration_days),
      quantity: numberOrNull(item.quantity),
      instructions: orNull(item.instructions),
      food_timing: item.food_timing === 'none' ? null : item.food_timing,
    })),
  }
  // Only sent when there is something to say, or something to clear, so an
  // older backend that does not know these fields never sees them.
  if (values.examination_findings || before?.examination_findings) {
    body.examination_findings = orNull(values.examination_findings)
  }
  if (values.extra_fields.length > 0 || before?.extra_fields?.length) {
    body.extra_fields = values.extra_fields
  }
  return body
}

/** Raises text fields to the 44px tap floor below `sm`; one place, so a field added later inherits it. */
const TOUCH_FIELDS =
  'max-sm:[&_input]:min-h-tap max-sm:[&_textarea]:min-h-tap max-sm:[&_[role=combobox]]:min-h-tap'

/** A one-tap toggle pill: frequency presets, follow-up picks, advice lines. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'text-label min-h-tap inline-flex items-center gap-1.5 rounded-full border px-3 sm:min-h-9',
        'duration-fast ease-out-quint transition-[transform,background-color,border-color,color]',
        'active:scale-[0.96] motion-reduce:active:scale-100',
        'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none',
        active
          ? 'border-accent/40 bg-accent-muted text-accent-muted-fg'
          : 'border-border bg-surface text-text-muted hover:border-accent hover:bg-accent-muted hover:text-accent-muted-fg',
      )}
    >
      {active && <Check aria-hidden className="size-3.5" />}
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Medicine picker                                                           */
/* -------------------------------------------------------------------------- */

/** Same browse params as the pad's row editor, so both share one cache entry. */
const BROWSE_PARAMS = { page: 1, page_size: 10, sort_by: 'name', sort_order: 'asc' } as const

/**
 * Formulary search: the server ranks typed queries; with nothing typed the
 * formulary is browsed so the list is never an empty dropdown over a full
 * formulary.
 */
function MedicinePicker({
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  id: string
  value: MedicineResponse | null
  invalid: boolean
  describedBy: string | undefined
  onChange: (medicine: MedicineResponse) => void
}) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 180)
  const searching = debounced.length >= 1

  const search = useQuery({
    queryKey: qk.medicines.search(debounced),
    queryFn: () =>
      apiGet<MedicineResponse[]>(endpoints.medicines.search, {
        params: { q: debounced, limit: 12 },
      }),
    enabled: searching,
    staleTime: 30_000,
  })
  const browse = useQuery({
    queryKey: qk.medicines.list(BROWSE_PARAMS),
    queryFn: () =>
      apiGet<Page_MedicineResponse_>(endpoints.medicines.list, { params: BROWSE_PARAMS }),
    enabled: !searching,
    staleTime: 60_000,
  })

  const items = searching
    ? (search.data ?? [])
    : (browse.data?.items ?? []).filter((m) => m.is_active)

  return (
    <Combobox<MedicineResponse>
      id={id}
      aria-describedby={describedBy}
      invalid={invalid}
      value={value}
      onChange={onChange}
      query={query}
      onQueryChange={setQuery}
      items={items}
      loading={searching ? search.isFetching : browse.isFetching}
      getKey={(m) => m.id}
      getLabel={(m) => m.name}
      placeholder="Choose a medicine"
      searchPlaceholder="Brand or generic name…"
      emptyMessage={
        searching
          ? `Nothing in the formulary matches “${debounced}”.`
          : 'No medicines in the formulary yet.'
      }
      renderItem={(m) => (
        <span className="flex flex-col">
          <span className="flex items-baseline gap-2">
            <span className="text-text truncate">{m.name}</span>
            {m.strength && (
              <span className="text-caption text-text-subtle shrink-0 font-mono">{m.strength}</span>
            )}
          </span>
          {(m.generic_name ?? m.brand_name) && (
            <span className="text-caption text-text-subtle truncate">
              {[m.generic_name, m.brand_name].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      )}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  One medicine row                                                          */
/* -------------------------------------------------------------------------- */

function ItemRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const {
    register,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<TemplateFormValues>()
  const rowErrors = errors.items?.[index]
  const prefix = `items.${index}` as const

  const reduced = useReducedMotionSafe()
  const medicineId = useWatch({ control, name: `${prefix}.medicine_id` })
  const medicineName = useWatch({ control, name: `${prefix}.medicine_name` })
  const frequency = useWatch({ control, name: `${prefix}.frequency` })

  // A medicine deleted from the formulary comes back with no name. The row
  // stays editable so the doctor can swap it; the pad skips it until then.
  const gone = medicineId !== '' && medicineName === ''
  const selected = medicineId
    ? ({ id: medicineId, name: medicineName || 'Removed medicine' } as MedicineResponse)
    : null

  const dirty = { shouldDirty: true, shouldValidate: true } as const

  // Choosing a medicine carries its own prescription defaults into blank
  // fields only, as the pad does, so a value already typed here is never lost.
  const choose = (medicine: MedicineResponse) => {
    setValue(`${prefix}.medicine_id`, medicine.id, dirty)
    setValue(`${prefix}.medicine_name`, medicine.name, { shouldDirty: true })
    if (!getValues(`${prefix}.frequency`) && medicine.default_frequency) {
      setValue(`${prefix}.frequency`, medicine.default_frequency, dirty)
    }
    if (!getValues(`${prefix}.duration_days`) && medicine.default_duration_days) {
      setValue(`${prefix}.duration_days`, String(medicine.default_duration_days), dirty)
    }
    if (getValues(`${prefix}.food_timing`) === 'none' && medicine.default_food_timing) {
      setValue(`${prefix}.food_timing`, medicine.default_food_timing, dirty)
    }
    if (!getValues(`${prefix}.instructions`) && medicine.default_instructions) {
      setValue(`${prefix}.instructions`, medicine.default_instructions, dirty)
    }
  }

  return (
    <motion.li
      variants={reduced ? fadeOnly : fadeSlideUp}
      initial="hidden"
      animate="visible"
      className="border-border bg-surface rounded-lg border p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span aria-hidden className="text-caption text-text-subtle font-mono tabular-nums">
          {index + 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-muted hover:text-danger min-h-tap sm:min-h-0"
          iconLeft={<Trash2 className="size-3.5" />}
          aria-label={`Remove ${medicineName || `medicine ${index + 1}`}`}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>

      <Field
        label="Medicine"
        error={rowErrors?.medicine_id?.message}
        hint={
          gone
            ? 'This medicine is no longer in the formulary, so the pad skips it. Choose another or remove the row.'
            : undefined
        }
      >
        {(a) => (
          <MedicinePicker
            id={a.id}
            describedBy={a['aria-describedby']}
            invalid={a['aria-invalid'] === true}
            value={selected}
            onChange={choose}
          />
        )}
      </Field>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_9rem]">
        <Field
          label="Frequency"
          error={rowErrors?.frequency?.message}
          className="col-span-2 sm:col-span-1"
        >
          {(a) => (
            <Input
              {...a}
              {...register(`${prefix}.frequency`)}
              autoComplete="off"
              maxLength={64}
              placeholder='1-0-1, or "before bed"'
            />
          )}
        </Field>

        <Field label="Days" error={rowErrors?.duration_days?.message}>
          {(a) => (
            <Input
              {...a}
              {...register(`${prefix}.duration_days`)}
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              placeholder="—"
            />
          )}
        </Field>

        <Field label="Quantity" error={rowErrors?.quantity?.message}>
          {(a) => (
            <Input
              {...a}
              {...register(`${prefix}.quantity`)}
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              placeholder="—"
            />
          )}
        </Field>

        <Field
          label="Food"
          error={rowErrors?.food_timing?.message}
          className="col-span-2 sm:col-span-1"
        >
          {(a) => (
            <Controller
              control={control}
              name={`${prefix}.food_timing`}
              render={({ field }) => (
                <Select<FoodChoice>
                  id={a.id}
                  aria-describedby={a['aria-describedby']}
                  aria-invalid={a['aria-invalid']}
                  value={field.value}
                  onChange={field.onChange}
                  options={FOOD_OPTIONS}
                />
              )}
            />
          )}
        </Field>
      </div>

      <div role="group" aria-label="Frequency presets" className="mt-2 flex flex-wrap gap-1.5">
        {FREQUENCY_PRESETS.map((preset) => (
          <Chip
            key={preset.value}
            active={(frequency ?? '').trim() === preset.value}
            onClick={() => setValue(`${prefix}.frequency`, preset.value, dirty)}
          >
            <span className="font-mono tabular-nums">{preset.value}</span>
            <span>{preset.label}</span>
          </Chip>
        ))}
      </div>

      <Field
        label="Instructions"
        error={rowErrors?.instructions?.message}
        className="mt-3"
        optionalLabel
      >
        {(a) => (
          <Input
            {...a}
            {...register(`${prefix}.instructions`)}
            autoComplete="off"
            maxLength={2000}
            placeholder="Printed with the medicine"
          />
        )}
      </Field>
    </motion.li>
  )
}


/* -------------------------------------------------------------------------- */
/*  Completeness                                                              */
/* -------------------------------------------------------------------------- */

/** The four guided steps. English everywhere; each step gets one short Bengali line. */
const STEPS = [
  { key: 'name', title: 'Name', tag: 'Name', hint: TPL_BN.steps.name },
  { key: 'complaint', title: 'Complaint', tag: 'Complaint & diagnosis', hint: TPL_BN.steps.complaint },
  { key: 'medicines', title: 'Medicines', tag: 'Medicines', hint: TPL_BN.steps.medicines },
  { key: 'advice', title: 'Advice', tag: 'Advice & follow-up', hint: TPL_BN.steps.advice },
] as const

const LAST_STEP = STEPS.length - 1

/** Which step a form path (or a server error path) lives on. */
function stepOfPath(path: string): number {
  if (path === 'name') return 0
  if (/^(chief_complaint|diagnosis|examination_findings|investigations)$/.test(path)) return 1
  if (path.startsWith('items')) return 2
  return LAST_STEP
}

/** Which steps hold something. Drives the stepper ticks, the ring and the cards. */
function doneOf(values: Partial<TemplateFormValues>): boolean[] {
  const has = (value?: string) => Boolean(value?.trim())
  return [
    has(values.name),
    has(values.chief_complaint) ||
      has(values.diagnosis) ||
      has(values.examination_findings) ||
      has(values.investigations),
    Boolean(values.items?.some((item) => item?.medicine_id)),
    has(values.advice) ||
      has(values.follow_up_days) ||
      has(values.procedure) ||
      has(values.consult) ||
      has(values.notes),
  ]
}

/** Progress ring. The arc eases to its new length whenever `done` changes. */
function CompletionRing({
  done,
  total,
  size = 44,
}: {
  done: number
  total: number
  size?: number
}) {
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const complete = done >= total
  return (
    <span
      role="img"
      aria-label={`${done} of ${total} sections done`}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(done, total) / total)}
          className={cn(
            'duration-slow ease-out-quint transition-[stroke-dashoffset,stroke]',
            complete ? 'stroke-success' : 'stroke-accent',
          )}
        />
      </svg>
      <span
        aria-hidden
        className={cn(
          'text-caption absolute font-semibold tabular-nums transition-colors',
          complete ? 'text-success' : 'text-text-muted',
        )}
      >
        {/* Latin digits: at this size Bengali ৪ reads as 8. */}
        {done}/{total}
      </span>
    </span>
  )
}

/** The ring for a saved template: how many of the four steps it has filled in. */
export function TemplateRing({
  template,
  size,
}: {
  template: PrescriptionTemplateResponse
  size?: number
}) {
  const done = doneOf(valuesOf(template)).filter(Boolean).length
  return <CompletionRing done={done} total={STEPS.length} size={size} />
}

/** Sticky strip: the ring plus four jumpable steps. Watches the form itself so only it re-renders per keystroke. */
function Stepper({ step, onJump }: { step: number; onJump: (step: number) => void }) {
  const { control } = useFormContext<TemplateFormValues>()
  const done = doneOf(useWatch({ control }) as Partial<TemplateFormValues>)
  const count = done.filter(Boolean).length
  const reduced = useReducedMotionSafe()

  return (
    <div className="border-border bg-surface sticky top-0 z-10 -mx-5 mb-5 border-b px-5 pt-1 pb-3">
      <div className="mb-3 flex items-center gap-3">
        <CompletionRing done={count} total={STEPS.length} />
        <p aria-live="polite" className="text-label text-text-muted">
          {count} of {STEPS.length} done
        </p>
      </div>
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, index) => {
          const current = index === step
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onJump(index)}
                className={cn(
                  'min-h-tap flex w-full flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5',
                  'duration-fast ease-out-quint transition-[transform,background-color,border-color]',
                  'active:scale-[0.97] motion-reduce:active:scale-100',
                  'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none',
                  current
                    ? 'border-accent/40 bg-accent-muted'
                    : 'border-transparent hover:bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'text-caption grid size-6 place-items-center rounded-full font-semibold tabular-nums',
                    'duration-base ease-out-quint transition-colors',
                    done[index]
                      ? 'bg-success text-success-fg'
                      : current
                        ? 'bg-accent text-accent-fg'
                        : 'bg-bg-sunken text-text-muted',
                  )}
                >
                  {done[index] ? (
                    <motion.span
                      initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={springSoft}
                      className="grid place-items-center"
                    >
                      <Check aria-hidden className="size-3.5" />
                    </motion.span>
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    'text-caption leading-tight',
                    current ? 'text-accent-muted-fg font-semibold' : 'text-text-muted',
                  )}
                >
                  {s.title}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Step bodies                                                               */
/* -------------------------------------------------------------------------- */

/** The small English tag above a step, then the Bengali sentence that explains it. */
function StepIntro({ index }: { index: number }) {
  const step = STEPS[index]
  return (
    <div>
      <p className="text-caption text-accent font-semibold tracking-wide uppercase">{step.tag}</p>
      <p className="text-body text-text mt-0.5">{step.hint}</p>
    </div>
  )
}

const FOLLOW_UP_PICKS = [3, 7, 14, 30] as const

/** The clinic's advice library as tap-to-add lines. Renders nothing if there is none or it fails to load. */
function AdviceChips() {
  const { control, setValue } = useFormContext<TemplateFormValues>()
  const advice = useWatch({ control, name: 'advice' }) ?? ''
  const presets = useQuery({
    queryKey: qk.advicePresets.list(false),
    queryFn: () => apiGet<AdvicePresetResponse[]>(endpoints.advicePresets.list),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const list = (presets.data ?? [])
    .filter((p) => p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .slice(0, 12)
  if (list.length === 0) return null

  // The textarea is the only source of truth: a chip is lit when its label is a line of it.
  const lines = advice.split('\n').map((line) => line.trim())
  const toggle = (label: string) => {
    const next = lines.includes(label)
      ? lines.filter((line) => line && line !== label)
      : [...lines.filter(Boolean), label]
    setValue('advice', next.join('\n'), { shouldDirty: true })
  }

  return (
    <div role="group" aria-label="Advice library" className="mb-2 flex flex-wrap gap-1.5">
      {list.map((preset) => (
        <Chip key={preset.id} active={lines.includes(preset.label)} onClick={() => toggle(preset.label)}>
          {preset.label}
        </Chip>
      ))}
    </div>
  )
}

function FollowUpField() {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TemplateFormValues>()
  const days = useWatch({ control, name: 'follow_up_days' }) ?? ''

  return (
    <Field
      label="Follow-up"
      hint="The pad sets the follow-up date to today plus this many days."
      error={errors.follow_up_days?.message}
      optionalLabel
    >
      {(a) => (
        <div className="flex flex-col gap-2">
          <div role="group" aria-label="Follow-up quick picks" className="flex flex-wrap gap-1.5">
            {FOLLOW_UP_PICKS.map((n) => (
              <Chip
                key={n}
                active={days === String(n)}
                onClick={() =>
                  setValue('follow_up_days', days === String(n) ? '' : String(n), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {n} days
              </Chip>
            ))}
          </div>
          <Input
            {...a}
            {...register('follow_up_days')}
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            placeholder="—"
            className="sm:max-w-40"
          />
        </div>
      )}
    </Field>
  )
}

/* -------------------------------------------------------------------------- */
/*  Start-from chooser and the save burst                                     */
/* -------------------------------------------------------------------------- */

/** Same tactile lift as the cards on the list screen. */
const CARD =
  'border-border bg-surface flex min-h-24 w-full flex-col gap-1 rounded-xl border p-4 text-left shadow-sm ' +
  'duration-base ease-out-quint transition-[transform,box-shadow,border-color] ' +
  'hover:border-border-strong hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] ' +
  'motion-reduce:transform-none focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none'

/** "Start from": every saved template as a card, one tap copies it. */
function StartChooser({
  templates,
  onPick,
}: {
  templates: readonly PrescriptionTemplateResponse[]
  onPick: (source: PrescriptionTemplateResponse | null) => void
}) {
  const reduced = useReducedMotionSafe()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text font-semibold">Start from</p>
      <motion.ul
        variants={listStagger}
        initial={reduced ? false : 'hidden'}
        animate="visible"
        className="grid gap-3 sm:grid-cols-2"
      >
        <motion.li variants={listItem}>
          <button
            type="button"
            onClick={() => onPick(null)}
            className={cn(CARD, 'border-accent/50 bg-accent-muted/40 border-dashed')}
          >
            <span className="bg-accent-muted text-accent-muted-fg grid size-9 place-items-center rounded-full">
              <Plus aria-hidden className="size-5" />
            </span>
            <span className="text-body text-text font-semibold">Start blank</span>
          </button>
        </motion.li>
        {templates.map((t) => (
          <motion.li key={t.id} variants={listItem}>
            <button type="button" onClick={() => onPick(t)} className={CARD}>
              <span className="text-body text-text line-clamp-2 font-semibold text-balance">
                {t.name}
              </span>
              <span className="text-caption text-text-muted">
                {t.items.length === 1 ? '1 medicine' : `${t.items.length} medicines`}
              </span>
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}

const CONFETTI = ['bg-accent', 'bg-warning', 'bg-info', 'bg-success', 'bg-danger'] as const

/**
 * Covers the sheet for a beat after a save: a check pops in and a ring of
 * confetti flies out. Positions are a fixed function of the index, so it is
 * the same burst every time and nothing random runs during render.
 */
function SaveBurst() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-surface/95 absolute inset-0 z-20 grid place-items-center"
    >
      <div className="relative grid size-16 place-items-center">
        <motion.span
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={springSoft}
          className="bg-success text-success-fg grid size-16 place-items-center rounded-full"
        >
          <Check className="size-8" strokeWidth={3} />
        </motion.span>
        {Array.from({ length: 20 }, (_, i) => {
          const angle = (i / 20) * Math.PI * 2
          const distance = 76 + (i % 3) * 24
          return (
            <motion.span
              key={i}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
              animate={{
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                scale: [0, 1, 1],
                opacity: [1, 1, 0],
                rotate: i * 47,
              }}
              transition={{ duration: 0.9, ease: easeOutExpo }}
              className={cn('absolute size-2 rounded-[2px]', CONFETTI[i % CONFETTI.length])}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sheet                                                                     */
/* -------------------------------------------------------------------------- */

/** A centred, scrollable modal on desktop that fills the screen on a phone. */
const MODAL =
  'sm:h-[85dvh] max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none ' +
  'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0'

const DISCARD = {
  title: 'Leave without saving?',
  body: 'What you typed has not been saved and will be lost.',
  confirm: 'Leave',
} as const

export interface TemplateEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A template edits it; `null` creates. */
  template: PrescriptionTemplateResponse | null
  /** Creating only: opens pre-filled with a copy of this template. */
  startFrom: PrescriptionTemplateResponse | null
  /** Every saved template, offered as "Start from" cards when creating. */
  templates: readonly PrescriptionTemplateResponse[]
}

/**
 * A short guided flow, not a long form: name, complaint, medicines, advice.
 * Every step can be skipped or jumped to, and Save is always on screen, so a
 * template can be as small as a name and one medicine.
 */
export function TemplateEditor({
  open,
  onOpenChange,
  template,
  startFrom,
  templates,
}: TemplateEditorProps) {
  const formId = useId()
  const create = useCreateTemplate()
  const update = useUpdateTemplate()
  const reduced = useReducedMotionSafe()
  const editing = template !== null
  const [step, setStep] = useState(0)
  const [choosing, setChoosing] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(null),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isDirty },
  } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  // A "(copy)" name is a placeholder for the doctor's own: select it so typing replaces it.
  // Deferred a frame so it runs after the form has been re-seeded and the field is mounted.
  const selectName = useCallback(
    () => requestAnimationFrame(() => setFocus('name', { shouldSelect: true })),
    [setFocus],
  )

  // Read when the sheet opens, not on every refetch: a list that grows because
  // this very save succeeded must not re-seed the form.
  const templatesRef = useRef(templates)
  useEffect(() => {
    templatesRef.current = templates
  })

  // Re-seed on every open so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return
    setStep(0)
    setCelebrating(false)
    setChoosing(!template && !startFrom && templatesRef.current.length > 0)
    reset(template ? valuesOf(template) : copyOf(startFrom))
    if (startFrom) selectName()
  }, [open, template, startFrom, reset, selectName])

  const closeTimer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const pickStart = (source: PrescriptionTemplateResponse | null) => {
    reset(copyOf(source))
    setStep(0)
    setChoosing(false)
    if (source) selectName()
  }

  // Focus the medicine search of a row the doctor just added.
  const listRef = useRef<HTMLUListElement>(null)
  const added = useRef(false)
  useEffect(() => {
    if (!added.current) return
    added.current = false
    listRef.current?.lastElementChild?.querySelector<HTMLElement>('[role=combobox]')?.focus()
  }, [fields.length])

  // Esc, the X, a click outside and Cancel all land here. Unsaved typing asks first.
  const requestClose = (next: boolean) => {
    if (next || celebrating || !isDirty) onOpenChange(next)
    else setDiscarding(true)
  }

  const pending = create.isPending || update.isPending || celebrating

  /** Go to the step an error lives on, and focus its field once that step has mounted. */
  const showError = (paths: string[]) => {
    const target = Math.min(...paths.map(stepOfPath))
    setStep(target)
    const first = paths.find((path) => stepOfPath(path) === target && !path.startsWith('items'))
    if (first && isFieldPath(first)) requestAnimationFrame(() => setFocus(first))
  }

  const onInvalid = (invalid: FieldErrors<TemplateFormValues>) => showError(Object.keys(invalid))

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (template) {
        await update.mutateAsync({ id: template.id, body: bodyOf(values, template) })
      } else {
        await create.mutateAsync(bodyOf(values, null))
      }
      toast.success('Template ready!')
      if (reduced) {
        onOpenChange(false)
      } else {
        setCelebrating(true)
        closeTimer.current = window.setTimeout(() => onOpenChange(false), 1100)
      }
    } catch (error) {
      const apiError = toApiError(error)
      // Names are unique per doctor; the clash belongs under the name field.
      if (apiError.isConflict) {
        setError('name', { message: 'A template with this name already exists' })
        showError(['name'])
        return
      }
      if (apiError.isValidation) {
        const paths: string[] = []
        for (const [path, message] of Object.entries(apiError.fieldErrors())) {
          if (!isFieldPath(path)) continue
          setError(path, { message })
          paths.push(path)
        }
        if (paths.length > 0) {
          showError(paths)
          return
        }
      }
      setError('root', { message: apiError.message })
    }
  }, onInvalid)

  return (
    <DialogRoot open={open} onOpenChange={requestClose}>
      <DialogContent
        size="lg"
        title={editing ? template.name : 'New template'}
        className={MODAL}
        footer={
          <>
            <Button
              variant="ghost"
              className="min-h-tap sm:min-h-0"
              onClick={() => requestClose(false)}
            >
              Cancel
            </Button>
            {!choosing && (
              <Button
                type="submit"
                form={formId}
                variant="primary"
                className="min-h-tap sm:min-h-0"
                loading={pending}
                disabled={editing && !isDirty}
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
            )}
          </>
        }
      >
        {celebrating && <SaveBurst />}

        {choosing ? (
          <StartChooser templates={templates} onPick={pickStart} />
        ) : (
          <FormProvider {...form}>
            <Stepper step={step} onJump={setStep} />
            <form
              id={formId}
              noValidate
              onSubmit={onSubmit}
              // Enter walks the steps; on the last one it saves. Events from the
              // medicine search (a portal) bubble here too, so only handle our own.
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || step === LAST_STEP) return
                if (!(e.target instanceof HTMLInputElement)) return
                if (!e.currentTarget.contains(e.target)) return
                e.preventDefault()
                setStep(step + 1)
              }}
              className={cn('flex flex-col gap-4', TOUCH_FIELDS)}
            >
              {errors.root?.message && (
                <p
                  role="alert"
                  className="border-danger/25 bg-danger-muted text-caption text-danger flex items-start gap-2 rounded-md border px-3 py-2"
                >
                  <AlertTriangle aria-hidden className="mt-px size-4 shrink-0" />
                  {errors.root.message}
                </p>
              )}

              <motion.div
                key={step}
                variants={reduced ? fadeOnly : fadeSlideUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-4"
              >
                <StepIntro index={step} />

                {step === 0 && (
                  <Field
                    label="Template name"
                    error={errors.name?.message}
                    required
                  >
                    {(a) => (
                      <Input
                        {...a}
                        {...register('name')}
                        inputSize="lg"
                        autoFocus
                        autoComplete="off"
                        maxLength={128}
                      />
                    )}
                  </Field>
                )}

                {step === 1 && (
                  <>
                    <Field
                      label="Chief complaint"
                      error={errors.chief_complaint?.message}
                      optionalLabel
                    >
                      {(a) => (
                        <Input
                          {...a}
                          {...register('chief_complaint')}
                          autoComplete="off"
                          maxLength={512}
                        />
                      )}
                    </Field>
                    <Field
                      label="Diagnosis"
                      error={errors.diagnosis?.message}
                      optionalLabel
                    >
                      {(a) => (
                        <Input
                          {...a}
                          {...register('diagnosis')}
                          autoComplete="off"
                          maxLength={512}
                        />
                      )}
                    </Field>
                    <Field
                      label="Examination findings"
                      error={errors.examination_findings?.message}
                      optionalLabel
                    >
                      {(a) => <Textarea {...a} {...register('examination_findings')} rows={2} />}
                    </Field>
                    <Field
                      label="Investigations"
                      error={errors.investigations?.message}
                      optionalLabel
                    >
                      {(a) => <Textarea {...a} {...register('investigations')} rows={2} />}
                    </Field>
                  </>
                )}

                {step === 2 && (
                  <>
                    {fields.length > 0 && (
                      <ul ref={listRef} className="flex flex-col gap-3">
                        {fields.map((field, index) => (
                          <ItemRow key={field.id} index={index} onRemove={() => remove(index)} />
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        added.current = true
                        append(emptyItem(), { shouldFocus: false })
                      }}
                      className={cn(
                        'text-label text-accent-muted-fg min-h-tap border-accent/50 bg-accent-muted/40 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 font-semibold',
                        fields.length === 0 ? 'py-8' : 'py-3',
                        'duration-base ease-out-quint transition-[transform,background-color,border-color]',
                        'hover:bg-accent-muted active:scale-[0.98] motion-reduce:active:scale-100',
                        'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none',
                      )}
                    >
                      <Plus aria-hidden className="size-4" />
                      Add medicine
                    </button>
                  </>
                )}

                {step === 3 && (
                  <>
                    <Field
                      label="Advice"
                      error={errors.advice?.message}
                      optionalLabel
                    >
                      {(a) => (
                        <>
                          <AdviceChips />
                          <Textarea {...a} {...register('advice')} rows={4} />
                        </>
                      )}
                    </Field>
                    <FollowUpField />
                    <Field
                      label="Procedure"
                      error={errors.procedure?.message}
                      optionalLabel
                    >
                      {(a) => <Textarea {...a} {...register('procedure')} rows={2} />}
                    </Field>
                    <Field
                      label="Consult"
                      error={errors.consult?.message}
                      optionalLabel
                    >
                      {(a) => <Textarea {...a} {...register('consult')} rows={2} />}
                    </Field>
                    <Field
                      label="Notes"
                      error={errors.notes?.message}
                      optionalLabel
                    >
                      {(a) => <Textarea {...a} {...register('notes')} rows={2} />}
                    </Field>
                  </>
                )}

                <div className="mt-2 flex items-center justify-between gap-2">
                  {step > 0 ? (
                    <Button
                      variant="ghost"
                      className="min-h-tap sm:min-h-0"
                      iconLeft={<ArrowLeft className="size-4" />}
                      onClick={() => setStep(step - 1)}
                    >
                      Back
                    </Button>
                  ) : (
                    <span />
                  )}
                  {step < LAST_STEP && (
                    <Button
                      variant="tonal"
                      className="min-h-tap sm:min-h-0"
                      iconRight={<ArrowRight className="size-4" />}
                      onClick={() => setStep(step + 1)}
                    >
                      Next
                    </Button>
                  )}
                </div>
              </motion.div>
            </form>
          </FormProvider>
        )}
      </DialogContent>

      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={DISCARD.title}
        body={DISCARD.body}
        confirmLabel={DISCARD.confirm}
        destructive
        onConfirm={() => {
          setDiscarding(false)
          onOpenChange(false)
        }}
      />
    </DialogRoot>
  )
}

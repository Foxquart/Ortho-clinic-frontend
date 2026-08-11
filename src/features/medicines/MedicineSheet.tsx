import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { toApiError } from '@/api/errors'
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
  brand_name: z.string().trim().max(128, 'Keep this to 128 characters or fewer'),
  dosage_form: z.enum(MEDICINE_DOSAGE_FORMS),
  strength: z.string().trim().max(32, 'Keep the strength to 32 characters or fewer'),
  category: z.string().trim().max(64, 'Keep the category to 64 characters or fewer'),
  manufacturer: z.string().trim().max(128, 'Keep this to 128 characters or fewer'),
  description: z.string().trim().max(2000, 'Keep the notes to 2000 characters or fewer'),
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
  }
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
  useEffect(() => {
    if (!open) return
    reset(medicine ? valuesOf(medicine) : emptyValues(initialName))
  }, [open, medicine, initialName, reset])

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

            <Field label="Brand name" error={errors.brand_name?.message} optionalLabel>
              {(a) => (
                <Input {...a} {...register('brand_name')} autoComplete="off" placeholder="Crocin" />
              )}
            </Field>
          </div>

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
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle, ClipboardList, CloudOff, Plus } from 'lucide-react'
import { toApiError, errorMessage } from '@/api/errors'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Surface'
import { ConfirmDialog, DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Input'
import type { AdvicePresetCreate, AdvicePresetResponse, AdvicePresetUpdate } from '@/api/schema'
import {
  categoriesOf,
  groupPresets,
  useAdvicePresetList,
  useCreateAdvicePreset,
  useDeleteAdvicePreset,
  useUpdateAdvicePreset,
} from './useAdvicePresets'

/* -------------------------------------------------------------------------- */
/*  Add / edit dialog                                                         */
/* -------------------------------------------------------------------------- */

/* Mirrors AdvicePresetCreate: label 1..256 required; category <= 64 optional;
   sort order an optional non-negative whole number. Numbers ride as the
   input's own string so an emptied field means "unset", not NaN. */
const presetSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Enter the advice text')
    .max(256, 'Keep the advice to 256 characters or fewer'),
  category: z.string().trim().max(64, 'Keep the category to 64 characters or fewer'),
  sort_order: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), 'Enter a whole number, 0 or higher'),
})

type PresetFormValues = z.infer<typeof presetSchema>

const PRESET_FIELD_KEYS = ['label', 'category', 'sort_order'] as const

function isPresetFieldKey(key: string): key is keyof PresetFormValues {
  return (PRESET_FIELD_KEYS as readonly string[]).includes(key)
}

function presetValuesOf(preset: AdvicePresetResponse | null): PresetFormValues {
  return {
    label: preset?.label ?? '',
    category: preset?.category ?? '',
    sort_order: preset ? String(preset.sort_order) : '',
  }
}

function createPresetBody(values: PresetFormValues): AdvicePresetCreate {
  const category = values.category.trim()
  const sortOrder = values.sort_order.trim()
  return {
    label: values.label.trim(),
    category: category === '' ? undefined : category,
    sort_order: sortOrder === '' ? undefined : Number(sortOrder),
  }
}

function updatePresetBody(values: PresetFormValues): AdvicePresetUpdate {
  const category = values.category.trim()
  const sortOrder = values.sort_order.trim()
  return {
    label: values.label.trim(),
    // `null` clears a category that was previously set.
    category: category === '' ? null : category,
    sort_order: sortOrder === '' ? undefined : Number(sortOrder),
  }
}

/**
 * The two fields in this dialog are 32px tall — right under a mouse, eight
 * pixels short of what a fingertip needs. Raised from the form root rather than
 * field by field so a field added later inherits it; above `sm` the original
 * density returns.
 */
const TOUCH_FIELDS = 'max-sm:[&_input]:min-h-tap max-sm:[&_textarea]:min-h-tap'

function AdvicePresetDialog({
  open,
  onOpenChange,
  preset,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates; a preset edits it. */
  preset: AdvicePresetResponse | null
  /** Existing category names — offered as suggestions so groups stay consistent. */
  categories: readonly string[]
}) {
  const formId = useId()
  const create = useCreateAdvicePreset()
  const update = useUpdateAdvicePreset()
  const editing = preset !== null

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<PresetFormValues>({
    resolver: zodResolver(presetSchema),
    defaultValues: presetValuesOf(null),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  // Re-seed on every open so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return
    reset(presetValuesOf(preset))
  }, [open, preset, reset])

  const pending = create.isPending || update.isPending

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (preset) {
        await update.mutateAsync({ id: preset.id, body: updatePresetBody(values) })
        toast.success('Advice updated')
      } else {
        await create.mutateAsync(createPresetBody(values))
        toast.success('Advice added to the library')
      }
      onOpenChange(false)
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.isValidation) {
        let first = true
        let matched = false
        for (const [path, message] of Object.entries(apiError.fieldErrors())) {
          if (!isPresetFieldKey(path)) continue
          setError(path, { message }, { shouldFocus: first })
          first = false
          matched = true
        }
        if (matched) return
      }
      setError('root', { message: apiError.message })
    }
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={editing ? 'Edit advice' : 'Add advice'}
        description={
          editing
            ? 'Changes apply to the pad immediately. Past prescriptions keep the words they were printed with.'
            : 'One reusable line the pad offers with a single tap.'
        }
        footer={
          <>
            <Button
              variant="ghost"
              className="min-h-tap sm:min-h-0"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              className="min-h-tap sm:min-h-0"
              loading={pending}
              disabled={editing && !isDirty}
            >
              {editing ? 'Save changes' : 'Add advice'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={onSubmit} className={cn('flex flex-col gap-4', TOUCH_FIELDS)}>
          {errors.root?.message && (
            <p
              role="alert"
              className="border-danger/25 bg-danger-muted text-caption text-danger flex items-start gap-2 rounded-md border px-3 py-2"
            >
              <AlertTriangle aria-hidden className="mt-px size-4 shrink-0" />
              {errors.root.message}
            </p>
          )}

          <Field
            label="Advice"
            hint="Exactly as it should print, e.g. Apply ice for 15 minutes, three times a day."
            error={errors.label?.message}
            required
          >
            {(a) => (
              <Textarea
                {...a}
                {...register('label')}
                autoFocus
                rows={2}
                maxLength={256}
                placeholder="Apply ice for 15 minutes, three times a day"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field
              label="Category"
              hint="Groups the library, e.g. Knee pain. Leave blank for General."
              error={errors.category?.message}
              optionalLabel
            >
              {(a) => (
                <>
                  <Input
                    {...a}
                    {...register('category')}
                    autoComplete="off"
                    list={`${formId}-categories`}
                    placeholder="Knee pain"
                  />
                  <datalist id={`${formId}-categories`}>
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>

            <Field
              label="Sort order"
              hint="Lower shows first."
              error={errors.sort_order?.message}
              optionalLabel
            >
              {(a) => (
                <Input
                  {...a}
                  {...register('sort_order')}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="0"
                />
              )}
            </Field>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

/* -------------------------------------------------------------------------- */
/*  Rows                                                                      */
/* -------------------------------------------------------------------------- */

function PresetRow({
  preset,
  busy,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  preset: AdvicePresetResponse
  /** This row's activate/deactivate call is in flight. */
  busy: boolean
  onEdit: (preset: AdvicePresetResponse) => void
  onToggleActive: (preset: AdvicePresetResponse) => void
  onDelete: (preset: AdvicePresetResponse) => void
}) {
  const inactive = !preset.is_active
  return (
    <li className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0">
      <p
        className={cn(
          'text-body min-w-0 flex-1 basis-56',
          inactive ? 'text-text-subtle' : 'text-text',
        )}
      >
        {preset.label}
      </p>

      {inactive && <Badge tone="neutral">Inactive</Badge>}

      {/* Labelled, never icon-only: the action must be readable at a glance,
          without a hover or a guess. Three 26px buttons in a row is a mouse
          target trio; below `sm` each is raised to the 44px tap minimum, which
          also puts real space between "Deactivate" and "Delete" on the one
          screen where a thumb is doing the aiming. */}
      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-tap sm:min-h-0"
          aria-label={`Edit advice: ${preset.label}`}
          onClick={() => onEdit(preset)}
        >
          Edit
        </Button>
        {preset.is_active ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-tap sm:min-h-0"
            loading={busy}
            aria-label={`Deactivate advice: ${preset.label}`}
            onClick={() => onToggleActive(preset)}
          >
            Deactivate
          </Button>
        ) : (
          // Tonal: on a muted row, the way back has to be the thing you see.
          <Button
            variant="tonal"
            size="sm"
            className="min-h-tap sm:min-h-0"
            loading={busy}
            aria-label={`Reactivate advice: ${preset.label}`}
            onClick={() => onToggleActive(preset)}
          >
            Reactivate
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-muted hover:text-danger min-h-tap sm:min-h-0"
          aria-label={`Delete advice: ${preset.label}`}
          onClick={() => onDelete(preset)}
        >
          Delete
        </Button>
      </span>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Admin management for the advice preset library, grouped by category with
 * uncategorised lines last under "General".
 *
 * Degrade path: a backend that predates the library answers 404 for these
 * routes. That is rendered as one calm explanatory state — never an error
 * toast, and never a retry loop.
 */
export function AdviceLibraryScreen() {
  const view = useAdvicePresetList()
  const update = useUpdateAdvicePreset()
  const remove = useDeleteAdvicePreset()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdvicePresetResponse | null>(null)
  const [deleting, setDeleting] = useState<AdvicePresetResponse | null>(null)
  // Held separately so the dialog title keeps the label during its exit animation.
  const [deletingLabel, setDeletingLabel] = useState('')

  const apiError = view.isError ? toApiError(view.error) : null
  // The one expected failure: this backend does not have the library yet.
  const backendMissing = apiError?.status === 404

  const presets = useMemo(() => view.data ?? [], [view.data])
  const groups = useMemo(() => groupPresets(presets), [presets])
  const categories = useMemo(() => categoriesOf(presets), [presets])
  const inactiveCount = presets.filter((preset) => !preset.is_active).length

  const openCreate = useCallback(() => {
    setEditing(null)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((preset: AdvicePresetResponse) => {
    setEditing(preset)
    setDialogOpen(true)
  }, [])

  const toggleActive = useCallback(
    (preset: AdvicePresetResponse) => {
      const activating = !preset.is_active
      update.mutate(
        { id: preset.id, body: { is_active: activating } },
        {
          onSuccess: () =>
            toast.success(
              activating ? 'Back on the pad' : 'Deactivated',
              {
                description: activating
                  ? 'The pad offers this line again.'
                  : 'The pad stops offering it. Reactivate it here at any time.',
              },
            ),
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    },
    [update],
  )

  const askDelete = useCallback((preset: AdvicePresetResponse) => {
    setDeletingLabel(preset.label)
    setDeleting(preset)
  }, [])

  const confirmDelete = useCallback(() => {
    const preset = deleting
    if (!preset) return
    remove.mutate(preset.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.success('Advice deleted')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }, [deleting, remove])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Advice library"
        description="Reusable advice lines the prescription pad offers with one tap."
        actions={
          !backendMissing &&
          !view.isError && (
            /* Curating the library is the only reason this screen is opened,
               so on a phone its one action takes the whole line at full tap
               height rather than sitting as a 32px chip under the title. */
            <Button
              variant="primary"
              iconLeft={<Plus className="size-4" />}
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
              onClick={openCreate}
            >
              Add advice
            </Button>
          )
        }
      />

      {view.isPending ? (
        <Card>
          <SkeletonRows rows={6} className="py-2" />
        </Card>
      ) : backendMissing ? (
        <Card>
          <EmptyState
            icon={<CloudOff />}
            title="The advice library needs the latest backend"
            description="Ask the backend team to deploy it. Nothing is wrong on your side, and this screen will fill in on its own once the new API is live."
            action={
              <Button variant="secondary" size="sm" onClick={() => void view.refetch()}>
                Check again
              </Button>
            }
          />
        </Card>
      ) : view.isError ? (
        <ErrorState error={view.error} onRetry={() => void view.refetch()} />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title="No advice in the library yet"
            description="Add the lines you write on almost every prescription, and the pad will offer them as one-tap picks."
            action={
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Plus className="size-4" />}
                onClick={openCreate}
              >
                Add the first advice
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {inactiveCount > 0 && (
            <p role="status" className="text-caption text-text-muted">
              {presets.length.toLocaleString()} lines, {inactiveCount.toLocaleString()} inactive.
              Inactive lines stay here and can be reactivated.
            </p>
          )}
          {groups.map((group) => (
            <Card key={group.key}>
              <CardHeader
                title={group.title}
                description={
                  group.presets.length === 1 ? '1 line' : `${group.presets.length} lines`
                }
              />
              <ul>
                {group.presets.map((preset) => (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    busy={update.isPending && update.variables?.id === preset.id}
                    onEdit={openEdit}
                    onToggleActive={toggleActive}
                    onDelete={askDelete}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}

      <AdvicePresetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preset={editing}
        categories={categories}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this advice line?"
        body={
          <>
            <p className="text-text">&ldquo;{deletingLabel}&rdquo;</p>
            <p className="mt-2">
              Deleting removes it permanently. If it might come back, deactivate it instead and it
              stays here, off the pad.
            </p>
          </>
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

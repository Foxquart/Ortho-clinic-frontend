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
import { Field, Input } from '@/components/ui/Input'
import type { InvestigationCreate, InvestigationResponse, InvestigationUpdate } from '@/api/schema'
import {
  useCreateInvestigation,
  useDeleteInvestigation,
  useInvestigationList,
  useUpdateInvestigation,
} from './useInvestigations'

const GENERAL = 'General'

/* Mirrors InvestigationCreate: name 1..128 required; category <= 64 optional;
   sort order an optional non-negative whole number. Numbers ride as the
   input's own string so an emptied field means "unset", not NaN. */
const investigationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter the test name')
    .max(128, 'Keep the name to 128 characters or fewer'),
  category: z.string().trim().max(64, 'Keep the category to 64 characters or fewer'),
  sort_order: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), 'Enter a whole number, 0 or higher'),
})

type InvestigationFormValues = z.infer<typeof investigationSchema>

const FIELD_KEYS = ['name', 'category', 'sort_order'] as const

function isFieldKey(key: string): key is keyof InvestigationFormValues {
  return (FIELD_KEYS as readonly string[]).includes(key)
}

function valuesOf(investigation: InvestigationResponse | null): InvestigationFormValues {
  return {
    name: investigation?.name ?? '',
    category: investigation?.category ?? '',
    sort_order: investigation ? String(investigation.sort_order) : '',
  }
}

function createBody(values: InvestigationFormValues): InvestigationCreate {
  const category = values.category.trim()
  const sortOrder = values.sort_order.trim()
  return {
    name: values.name.trim(),
    category: category === '' ? undefined : category,
    sort_order: sortOrder === '' ? undefined : Number(sortOrder),
  }
}

function updateBody(values: InvestigationFormValues): InvestigationUpdate {
  const category = values.category.trim()
  const sortOrder = values.sort_order.trim()
  return {
    name: values.name.trim(),
    // `null` clears a category that was previously set.
    category: category === '' ? null : category,
    sort_order: sortOrder === '' ? undefined : Number(sortOrder),
  }
}

const TOUCH_FIELDS = 'max-sm:[&_input]:min-h-tap'

function InvestigationDialog({
  open,
  onOpenChange,
  investigation,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates; a row edits it. */
  investigation: InvestigationResponse | null
  /** Existing category names — offered as suggestions so groups stay consistent. */
  categories: readonly string[]
}) {
  const formId = useId()
  const create = useCreateInvestigation()
  const update = useUpdateInvestigation()
  const editing = investigation !== null

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<InvestigationFormValues>({
    resolver: zodResolver(investigationSchema),
    defaultValues: valuesOf(null),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  // Re-seed on every open so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return
    reset(valuesOf(investigation))
  }, [open, investigation, reset])

  const pending = create.isPending || update.isPending

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (investigation) {
        await update.mutateAsync({ id: investigation.id, body: updateBody(values) })
        toast.success('Test updated')
      } else {
        await create.mutateAsync(createBody(values))
        toast.success('Test added to the catalogue')
      }
      onOpenChange(false)
    } catch (error) {
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
      setError('root', { message: apiError.message })
    }
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={editing ? 'Edit test' : 'Add test'}
        description={
          editing
            ? 'Changes apply to the pad immediately. Past prescriptions keep the words they were printed with.'
            : 'One test the pad offers in its Investigations picker.'
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
              {editing ? 'Save changes' : 'Add test'}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={onSubmit}
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

          <Field
            label="Test name"
            hint="Exactly as it should print, e.g. CBC. Names are unique."
            error={errors.name?.message}
            required
          >
            {(a) => (
              <Input
                {...a}
                {...register('name')}
                autoFocus
                maxLength={128}
                autoComplete="off"
                placeholder="CBC"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field
              label="Category"
              hint="Groups the picker, e.g. Blood. Leave blank for General."
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
                    placeholder="Blood"
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

function InvestigationRow({
  investigation,
  busy,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  investigation: InvestigationResponse
  /** This row's activate/deactivate call is in flight. */
  busy: boolean
  onEdit: (investigation: InvestigationResponse) => void
  onToggleActive: (investigation: InvestigationResponse) => void
  onDelete: (investigation: InvestigationResponse) => void
}) {
  const inactive = !investigation.is_active
  return (
    <li className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 basis-56">
        <p className={cn('text-body', inactive ? 'text-text-subtle' : 'text-text')}>
          {investigation.name}
        </p>
        <p className="text-caption text-text-subtle mt-0.5">Sort {investigation.sort_order}</p>
      </div>

      {inactive && <Badge tone="neutral">Inactive</Badge>}

      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-tap sm:min-h-0"
          aria-label={`Edit test: ${investigation.name}`}
          onClick={() => onEdit(investigation)}
        >
          Edit
        </Button>
        {investigation.is_active ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-tap sm:min-h-0"
            loading={busy}
            aria-label={`Deactivate test: ${investigation.name}`}
            onClick={() => onToggleActive(investigation)}
          >
            Deactivate
          </Button>
        ) : (
          <Button
            variant="tonal"
            size="sm"
            className="min-h-tap sm:min-h-0"
            loading={busy}
            aria-label={`Reactivate test: ${investigation.name}`}
            onClick={() => onToggleActive(investigation)}
          >
            Reactivate
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-muted hover:text-danger min-h-tap sm:min-h-0"
          aria-label={`Delete test: ${investigation.name}`}
          onClick={() => onDelete(investigation)}
        >
          Delete
        </Button>
      </span>
    </li>
  )
}

interface TestGroup {
  name: string
  rows: InvestigationResponse[]
}

/** Group by category, retaining the server's order inside each group; General last. */
function groupRows(rows: readonly InvestigationResponse[]): TestGroup[] {
  const byName = new Map<string, InvestigationResponse[]>()
  for (const row of rows) {
    const name = row.category?.trim() || GENERAL
    const list = byName.get(name)
    if (list) list.push(row)
    else byName.set(name, [row])
  }
  return [...byName.entries()]
    .sort(([a], [b]) => (a === GENERAL ? 1 : 0) - (b === GENERAL ? 1 : 0))
    .map(([name, list]) => ({ name, rows: list }))
}

function categoriesOf(rows: readonly InvestigationResponse[]): string[] {
  const seen = new Map<string, string>()
  for (const row of rows) {
    const category = row.category?.trim()
    if (category) seen.set(category.toLowerCase(), category)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Management for the investigation catalogue, grouped by category with
 * uncategorised tests last under "General".
 *
 * Degrade path: a backend that predates the catalogue answers 404 for these
 * routes. That is rendered as one calm explanatory state — never an error
 * toast, and never a retry loop.
 */
export function InvestigationsLibraryScreen() {
  const view = useInvestigationList()
  const update = useUpdateInvestigation()
  const remove = useDeleteInvestigation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InvestigationResponse | null>(null)
  const [deleting, setDeleting] = useState<InvestigationResponse | null>(null)
  // Held separately so the dialog title keeps the name during its exit animation.
  const [deletingName, setDeletingName] = useState('')

  const apiError = view.isError ? toApiError(view.error) : null
  // The one expected failure: this backend does not have the catalogue yet.
  const backendMissing = apiError?.status === 404

  const rows = useMemo(() => view.data ?? [], [view.data])
  const groups = useMemo(() => groupRows(rows), [rows])
  const categories = useMemo(() => categoriesOf(rows), [rows])
  const inactiveCount = rows.filter((row) => !row.is_active).length

  const openCreate = useCallback(() => {
    setEditing(null)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((investigation: InvestigationResponse) => {
    setEditing(investigation)
    setDialogOpen(true)
  }, [])

  const toggleActive = useCallback(
    (investigation: InvestigationResponse) => {
      const activating = !investigation.is_active
      update.mutate(
        { id: investigation.id, body: { is_active: activating } },
        {
          onSuccess: () =>
            toast.success(activating ? 'Back on the pad' : 'Deactivated', {
              description: activating
                ? 'The pad offers this test again.'
                : 'The pad stops offering it. Reactivate it here at any time.',
            }),
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    },
    [update],
  )

  const askDelete = useCallback((investigation: InvestigationResponse) => {
    setDeletingName(investigation.name)
    setDeleting(investigation)
  }, [])

  const confirmDelete = useCallback(() => {
    const investigation = deleting
    if (!investigation) return
    remove.mutate(investigation.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.success('Test deleted')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }, [deleting, remove])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Test catalogue"
        description="The tests the prescription pad offers in its Investigations picker."
        actions={
          !backendMissing &&
          !view.isError && (
            <Button
              variant="primary"
              iconLeft={<Plus className="size-4" />}
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
              onClick={openCreate}
            >
              Add test
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
            title="The test catalogue needs the latest backend"
            description="Ask the backend team to deploy it and run the seed. Nothing is wrong on your side, and this screen will fill in on its own once the new API is live."
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
            title="No tests in the catalogue yet"
            description="Add the tests you order most often, and the pad will offer them as a grouped checklist instead of a blank box."
            action={
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Plus className="size-4" />}
                onClick={openCreate}
              >
                Add the first test
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {inactiveCount > 0 && (
            <p role="status" className="text-caption text-text-muted">
              {rows.length.toLocaleString()} tests, {inactiveCount.toLocaleString()} inactive.
              Inactive tests stay here and can be reactivated.
            </p>
          )}
          {groups.map((group) => (
            <Card key={group.name}>
              <CardHeader
                title={group.name}
                description={group.rows.length === 1 ? '1 test' : `${group.rows.length} tests`}
              />
              <ul>
                {group.rows.map((investigation) => (
                  <InvestigationRow
                    key={investigation.id}
                    investigation={investigation}
                    busy={update.isPending && update.variables?.id === investigation.id}
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

      <InvestigationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        investigation={editing}
        categories={categories}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this test?"
        body={
          <>
            <p className="text-text">&ldquo;{deletingName}&rdquo;</p>
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

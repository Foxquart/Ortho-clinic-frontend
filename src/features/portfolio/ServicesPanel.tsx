import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Plus, Stethoscope } from 'lucide-react'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { errorMessage } from '@/api/errors'
import { qk } from '@/lib/query'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog, DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Controls'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { PanelShell } from './PanelShell'
import {
  optionalText,
  reportMutationError,
  requiredText,
  sortOrderField,
  sortOrderValue,
  textValue,
  trimmedOrNull,
} from './cmsUtils'
import type { MessageResponse, ServiceCreate, ServiceResponse, ServiceUpdate } from '@/api/schema'

const schema = z.object({
  title: requiredText(128, 'Name the treatment or service'),
  description: optionalText(4000),
  icon_name: optionalText(64),
  is_active: z.boolean(),
  sort_order: sortOrderField,
})

type FormValues = z.infer<typeof schema>
const FIELDS = ['title', 'description', 'icon_name', 'sort_order'] as const

function ServiceSheet({
  service,
  open,
  onOpenChange,
}: {
  service: ServiceResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = service !== null

  const values = useMemo<FormValues>(
    () => ({
      title: service?.title ?? '',
      description: textValue(service?.description),
      icon_name: textValue(service?.icon_name),
      is_active: service?.is_active ?? true,
      sort_order: String(service?.sort_order ?? 0),
    }),
    [service],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values })

  useEffect(() => {
    if (open) reset(values)
  }, [open, values, reset])

  const isActive = watch('is_active')

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        title: v.title.trim(),
        description: trimmedOrNull(v.description),
        icon_name: trimmedOrNull(v.icon_name),
        is_active: v.is_active,
        sort_order: sortOrderValue(v.sort_order),
      }
      if (service) {
        return apiPatch<ServiceResponse>(
          endpoints.portfolio.serviceById(service.id),
          body satisfies ServiceUpdate,
        )
      }
      return apiPost<ServiceResponse>(endpoints.portfolio.services, body satisfies ServiceCreate)
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolio.services() })
      void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
      toast.success(isEdit ? `“${saved.title}” saved` : `“${saved.title}” added`)
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, FIELDS),
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={isEdit ? 'Edit service' : 'New service'}
        description="One card in the services list on the public website."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={isEdit && !isDirty}
              onClick={handleSubmit((v) => save.mutate(v))}
            >
              {isEdit ? 'Save service' : 'Add service'}
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
        >
          <Field label="Title" error={errors.title?.message} required>
            {(a) => <Input {...a} {...register('title')} autoFocus={!isEdit} />}
          </Field>

          <Field
            label="Description"
            hint="A short paragraph in plain language — patients read this, not referrers."
            error={errors.description?.message}
            optionalLabel
          >
            {(a) => <Textarea {...a} {...register('description')} rows={5} />}
          </Field>

          <Field
            label="Icon name"
            hint="A lucide icon name such as “bone” or “activity”. Left empty, the card shows no icon."
            error={errors.icon_name?.message}
            optionalLabel
          >
            {(a) => (
              <Input
                {...a}
                {...register('icon_name')}
                className="font-mono"
                autoCapitalize="off"
                spellCheck={false}
              />
            )}
          </Field>

          <Field label="Order" hint="Lower numbers come first." error={errors.sort_order?.message}>
            {(a) => (
              <Input {...a} {...register('sort_order')} inputMode="numeric" className="w-24" />
            )}
          </Field>

          <div className="rounded-lg border border-border p-3">
            <Switch
              id="service-active"
              checked={isActive}
              onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })}
              label="Shown on the website"
              description="Turn this off to keep the entry but hide it from patients."
            />
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

export function ServicesPanel({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ServiceResponse | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<ServiceResponse | null>(null)

  const services = useQuery({
    queryKey: qk.portfolio.services(),
    queryFn: () => apiGet<ServiceResponse[]>(endpoints.portfolio.services),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.portfolio.services() })
    void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
  }

  const setActive = useMutation({
    mutationFn: ({ service, is_active }: { service: ServiceResponse; is_active: boolean }) =>
      apiPatch<ServiceResponse>(endpoints.portfolio.serviceById(service.id), { is_active }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (service: ServiceResponse) =>
      apiDelete<MessageResponse>(endpoints.portfolio.serviceById(service.id)),
    onSuccess: (_result, service) => {
      invalidate()
      toast.success(`“${service.title}” deleted`)
      setDeleting(null)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const open = (service: ServiceResponse | null) => {
    setEditing(service)
    setSheetOpen(true)
  }

  const rows = services.data ?? []

  return (
    <>
      <PanelShell
        title="Services"
        description="The treatments listed on the public website's services section."
        action={
          canWrite && (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Plus aria-hidden className="size-4" />}
              onClick={() => open(null)}
            >
              New service
            </Button>
          )
        }
        isPending={services.isPending}
        error={services.isError ? services.error : null}
        onRetry={() => void services.refetch()}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            icon={<Stethoscope />}
            title="No services listed"
            description="These are the cards a patient reads to decide whether this clinic treats their problem — knee replacement, sports injuries, fracture care."
            action={
              canWrite && (
                <Button variant="primary" size="sm" onClick={() => open(null)}>
                  Add the first service
                </Button>
              )
            }
          />
        }
      >
        <ul className="divide-y divide-border/60">
          {rows.map((service) => (
            <li key={service.id} className="flex items-start gap-3 px-4 py-2.5">
              <span
                data-numeric
                className="mt-0.5 w-6 shrink-0 text-caption text-text-subtle"
                title="Sort order"
              >
                {service.sort_order}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-body font-medium text-text">{service.title}</span>
                  {!service.is_active && <Badge tone="neutral">Hidden</Badge>}
                </p>
                {service.description && (
                  <p className="mt-0.5 line-clamp-2 text-caption text-text-muted">
                    {service.description}
                  </p>
                )}
              </div>

              {service.icon_name && (
                <span className="hidden shrink-0 font-mono text-caption text-text-subtle sm:block">
                  {service.icon_name}
                </span>
              )}

              {canWrite && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${service.title}`}
                    >
                      <MoreHorizontal aria-hidden className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => open(service)}>Edit service…</MenuItem>
                    <MenuItem
                      onSelect={() => setActive.mutate({ service, is_active: !service.is_active })}
                    >
                      {service.is_active ? 'Hide from website' : 'Show on website'}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive onSelect={() => setDeleting(service)}>
                      Delete…
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </li>
          ))}
        </ul>
      </PanelShell>

      {canWrite && <ServiceSheet open={sheetOpen} onOpenChange={setSheetOpen} service={editing} />}

      {canWrite && deleting && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          destructive
          confirmLabel="Delete service"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          title={`Delete “${deleting.title}”?`}
          body="This removes the service from the website and from the database for good. Hide it instead if you might list it again."
        />
      )}
    </>
  )
}

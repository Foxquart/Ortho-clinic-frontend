import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MessageSquareQuote, MoreHorizontal, Plus, Star } from 'lucide-react'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { errorMessage } from '@/api/errors'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog, DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select, Switch, type SelectOption } from '@/components/ui/Controls'
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
import type {
  MessageResponse,
  TestimonialCreate,
  TestimonialResponse,
  TestimonialUpdate,
} from '@/api/schema'

const RATING_OPTIONS: readonly SelectOption[] = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: `${n} star${n === 1 ? '' : 's'}`,
}))

const schema = z.object({
  author_name: requiredText(128, 'Who said it?'),
  author_role: optionalText(128),
  content: z
    .string()
    .trim()
    .min(1, 'Paste what the patient wrote')
    .max(4000, 'Use at most 4000 characters'),
  rating: z.string(),
  is_published: z.boolean(),
  sort_order: sortOrderField,
})

type FormValues = z.infer<typeof schema>
const FIELDS = ['author_name', 'author_role', 'content', 'rating', 'sort_order'] as const

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn('size-3', n <= rating ? 'text-accent' : 'text-border-strong')}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

function TestimonialSheet({
  testimonial,
  open,
  onOpenChange,
}: {
  testimonial: TestimonialResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = testimonial !== null

  const values = useMemo<FormValues>(
    () => ({
      author_name: testimonial?.author_name ?? '',
      author_role: textValue(testimonial?.author_role),
      content: testimonial?.content ?? '',
      rating: String(testimonial?.rating ?? 5),
      is_published: testimonial?.is_published ?? true,
      sort_order: String(testimonial?.sort_order ?? 0),
    }),
    [testimonial],
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

  const rating = watch('rating')
  const isPublished = watch('is_published')

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        author_name: v.author_name.trim(),
        author_role: trimmedOrNull(v.author_role),
        content: v.content.trim(),
        rating: Number(v.rating),
        is_published: v.is_published,
        sort_order: sortOrderValue(v.sort_order),
      }
      if (testimonial) {
        return apiPatch<TestimonialResponse>(
          endpoints.portfolio.testimonialById(testimonial.id),
          body satisfies TestimonialUpdate,
        )
      }
      return apiPost<TestimonialResponse>(
        endpoints.portfolio.testimonials,
        body satisfies TestimonialCreate,
      )
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolio.testimonials() })
      void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
      toast.success(isEdit ? 'Testimonial saved' : `Testimonial from ${saved.author_name} added`)
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, FIELDS),
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={isEdit ? 'Edit testimonial' : 'New testimonial'}
        description="Published on the patient website exactly as written here."
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
              {isEdit ? 'Save testimonial' : 'Add testimonial'}
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
        >
          <Field label="Patient name" error={errors.author_name?.message} required>
            {(a) => <Input {...a} {...register('author_name')} autoFocus={!isEdit} />}
          </Field>

          <Field
            label="Description of the author"
            hint="e.g. “Knee replacement, 2024”. Publish only what the patient agreed to."
            error={errors.author_role?.message}
            optionalLabel
          >
            {(a) => <Input {...a} {...register('author_role')} />}
          </Field>

          <Field label="What they said" error={errors.content?.message} required>
            {(a) => <Textarea {...a} {...register('content')} rows={6} />}
          </Field>

          <Field label="Rating" error={errors.rating?.message}>
            {(a) => (
              <Select
                {...a}
                value={rating}
                onChange={(v) => setValue('rating', v, { shouldDirty: true })}
                options={RATING_OPTIONS}
                className="w-40"
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
              id="testimonial-published"
              checked={isPublished}
              onCheckedChange={(v) => setValue('is_published', v, { shouldDirty: true })}
              label="Published"
              description="Unpublish to take it off the website while keeping the record."
            />
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

export function TestimonialsPanel({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<TestimonialResponse | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<TestimonialResponse | null>(null)

  const testimonials = useQuery({
    queryKey: qk.portfolio.testimonials(),
    queryFn: () => apiGet<TestimonialResponse[]>(endpoints.portfolio.testimonials),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.portfolio.testimonials() })
    void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
  }

  const setPublished = useMutation({
    mutationFn: ({
      testimonial,
      is_published,
    }: {
      testimonial: TestimonialResponse
      is_published: boolean
    }) =>
      apiPatch<TestimonialResponse>(endpoints.portfolio.testimonialById(testimonial.id), {
        is_published,
      }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (testimonial: TestimonialResponse) =>
      apiDelete<MessageResponse>(endpoints.portfolio.testimonialById(testimonial.id)),
    onSuccess: (_result, testimonial) => {
      invalidate()
      toast.success(`Testimonial from ${testimonial.author_name} deleted`)
      setDeleting(null)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const open = (testimonial: TestimonialResponse | null) => {
    setEditing(testimonial)
    setSheetOpen(true)
  }

  const rows = testimonials.data ?? []

  return (
    <>
      <PanelShell
        title="Testimonials"
        description="Patient quotes shown on the public website."
        action={
          canWrite && (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Plus aria-hidden className="size-4" />}
              onClick={() => open(null)}
            >
              New testimonial
            </Button>
          )
        }
        isPending={testimonials.isPending}
        error={testimonials.isError ? testimonials.error : null}
        onRetry={() => void testimonials.refetch()}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            icon={<MessageSquareQuote />}
            title="No testimonials yet"
            description="Quotes from patients who agreed to be quoted appear on the public website, with their name and how long ago they were treated."
            action={
              canWrite && (
                <Button variant="primary" size="sm" onClick={() => open(null)}>
                  Add the first testimonial
                </Button>
              )
            }
          />
        }
      >
        <ul className="divide-y divide-border/60">
          {rows.map((testimonial) => (
            <li key={testimonial.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-body font-medium text-text">
                    {testimonial.author_name}
                  </span>
                  {testimonial.author_role && (
                    <span className="truncate text-caption text-text-subtle">
                      {testimonial.author_role}
                    </span>
                  )}
                  {!testimonial.is_published && <Badge tone="neutral">Unpublished</Badge>}
                </p>
                <p className="mt-1 line-clamp-2 text-caption text-text-muted">
                  “{testimonial.content}”
                </p>
              </div>

              <span className="mt-1 shrink-0">
                <Stars rating={testimonial.rating} />
              </span>

              {canWrite && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for the testimonial from ${testimonial.author_name}`}
                    >
                      <MoreHorizontal aria-hidden className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => open(testimonial)}>Edit testimonial…</MenuItem>
                    <MenuItem
                      onSelect={() =>
                        setPublished.mutate({
                          testimonial,
                          is_published: !testimonial.is_published,
                        })
                      }
                    >
                      {testimonial.is_published ? 'Unpublish' : 'Publish'}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive onSelect={() => setDeleting(testimonial)}>
                      Delete…
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </li>
          ))}
        </ul>
      </PanelShell>

      {canWrite && (
        <TestimonialSheet open={sheetOpen} onOpenChange={setSheetOpen} testimonial={editing} />
      )}

      {canWrite && deleting && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          destructive
          confirmLabel="Delete testimonial"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          title={`Delete the testimonial from ${deleting.author_name}?`}
          body="It is removed from the website and from the database for good. Unpublish it instead if you only want it off the site."
        />
      )}
    </>
  )
}

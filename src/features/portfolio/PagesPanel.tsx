import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FileText, MoreHorizontal, Plus } from 'lucide-react'
import { apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { errorMessage } from '@/api/errors'
import { qk } from '@/lib/query'
import { formatAgo } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Controls'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { PanelShell } from './PanelShell'
import { ImageUploadField } from './ImageUploadField'
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
  JsonObject,
  PortfolioPageCreate,
  PortfolioPageResponse,
  PortfolioPageUpdate,
} from '@/api/schema'

const schema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'A page needs a slug')
    .max(64, 'Use at most 64 characters')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
  title: requiredText(128, 'Give the page a title'),
  subtitle: optionalText(255),
  hero_image_url: optionalText(512),
  meta_title: optionalText(160),
  meta_description: optionalText(255),
  content: z.string().refine((v) => {
    if (v.trim() === '') return true
    try {
      const parsed: unknown = JSON.parse(v)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    } catch {
      return false
    }
  }, 'This must be a JSON object, e.g. {"sections": []}'),
  is_published: z.boolean(),
  sort_order: sortOrderField,
})

type FormValues = z.infer<typeof schema>
const FIELDS = [
  'slug',
  'title',
  'subtitle',
  'hero_image_url',
  'meta_title',
  'meta_description',
  'content',
  'sort_order',
] as const

function PageSheet({
  page,
  open,
  onOpenChange,
}: {
  /** `null` opens the sheet in create mode. */
  page: PortfolioPageResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = page !== null

  const values = useMemo<FormValues>(
    () => ({
      slug: page?.slug ?? '',
      title: page?.title ?? '',
      subtitle: textValue(page?.subtitle),
      hero_image_url: textValue(page?.hero_image_url),
      meta_title: textValue(page?.meta_title),
      meta_description: textValue(page?.meta_description),
      content: page?.content ? JSON.stringify(page.content, null, 2) : '',
      is_published: page?.is_published ?? true,
      sort_order: String(page?.sort_order ?? 0),
    }),
    [page],
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

  const heroImage = watch('hero_image_url')
  const isPublished = watch('is_published')

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const content =
        v.content.trim() === '' ? null : (JSON.parse(v.content) as JsonObject)
      const shared = {
        title: v.title.trim(),
        subtitle: trimmedOrNull(v.subtitle),
        hero_image_url: trimmedOrNull(v.hero_image_url),
        meta_title: trimmedOrNull(v.meta_title),
        meta_description: trimmedOrNull(v.meta_description),
        content,
        is_published: v.is_published,
        sort_order: sortOrderValue(v.sort_order),
      }
      if (page) {
        return apiPatch<PortfolioPageResponse>(
          endpoints.portfolio.pageById(page.id),
          shared satisfies PortfolioPageUpdate,
        )
      }
      return apiPost<PortfolioPageResponse>(endpoints.portfolio.pages, {
        ...shared,
        slug: v.slug.trim(),
      } satisfies PortfolioPageCreate)
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolio.pages() })
      void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
      toast.success(isEdit ? `“${saved.title}” saved` : `“${saved.title}” created`)
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, FIELDS),
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        width="max-w-xl"
        title={isEdit ? 'Edit page' : 'New page'}
        description={isEdit ? `/site/${page.slug}` : 'A standalone page on the patient website.'}
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
              {isEdit ? 'Save page' : 'Create page'}
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
            label="Slug"
            hint={
              isEdit
                ? 'The address is fixed once a page exists, so links already sent to patients keep working.'
                : 'The address on the public site, e.g. “knee-replacement”. It cannot be changed later.'
            }
            error={errors.slug?.message}
            required
          >
            {(a) => (
              <Input
                {...a}
                {...register('slug')}
                className="font-mono"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={isEdit}
              />
            )}
          </Field>

          <Field label="Subtitle" error={errors.subtitle?.message} optionalLabel>
            {(a) => <Input {...a} {...register('subtitle')} />}
          </Field>

          <Field label="Hero image" error={errors.hero_image_url?.message} optionalLabel>
            {(a) => (
              <ImageUploadField
                {...a}
                value={heroImage}
                onChange={(url) => setValue('hero_image_url', url, { shouldDirty: true })}
              />
            )}
          </Field>

          <Field
            label="Search-engine title"
            hint="Shown in Google results. Falls back to the page title."
            error={errors.meta_title?.message}
            optionalLabel
          >
            {(a) => <Input {...a} {...register('meta_title')} />}
          </Field>

          <Field
            label="Search-engine description"
            error={errors.meta_description?.message}
            optionalLabel
          >
            {(a) => <Textarea {...a} {...register('meta_description')} rows={2} />}
          </Field>

          <Field
            label="Content (JSON)"
            hint="The API stores the page body as a free-form JSON object with no declared shape, so it is edited raw here rather than pretending to be a document editor."
            error={errors.content?.message}
            optionalLabel
          >
            {(a) => (
              <Textarea
                {...a}
                {...register('content')}
                rows={8}
                spellCheck={false}
                className="font-mono text-caption"
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
              id="page-published"
              checked={isPublished}
              onCheckedChange={(v) => setValue('is_published', v, { shouldDirty: true })}
              label="Published"
              description="Pages cannot be deleted — unpublish one to take it off the website."
            />
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

export function PagesPanel({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PortfolioPageResponse | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const pages = useQuery({
    queryKey: qk.portfolio.pages(),
    queryFn: () => apiGet<PortfolioPageResponse[]>(endpoints.portfolio.pages),
  })

  const setPublished = useMutation({
    mutationFn: ({ page, is_published }: { page: PortfolioPageResponse; is_published: boolean }) =>
      apiPatch<PortfolioPageResponse>(endpoints.portfolio.pageById(page.id), { is_published }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolio.pages() })
      void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
      toast.success(updated.is_published ? `“${updated.title}” is live` : `“${updated.title}” hidden`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const open = (page: PortfolioPageResponse | null) => {
    setEditing(page)
    setSheetOpen(true)
  }

  const rows = pages.data ?? []

  return (
    <>
      <PanelShell
        title="Pages"
        description="Standalone pages on the patient website — “About the clinic”, “What to expect”, directions."
        action={
          canWrite && (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Plus aria-hidden className="size-4" />}
              onClick={() => open(null)}
            >
              New page
            </Button>
          )
        }
        isPending={pages.isPending}
        error={pages.isError ? pages.error : null}
        onRetry={() => void pages.refetch()}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            icon={<FileText />}
            title="No pages yet"
            description="Each page here becomes an address on the public website that patients can open and share — the clinic story, preparation notes, insurance details."
            action={
              canWrite && (
                <Button variant="primary" size="sm" onClick={() => open(null)}>
                  Create the first page
                </Button>
              )
            }
          />
        }
      >
        <ul className="divide-y divide-border/60">
          {rows.map((page) => (
            <li key={page.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-body font-medium text-text">{page.title}</span>
                  {!page.is_published && <Badge tone="neutral">Draft</Badge>}
                </p>
                <p className="mt-0.5 truncate font-mono text-caption text-text-subtle">
                  /site/{page.slug}
                </p>
              </div>

              <p className="hidden shrink-0 text-caption text-text-muted sm:block">
                edited {formatAgo(page.updated_at)}
              </p>

              {canWrite && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${page.title}`}>
                      <MoreHorizontal aria-hidden className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => open(page)}>Edit page…</MenuItem>
                    <MenuItem
                      onSelect={() =>
                        setPublished.mutate({ page, is_published: !page.is_published })
                      }
                    >
                      {page.is_published ? 'Unpublish' : 'Publish'}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </li>
          ))}
        </ul>
      </PanelShell>

      {canWrite && <PageSheet open={sheetOpen} onOpenChange={setSheetOpen} page={editing} />}
    </>
  )
}

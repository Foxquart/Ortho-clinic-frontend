import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Images, MoreHorizontal, Plus } from 'lucide-react'
import { apiDelete, apiGet, apiPatch, apiPost, resolveApiUrl } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { errorMessage } from '@/api/errors'
import { qk } from '@/lib/query'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog, DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Controls'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { PanelShell } from './PanelShell'
import { ImageUploadField } from './ImageUploadField'
import {
  optionalText,
  reportMutationError,
  sortOrderField,
  sortOrderValue,
  textValue,
  trimmedOrNull,
} from './cmsUtils'
import type {
  GalleryImageCreate,
  GalleryImageResponse,
  GalleryImageUpdate,
  MessageResponse,
} from '@/api/schema'

const schema = z.object({
  image_url: z
    .string()
    .trim()
    .min(1, 'Upload an image or paste the path of one')
    .max(512, 'Use at most 512 characters'),
  caption: optionalText(255),
  alt_text: optionalText(255),
  is_published: z.boolean(),
  sort_order: sortOrderField,
})

type FormValues = z.infer<typeof schema>
const FIELDS = ['image_url', 'caption', 'alt_text', 'sort_order'] as const

function GallerySheet({
  image,
  open,
  onOpenChange,
}: {
  image: GalleryImageResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = image !== null

  const values = useMemo<FormValues>(
    () => ({
      image_url: image?.image_url ?? '',
      caption: textValue(image?.caption),
      alt_text: textValue(image?.alt_text),
      is_published: image?.is_published ?? true,
      sort_order: String(image?.sort_order ?? 0),
    }),
    [image],
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

  const imageUrl = watch('image_url')
  const isPublished = watch('is_published')

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        image_url: v.image_url.trim(),
        caption: trimmedOrNull(v.caption),
        alt_text: trimmedOrNull(v.alt_text),
        is_published: v.is_published,
        sort_order: sortOrderValue(v.sort_order),
      }
      if (image) {
        return apiPatch<GalleryImageResponse>(
          endpoints.portfolio.galleryById(image.id),
          body satisfies GalleryImageUpdate,
        )
      }
      return apiPost<GalleryImageResponse>(
        endpoints.portfolio.gallery,
        body satisfies GalleryImageCreate,
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.portfolio.gallery() })
      void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
      toast.success(isEdit ? 'Image saved' : 'Image added to the gallery')
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, FIELDS),
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={isEdit ? 'Edit image' : 'Add an image'}
        description="Shown in the clinic gallery on the public website."
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
              {isEdit ? 'Save image' : 'Add image'}
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
        >
          <Field label="Image" error={errors.image_url?.message} required>
            {(a) => (
              <ImageUploadField
                {...a}
                value={imageUrl}
                onChange={(url) =>
                  setValue('image_url', url, { shouldDirty: true, shouldValidate: true })
                }
              />
            )}
          </Field>

          <Field
            label="Caption"
            hint="Printed under the photo on the website."
            error={errors.caption?.message}
            optionalLabel
          >
            {(a) => <Input {...a} {...register('caption')} />}
          </Field>

          <Field
            label="Alternative text"
            hint="Describes the photo for patients using a screen reader, and shows if the image fails to load."
            error={errors.alt_text?.message}
            optionalLabel
          >
            {(a) => <Input {...a} {...register('alt_text')} />}
          </Field>

          <Field label="Order" hint="Lower numbers come first." error={errors.sort_order?.message}>
            {(a) => (
              <Input {...a} {...register('sort_order')} inputMode="numeric" className="w-24" />
            )}
          </Field>

          <div className="rounded-lg border border-border p-3">
            <Switch
              id="gallery-published"
              checked={isPublished}
              onCheckedChange={(v) => setValue('is_published', v, { shouldDirty: true })}
              label="Published"
              description="Unpublish to take the photo off the website without deleting it."
            />
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

export function GalleryPanel({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<GalleryImageResponse | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<GalleryImageResponse | null>(null)

  const gallery = useQuery({
    queryKey: qk.portfolio.gallery(),
    queryFn: () => apiGet<GalleryImageResponse[]>(endpoints.portfolio.gallery),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.portfolio.gallery() })
    void queryClient.invalidateQueries({ queryKey: qk.public.portfolio() })
  }

  const setPublished = useMutation({
    mutationFn: ({ image, is_published }: { image: GalleryImageResponse; is_published: boolean }) =>
      apiPatch<GalleryImageResponse>(endpoints.portfolio.galleryById(image.id), { is_published }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (image: GalleryImageResponse) =>
      apiDelete<MessageResponse>(endpoints.portfolio.galleryById(image.id)),
    onSuccess: () => {
      invalidate()
      toast.success('Image deleted')
      setDeleting(null)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const open = (image: GalleryImageResponse | null) => {
    setEditing(image)
    setSheetOpen(true)
  }

  const rows = gallery.data ?? []

  return (
    <>
      <PanelShell
        title="Gallery"
        description="Photographs of the clinic, the theatre and the equipment."
        action={
          canWrite && (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Plus aria-hidden className="size-4" />}
              onClick={() => open(null)}
            >
              Add image
            </Button>
          )
        }
        isPending={gallery.isPending}
        error={gallery.isError ? gallery.error : null}
        onRetry={() => void gallery.refetch()}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            icon={<Images />}
            title="The gallery is empty"
            description="Photos here are what a patient sees before their first visit — the waiting room, the building, the equipment. Nothing clinical or identifiable."
            action={
              canWrite && (
                <Button variant="primary" size="sm" onClick={() => open(null)}>
                  Add the first image
                </Button>
              )
            }
          />
        }
      >
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((image) => (
            <li
              key={image.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="relative aspect-4/3 bg-bg">
                <img
                  src={resolveApiUrl(image.image_url)}
                  alt={image.alt_text ?? ''}
                  className="size-full object-cover"
                />
                {!image.is_published && (
                  <span className="absolute left-1.5 top-1.5">
                    <Badge tone="neutral">Unpublished</Badge>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 px-2 py-1.5">
                <span data-numeric className="shrink-0 text-caption text-text-subtle">
                  {image.sort_order}
                </span>
                <p className="min-w-0 flex-1 truncate text-caption text-text-muted">
                  {image.caption || <span className="text-text-subtle">No caption</span>}
                </p>

                {canWrite && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${image.caption || image.image_url}`}
                      >
                        <MoreHorizontal aria-hidden className="size-4" />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => open(image)}>Edit image…</MenuItem>
                      <MenuItem
                        onSelect={() =>
                          setPublished.mutate({ image, is_published: !image.is_published })
                        }
                      >
                        {image.is_published ? 'Unpublish' : 'Publish'}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive onSelect={() => setDeleting(image)}>
                        Delete…
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </div>
            </li>
          ))}
        </ul>
      </PanelShell>

      {canWrite && <GallerySheet open={sheetOpen} onOpenChange={setSheetOpen} image={editing} />}

      {canWrite && deleting && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          destructive
          confirmLabel="Delete image"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          title={deleting.caption ? `Delete “${deleting.caption}”?` : 'Delete this image?'}
          body="The entry is removed from the gallery for good. The uploaded file itself stays on the server."
        />
      )}
    </>
  )
}

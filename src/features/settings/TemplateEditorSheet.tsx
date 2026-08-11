import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Printer } from 'lucide-react'
import { apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/Button'
import { DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Controls'
import { optionalText, reportMutationError, requiredText, textValue } from './formUtils'
import type {
  PrescriptionTemplateCreate,
  PrescriptionTemplateResponse,
  PrescriptionTemplateUpdate,
} from '@/api/schema'

const schema = z.object({
  name: requiredText(128, 'Give the template a name'),
  description: optionalText(2000),
  header_html: z.string(),
  footer_html: z.string(),
  is_default: z.boolean(),
  is_active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const FIELDS = ['name', 'description', 'header_html', 'footer_html'] as const

const EDITOR_CLASS = 'font-mono text-caption leading-relaxed'

/** What the two HTML blocks will look like with a prescription between them. */
function PrintPreview({ header, footer }: { header: string; footer: string }) {
  const html = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<style>body{margin:0;padding:14px 16px;background:#fff;color:#111;` +
      `font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}` +
      `img{max-width:100%}` +
      `.__body{margin:10px 0;padding:22px 10px;border:1px dashed #c9c9c9;color:#8a8a8a;` +
      `text-align:center;font-size:11px;letter-spacing:.04em;text-transform:uppercase}` +
      `</style></head><body>${header}` +
      `<div class="__body">Prescription content prints here</div>${footer}</body></html>`,
    [header, footer],
  )

  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <p className="mb-2 flex items-center gap-1.5 text-micro uppercase text-text-subtle">
        <Printer aria-hidden className="size-3.5" />
        A4 preview
      </p>
      <iframe
        title="Print header and footer preview"
        sandbox=""
        srcDoc={html}
        className="h-64 w-full rounded-md border border-border bg-white"
      />
    </div>
  )
}

export function TemplateEditorSheet({
  open,
  onOpenChange,
  template,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` opens the sheet in create mode. */
  template: PrescriptionTemplateResponse | null
}) {
  const queryClient = useQueryClient()
  const isEdit = template !== null

  const values = useMemo<FormValues>(
    () => ({
      name: template?.name ?? '',
      description: textValue(template?.description),
      header_html: textValue(template?.header_html),
      footer_html: textValue(template?.footer_html),
      is_default: template?.is_default ?? false,
      is_active: template?.is_active ?? true,
    }),
    [template],
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

  const isDefault = watch('is_default')
  const isActive = watch('is_active')
  const header = useDebouncedValue(watch('header_html'), 250)
  const footer = useDebouncedValue(watch('footer_html'), 250)

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const shared = {
        name: v.name.trim(),
        description: v.description.trim() === '' ? null : v.description.trim(),
        header_html: v.header_html === '' ? null : v.header_html,
        footer_html: v.footer_html === '' ? null : v.footer_html,
        is_default: v.is_default,
      }
      if (template) {
        const body: PrescriptionTemplateUpdate = { ...shared, is_active: v.is_active }
        return apiPatch<PrescriptionTemplateResponse>(
          endpoints.clinic.templateById(template.id),
          body,
        )
      }
      const body: PrescriptionTemplateCreate = shared
      return apiPost<PrescriptionTemplateResponse>(endpoints.clinic.templates, body)
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.clinic.templates() })
      toast.success(isEdit ? `“${saved.name}” saved` : `“${saved.name}” created`)
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, FIELDS),
  })

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) reset(values)
        onOpenChange(next)
      }}
    >
      <SheetContent
        width="max-w-2xl"
        title={isEdit ? 'Edit print template' : 'New print template'}
        description="The HTML below is printed on paper, above and below every prescription."
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
              {isEdit ? 'Save template' : 'Create template'}
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-5"
        >
          <Field label="Template name" error={errors.name?.message} required>
            {(a) => <Input {...a} {...register('name')} autoFocus={!isEdit} />}
          </Field>

          <Field
            label="Description"
            hint="For staff only — never printed."
            error={errors.description?.message}
            optionalLabel
          >
            {(a) => <Textarea {...a} {...register('description')} rows={2} />}
          </Field>

          <PrintPreview header={header} footer={footer} />

          <Field
            label="Header HTML"
            hint="Raw HTML. It is printed exactly as written at the top of every page — no editor, no autocorrect, no sanitising."
            error={errors.header_html?.message}
            optionalLabel
          >
            {(a) => (
              <Textarea
                {...a}
                {...register('header_html')}
                rows={10}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className={EDITOR_CLASS}
              />
            )}
          </Field>

          <Field
            label="Footer HTML"
            hint="Printed under the signature line on every page."
            error={errors.footer_html?.message}
            optionalLabel
          >
            {(a) => (
              <Textarea
                {...a}
                {...register('footer_html')}
                rows={8}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className={EDITOR_CLASS}
              />
            )}
          </Field>

          <div className="flex flex-col gap-4 rounded-lg border border-border p-3">
            <Switch
              id="template-default"
              checked={isDefault}
              onCheckedChange={(v) => setValue('is_default', v, { shouldDirty: true })}
              label="Use as the default template"
              description="Every new prescription prints with this one."
            />
            {isEdit && (
              <Switch
                id="template-active"
                checked={isActive}
                onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })}
                label="Available for use"
                description="Templates cannot be deleted — turn this off to retire one."
              />
            )}
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

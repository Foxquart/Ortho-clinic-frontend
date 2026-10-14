import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import type { PrescriptionTemplateResponse } from '@/api/schema'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Controls'
import { ConfirmDialog, DialogClose, DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { useCreateTemplate, useTemplates } from '@/features/templates/useTemplates'
import { hasTemplateContent, templateFromDraft, type RxDraft } from './model'
import { TAP_TARGET } from './Provenance'

const TEMPLATE_SELECT_ID = 'rx-template'

/**
 * Apply a saved template to the pad, or save the pad as one.
 *
 * Applying never touches the patient or vitals (see `applyTemplate`), and asks
 * first when the pad already holds something a template would overwrite.
 */
export function RxTemplatePicker({
  draft,
  onApply,
}: {
  draft: RxDraft
  onApply: (template: PrescriptionTemplateResponse) => void
}) {
  const templates = useTemplates()
  const create = useCreateTemplate()
  const [confirming, setConfirming] = useState<PrescriptionTemplateResponse | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string>()

  const list = templates.data ?? []

  const choose = (id: string) => {
    const template = list.find((t) => t.id === id)
    if (!template) return
    if (hasTemplateContent(draft)) setConfirming(template)
    else onApply(template)
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const body = templateFromDraft(draft, name)
    if (!body.name) return
    setNameError(undefined)
    create.mutate(body, {
      onSuccess: () => {
        setNaming(false)
        const left = draft.rows.length - (body.items?.length ?? 0)
        toast.success(
          `Saved template “${body.name}”` +
            (left > 0
              ? ` — ${left} medicine${left === 1 ? '' : 's'} without a formulary match or frequency left out.`
              : ''),
        )
      },
      // A duplicate name (409) lands here too; the message names the problem.
      onError: (error) => setNameError(errorMessage(error)),
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-sm">
          <label htmlFor={TEMPLATE_SELECT_ID} className="text-label text-text-muted">
            Template
          </label>
          <Select
            id={TEMPLATE_SELECT_ID}
            // Always blank: the select is a one-shot action, and re-picking the
            // same template must fire again.
            value=""
            onChange={choose}
            options={list.map((t) => ({
              value: t.id,
              label: t.name,
              description: `${t.items.length} medicine${t.items.length === 1 ? '' : 's'}`,
            }))}
            placeholder={
              templates.isPending
                ? 'Loading…'
                : list.length === 0
                  ? 'No templates yet'
                  : 'Fill from a template…'
            }
            disabled={list.length === 0}
            className={TAP_TARGET}
          />
        </div>
        <Button
          variant="secondary"
          className={TAP_TARGET}
          iconLeft={<BookmarkPlus className="size-4" />}
          disabled={!hasTemplateContent(draft)}
          onClick={() => {
            setName('')
            setNameError(undefined)
            setNaming(true)
          }}
        >
          Save as template
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming ? `Apply “${confirming.name}”?` : 'Apply template?'}
        body="What the template fills in replaces what is already on the pad, and its medicines replace the ones listed. The patient and vitals are not touched."
        confirmLabel="Apply template"
        onConfirm={() => {
          if (confirming) onApply(confirming)
          setConfirming(null)
        }}
      />

      <DialogRoot open={naming} onOpenChange={setNaming}>
        <DialogContent
          size="sm"
          title="Save as template"
          description="Saves everything on the pad except the patient and vitals."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button
                type="submit"
                form="rx-template-form"
                variant="primary"
                loading={create.isPending}
                disabled={!name.trim()}
              >
                Save template
              </Button>
            </>
          }
        >
          <form id="rx-template-form" noValidate onSubmit={save}>
            <Field label="Template name" error={nameError}>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  maxLength={128}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

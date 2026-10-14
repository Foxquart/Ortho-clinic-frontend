import { useCallback, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Copy, FileStack, Pencil, Plus, Trash2 } from 'lucide-react'
import { errorMessage } from '@/api/errors'
import { cn } from '@/lib/cn'
import { listItem, listStagger, useReducedMotionSafe } from '@/lib/motion'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Surface'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import type { PrescriptionTemplateResponse } from '@/api/schema'
import { TemplateEditor, TemplateRing } from './TemplateEditor'
import { useDeleteTemplate, useTemplates } from './useTemplates'

/* -------------------------------------------------------------------------- */
/*  Cards                                                                     */
/* -------------------------------------------------------------------------- */

function editedAgo(iso: string): string {
  const days = differenceInCalendarDays(new Date(), parseISO(iso))
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'Edited today'
  if (days === 1) return 'Edited yesterday'
  if (days < 30) return `Edited ${days} days ago`
  const months = Math.floor(days / 30)
  return `Edited ${months} ${months === 1 ? 'month' : 'months'} ago`
}

/* Lifts on hover, presses in under a finger. Only the properties that change
   are transitioned, and the movement is dropped for reduced motion. */
const TACTILE =
  'duration-base ease-out-quint transition-[transform,box-shadow,border-color] ' +
  'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md ' +
  'active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none'

function NewTemplateCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        TACTILE,
        'border-accent/50 bg-accent-muted/40 flex h-full min-h-28 w-full sm:min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-4',
        'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none',
      )}
    >
      <span className="bg-accent text-accent-fg grid size-12 place-items-center rounded-full shadow-sm">
        <Plus aria-hidden className="size-6" />
      </span>
      <span className="text-body text-text font-semibold">New template</span>
    </button>
  )
}

function TemplateCard({
  template,
  onEdit,
  onCopy,
  onDelete,
}: {
  template: PrescriptionTemplateResponse
  onEdit: (template: PrescriptionTemplateResponse) => void
  onCopy: (template: PrescriptionTemplateResponse) => void
  onDelete: (template: PrescriptionTemplateResponse) => void
}) {
  const names = template.items.map((item) => item.medicine_name ?? 'Removed medicine')
  const shown = names.slice(0, 3)
  const subtitle = template.diagnosis ?? template.chief_complaint
  const meta = [
    template.items.length === 1 ? '1 medicine' : `${template.items.length} medicines`,
    template.follow_up_days !== null && `Follow-up in ${template.follow_up_days} days`,
  ].filter(Boolean)

  return (
    <div
      className={cn(
        TACTILE,
        'border-border bg-surface group relative flex h-full flex-col gap-3 rounded-xl border p-4 shadow-sm',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* The name is the card's one big target: its pseudo-element covers the
              whole card, and Copy / Delete sit above it. */}
          <button
            type="button"
            aria-label={`Edit ${template.name}`}
            onClick={() => onEdit(template)}
            className={cn(
              'text-body text-text flex items-start gap-1.5 text-left font-semibold text-balance',
              'after:absolute after:inset-0 after:rounded-xl after:content-[""]',
              'focus-visible:after:ring-accent/40 focus-visible:outline-none focus-visible:after:ring-2',
            )}
          >
            <span className="line-clamp-2 min-w-0 break-words">{template.name}</span>
            <Pencil
              aria-hidden
              className="text-text-subtle group-hover:text-accent mt-1 size-3.5 shrink-0 transition-colors"
            />
          </button>
          {subtitle && <p className="text-caption text-text-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
        <TemplateRing template={template} size={40} />
      </div>

      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {shown.map((name, index) => (
            <li
              key={index}
              className="bg-bg-sunken text-text-muted text-caption max-w-full truncate rounded-full px-2.5 py-0.5"
            >
              {name}
            </li>
          ))}
          {names.length > shown.length && (
            <li className="text-caption text-text-subtle px-1 py-0.5">
              +{names.length - shown.length}
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-1">
        <p className="text-caption text-text-muted">{meta.join(' · ')}</p>
        <p className="text-caption text-text-subtle">{editedAgo(template.updated_at)}</p>
      </div>

      <div className="relative z-10 -mx-1 -mb-1 flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-tap sm:min-h-0"
          iconLeft={<Copy className="size-3.5" />}
          aria-label={`Copy ${template.name}`}
          onClick={() => onCopy(template)}
        >
          Copy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-muted hover:text-danger min-h-tap sm:min-h-0"
          iconLeft={<Trash2 className="size-3.5" />}
          aria-label={`Delete ${template.name}`}
          onClick={() => onDelete(template)}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Screen                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The doctor's prescription templates as cards: a big "new" card first, then
 * one tactile card per template. Tap a card to edit, Copy to start a new one
 * from it, Delete (with a confirm) to remove it. Never patient data.
 */
export function TemplatesScreen() {
  const view = useTemplates()
  const remove = useDeleteTemplate()
  const reduced = useReducedMotionSafe()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<PrescriptionTemplateResponse | null>(null)
  const [startFrom, setStartFrom] = useState<PrescriptionTemplateResponse | null>(null)
  const [deleting, setDeleting] = useState<PrescriptionTemplateResponse | null>(null)
  // Held separately so the dialog keeps the name during its exit animation.
  const [deletingName, setDeletingName] = useState('')

  const templates = view.data ?? []

  const openEditor = useCallback(
    (template: PrescriptionTemplateResponse | null, from: PrescriptionTemplateResponse | null) => {
      setEditing(template)
      setStartFrom(from)
      setEditorOpen(true)
    },
    [],
  )

  const askDelete = useCallback((template: PrescriptionTemplateResponse) => {
    setDeletingName(template.name)
    setDeleting(template)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null)
        toast.success('Template deleted')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }, [deleting, remove])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Templates"
        description={templates.length > 0 ? 'Saved starting points for the prescription pad.' : undefined}
      />

      {view.isPending ? (
        <Card>
          <SkeletonRows rows={4} className="py-2" />
        </Card>
      ) : view.isError ? (
        <ErrorState error={view.error} onRetry={() => void view.refetch()} />
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileStack />}
            title="No templates yet"
            description="Save the prescriptions you write again and again, then fill them in on the pad with one tap."
            action={
              <Button
                variant="primary"
                size="lg"
                iconLeft={<Plus className="size-4" />}
                className="min-h-tap"
                onClick={() => openEditor(null, null)}
              >
                New template
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.ul
          variants={listStagger}
          initial={reduced ? false : 'hidden'}
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <motion.li variants={listItem}>
            <NewTemplateCard onClick={() => openEditor(null, null)} />
          </motion.li>
          {templates.map((template) => (
            <motion.li key={template.id} variants={listItem}>
              <TemplateCard
                template={template}
                onEdit={(t) => openEditor(t, null)}
                onCopy={(t) => openEditor(null, t)}
                onDelete={askDelete}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editing}
        startFrom={startFrom}
        templates={templates}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this template?"
        body={
          <>
            <p className="text-text">&ldquo;{deletingName}&rdquo;</p>
            <p className="mt-2">This removes it for good. Prescriptions already written are not changed.</p>
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

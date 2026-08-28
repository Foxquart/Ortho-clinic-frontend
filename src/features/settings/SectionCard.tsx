import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { cn } from '@/lib/cn'

/**
 * Every input, textarea and select a section holds is 32px tall — the density
 * a settings page wants on a desk, eight pixels under what a fingertip needs.
 * Raised once from the form root instead of field by field: these sections
 * carry twenty-odd fields between them, and a per-field class is a per-field
 * chance to forget one.
 */
const TOUCH_FIELDS =
  'max-sm:[&_input]:min-h-tap max-sm:[&_textarea]:min-h-tap max-sm:[&_[role=combobox]]:min-h-tap'

/**
 * One settings section: its own form, its own dirty state, its own save.
 * A single page-wide save button hides which of five unrelated things you are
 * about to write, so every section commits on its own.
 */
export function SectionCard({
  title,
  description,
  canWrite,
  isDirty,
  isSaving,
  onSubmit,
  onDiscard,
  children,
  bodyClassName,
  readOnlyNote = 'Only an administrator can change these details.',
}: {
  title: React.ReactNode
  description?: React.ReactNode
  canWrite: boolean
  isDirty: boolean
  isSaving: boolean
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onDiscard: () => void
  children: React.ReactNode
  bodyClassName?: string
  readOnlyNote?: string
}) {
  return (
    <Card>
      <form noValidate onSubmit={onSubmit} className={TOUCH_FIELDS}>
        <CardHeader title={title} description={description} />
        <CardBody className={cn('grid gap-4', bodyClassName)}>{children}</CardBody>

        {canWrite ? (
          /* Wraps, because "Unsaved changes" plus two buttons is wider than a
             320px card and a non-wrapping row would simply hold the card open
             at that width. Save is the point of the section, so on a phone the
             pair takes the whole line at full tap height. */
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            <p
              aria-live="polite"
              className="mr-auto flex items-center gap-2 text-caption text-text-muted"
            >
              {isDirty && (
                <>
                  <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                  Unsaved changes
                </>
              )}
            </p>
            <Button
              variant="ghost"
              className="min-h-tap flex-1 sm:min-h-0 sm:flex-none"
              onClick={onDiscard}
              disabled={!isDirty || isSaving}
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-h-tap flex-1 sm:min-h-0 sm:flex-none"
              loading={isSaving}
              disabled={!isDirty}
            >
              Save
            </Button>
          </div>
        ) : (
          <p className="border-t border-border px-4 py-2.5 text-caption text-text-subtle">
            {readOnlyNote}
          </p>
        )}
      </form>
    </Card>
  )
}

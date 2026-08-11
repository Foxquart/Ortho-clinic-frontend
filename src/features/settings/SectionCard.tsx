import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { cn } from '@/lib/cn'

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
      <form noValidate onSubmit={onSubmit}>
        <CardHeader title={title} description={description} />
        <CardBody className={cn('grid gap-4', bodyClassName)}>{children}</CardBody>

        {canWrite ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
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
            <Button variant="ghost" onClick={onDiscard} disabled={!isDirty || isSaving}>
              Discard
            </Button>
            <Button type="submit" variant="primary" loading={isSaving} disabled={!isDirty}>
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

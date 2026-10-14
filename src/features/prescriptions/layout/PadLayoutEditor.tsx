import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Lock,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button, type ButtonProps } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Controls'
import { ConfirmDialog, DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { customKey, defaultLabel, defaultSections, dropNear, shift } from './padLayoutModel'
import {
  MAX_LABEL,
  MAX_SECTIONS,
  isCustomKey,
  usePadLayout,
  useSavePadLayout,
  type PadLayoutSection,
} from './usePadLayout'

type Confirm = { type: 'delete'; key: string } | { type: 'discard' } | null
type Drop = { key: string; after: boolean } | null

/** Icon buttons are 28px at a desk and 40px under a thumb. */
const ICON_BTN = 'max-sm:size-10'

/**
 * The layout editor: which sections the pad and the printed prescription show,
 * in what order, under what name, plus the doctor's own sections.
 *
 * Edits live in a local draft until Save. `draft === null` means "nothing
 * changed", so the list reads straight from the saved layout and a fresh open
 * can never show stale edits.
 */
export function PadLayoutEditor({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const layout = usePadLayout()
  const save = useSavePadLayout()

  const [draft, setDraft] = useState<PadLayoutSection[] | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop>(null)
  const [newLabel, setNewLabel] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const listRef = useRef<HTMLUListElement>(null)
  const refocus = useRef<{ key: string; dir: 'up' | 'down' } | null>(null)

  const saved = layout.data?.sections
  const sections = draft ?? saved ?? []
  const savedKeys = new Set(saved?.map((s) => s.key))
  const hasBlank = sections.some((s) => !s.label.trim())
  const atDefault = JSON.stringify(sections) === JSON.stringify(defaultSections())
  const shown = sections.filter((s) => s.visible)
  const customToDelete =
    confirm?.type === 'delete' ? sections.find((s) => s.key === confirm.key) : undefined

  const say = (text: string) => setAnnouncement(text)

  // Reordering re-parents the row, which drops focus in some browsers; put it
  // back on the same arrow (or the other one when this one just hit the edge).
  useLayoutEffect(() => {
    const target = refocus.current
    if (!target) return
    refocus.current = null
    const row = listRef.current?.querySelector(`[data-key="${target.key}"]`)
    const button =
      row?.querySelector<HTMLButtonElement>(`[data-move="${target.dir}"]:not(:disabled)`) ??
      row?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)')
    button?.focus()
  }, [draft])

  useEffect(() => {
    if (!justAdded) return
    listRef.current
      ?.querySelector(`[data-key="${justAdded}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [justAdded])

  const move = (key: string, dir: 'up' | 'down') => {
    const next = shift(sections, key, dir === 'up' ? -1 : 1)
    const at = next.findIndex((s) => s.key === key) + 1
    refocus.current = { key, dir }
    setJustAdded(null)
    setDraft(next)
    say(`${next[at - 1]?.label} moved to position ${at} of ${next.length}`)
  }

  const patch = (key: string, change: Partial<PadLayoutSection>) =>
    setDraft(sections.map((s) => (s.key === key ? { ...s, ...change } : s)))

  const remove = (key: string) => {
    say(`${sections.find((s) => s.key === key)?.label} deleted`)
    setDraft(sections.filter((s) => s.key !== key))
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const label = newLabel.trim().slice(0, MAX_LABEL)
    if (!label || sections.length >= MAX_SECTIONS) return
    const key = customKey(
      label,
      sections.map((s) => s.key),
    )
    setDraft([...sections, { key, label, visible: true }])
    setJustAdded(key)
    setNewLabel('')
    say(`${label} added at the end`)
  }

  const requestClose = () => {
    if (draft) setConfirm({ type: 'discard' })
    else onOpenChange(false)
  }

  const submit = () => {
    save.mutate(
      { sections: sections.map((s) => ({ ...s, label: s.label.trim() })) },
      {
        onSuccess: () => {
          toast.success('Layout saved')
          setDraft(null)
          onOpenChange(false)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  /* ---------------------------- drag and drop ----------------------------- */

  const afterOf = (e: React.DragEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return e.clientY > box.top + box.height / 2
  }

  const endDrag = () => {
    setDrag(null)
    setDrop(null)
  }

  return (
    <>
      <DialogRoot open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogContent
          size="lg"
          title="Customize layout"
          description={
            <>
              Choose what the pad and the printed prescription show, and in what order. Click a name to rename it.
              <span lang="bn" className="text-text-subtle mt-0.5 block">
                যেটা লাগে না, বন্ধ করে দিন
              </span>
            </>
          }
          footer={
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                aria-label="Reset to default"
                iconLeft={<RotateCcw aria-hidden className="size-4" />}
                disabled={atDefault || !layout.data}
                onClick={() => {
                  setJustAdded(null)
                  setDraft(defaultSections())
                  say('Layout reset to default')
                }}
              >
                <span>
                  Reset<span className="max-sm:hidden"> to default</span>
                </span>
              </Button>
              <Button variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                // Nothing to save reads as a plain disabled button, not a faded call to action.
                variant={draft && !hasBlank ? 'primary' : 'secondary'}
                loading={save.isPending}
                disabled={!draft || hasBlank}
                onClick={submit}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="grid gap-5 pt-1 md:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="flex min-w-0 flex-col gap-4">
              {layout.isError && !saved ? (
                <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />
              ) : layout.isPending ? (
                <div aria-hidden className="flex flex-col gap-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : (
                <ul
                  ref={listRef}
                  aria-label="Sections, in printed order"
                  className="flex flex-col gap-1.5 py-1"
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null)
                  }}
                >
                  {sections.map((section, index) => (
                    <SectionRow
                      key={section.key}
                      section={section}
                      first={index === 0}
                      last={index === sections.length - 1}
                      dragging={drag === section.key}
                      dropEdge={
                        drop?.key === section.key ? (drop.after ? 'after' : 'before') : null
                      }
                      fresh={justAdded === section.key}
                      onRename={(label) => patch(section.key, { label })}
                      onToggle={(visible) => patch(section.key, { visible })}
                      onMove={(dir) => move(section.key, dir)}
                      onDelete={() =>
                        savedKeys.has(section.key)
                          ? setConfirm({ type: 'delete', key: section.key })
                          : remove(section.key)
                      }
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', section.key)
                        const row = e.currentTarget.closest('li')
                        if (row) e.dataTransfer.setDragImage(row, 20, 24)
                        setDrag(section.key)
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => {
                        if (!drag) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const after = afterOf(e)
                        if (drop?.key !== section.key || drop.after !== after)
                          setDrop({ key: section.key, after })
                      }}
                      onDrop={(e) => {
                        if (!drag) return
                        e.preventDefault()
                        const next = dropNear(sections, drag, section.key, afterOf(e))
                        setDraft(next)
                        say(
                          `${sections.find((s) => s.key === drag)?.label} moved to position ${
                            next.findIndex((s) => s.key === drag) + 1
                          } of ${next.length}`,
                        )
                        endDrag()
                      }}
                    />
                  ))}
                </ul>
              )}

              <form onSubmit={add} className="border-border flex gap-2 border-t pt-3">
                <Input
                  aria-label="New section name"
                  placeholder="New section, e.g. X-ray report"
                  maxLength={MAX_LABEL}
                  value={newLabel}
                  disabled={sections.length >= MAX_SECTIONS}
                  className="max-sm:min-h-tap"
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="tonal"
                  className="max-sm:min-h-tap"
                  iconLeft={<Plus aria-hidden className="size-4" />}
                  disabled={!newLabel.trim() || sections.length >= MAX_SECTIONS || !layout.data}
                >
                  Add section
                </Button>
              </form>
              {sections.length >= MAX_SECTIONS && (
                <p className="text-caption text-text-muted -mt-2">
                  {MAX_SECTIONS} sections is the most a layout can hold.
                </p>
              )}

              <p className="text-caption text-text-muted flex items-center gap-1.5 text-pretty">
                <Lock aria-hidden className="text-text-subtle size-3.5 shrink-0" />
                Patient, vitals and medicines are always shown.
              </p>
            </div>

            <MiniSheet shown={shown} total={sections.length} />
          </div>

          <p role="status" className="sr-only">
            {announcement}
          </p>
        </DialogContent>
      </DialogRoot>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        destructive
        title={
          confirm?.type === 'delete'
            ? `Delete “${customToDelete?.label ?? 'section'}”?`
            : 'Discard your changes?'
        }
        body={
          confirm?.type === 'delete'
            ? 'It leaves the pad and the printed page. Prescriptions already written keep what you typed, printed at the end.'
            : 'The layout changes have not been saved.'
        }
        confirmLabel={confirm?.type === 'delete' ? 'Delete section' : 'Discard'}
        onConfirm={() => {
          if (confirm?.type === 'delete') remove(confirm.key)
          else {
            setDraft(null)
            setNewLabel('')
            onOpenChange(false)
          }
          setConfirm(null)
        }}
      />
    </>
  )
}

/* ---------------------------------- row ----------------------------------- */

function SectionRow({
  section,
  first,
  last,
  dragging,
  dropEdge,
  fresh,
  onRename,
  onToggle,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  section: PadLayoutSection
  first: boolean
  last: boolean
  dragging: boolean
  dropEdge: 'before' | 'after' | null
  fresh: boolean
  onRename: (label: string) => void
  onToggle: (visible: boolean) => void
  onMove: (dir: 'up' | 'down') => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void
}) {
  const custom = isCustomKey(section.key)
  const builtinLabel = defaultLabel(section.key)
  const blank = !section.label.trim()
  const name = section.label.trim() || builtinLabel || 'section'
  const switchId = `layout-show-${section.key.replace(/\W/g, '-')}`

  return (
    <li
      data-key={section.key}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group/row relative',
        fresh && 'animate-[fade-in_180ms_var(--ease-out-quint)] motion-reduce:animate-none',
      )}
    >
      {dropEdge && (
        <span
          aria-hidden
          className={cn(
            'bg-accent pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full',
            dropEdge === 'before' ? '-top-[5px]' : '-bottom-[5px]',
          )}
        />
      )}
      {/* One line, one centre axis: handle, name, actions and switch all sit on it.
          Radius is concentric: 14px outer = 7px control + 8px padding. */}
      <div
        className={cn(
          'flex items-center gap-1 rounded-xl border p-2',
          'duration-fast ease-standard transition-[border-color,background-color,box-shadow,opacity]',
          'hover:border-border-strong hover:shadow-xs',
          section.visible ? 'border-border bg-surface' : 'border-border bg-bg-sunken',
          dragging && 'border-accent opacity-50',
        )}
      >
        {/* Mouse-only handle: a touch screen has the arrows, and a handle that
            cannot be dragged would be a lie. Hidden from assistive tech for the
            same reason keyboard users have the arrows. */}
        <span
          draggable
          aria-hidden
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className={cn(
            'h-control text-text-subtle grid w-6 shrink-0 cursor-grab place-items-center rounded-md',
            'duration-fast ease-standard hover:text-text transition-colors active:cursor-grabbing',
            'pointer-coarse:hidden',
          )}
        >
          <GripVertical className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            aria-label={`Name of ${name}`}
            aria-invalid={blank || undefined}
            maxLength={MAX_LABEL}
            value={section.label}
            onChange={(e) => onRename(e.target.value)}
            className={cn(
              'h-control max-sm:min-h-10 min-w-0 flex-1 border-transparent bg-transparent font-medium',
              'hover:border-border-field focus:bg-surface',
              !section.visible && 'text-text-muted',
            )}
          />
          {blank ? (
            <span className="text-caption text-danger shrink-0">Needs a name</span>
          ) : (
            custom && (
              <Badge tone="accent" className="shrink-0">
                Custom
              </Badge>
            )
          )}
        </div>

        {/* Arrows and delete stay out of the way until the row is hovered or
            focused; on touch there is no hover, so they are always there. The
            delete slot is reserved on every row so the switches line up. */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 transition-opacity duration-fast ease-standard',
            'sm:opacity-0 sm:group-focus-within/row:opacity-100 sm:group-hover/row:opacity-100',
            'pointer-coarse:opacity-100',
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className={ICON_BTN}
            data-move="up"
            aria-label={`Move ${name} up`}
            disabled={first}
            onClick={() => onMove('up')}
          >
            <ArrowUp aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={ICON_BTN}
            data-move="down"
            aria-label={`Move ${name} down`}
            disabled={last}
            onClick={() => onMove('down')}
          >
            <ArrowDown aria-hidden className="size-4" />
          </Button>
          {custom ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(ICON_BTN, 'hover:bg-danger-muted hover:text-danger-muted-fg')}
              aria-label={`Delete ${name}`}
              onClick={onDelete}
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          ) : (
            <span aria-hidden className="size-control-sm max-sm:hidden" />
          )}
        </div>

        {/* The label is the hit area: a 36px switch alone is a poor thumb target. */}
        <label
          htmlFor={switchId}
          className="h-control-sm max-sm:size-10 grid w-10 shrink-0 cursor-pointer place-items-center"
        >
          <span className="sr-only">Show {name} on the pad and printout</span>
          <Switch id={switchId} checked={section.visible} onCheckedChange={onToggle} />
        </label>
      </div>
    </li>
  )
}

/* ------------------------------ mini preview ------------------------------ */

/**
 * A schematic of the printed page: just the order, not the content. From `md`
 * it sits beside the list (sticky inside the dialog's one scroll area); below
 * that it stacks under the list behind a toggle.
 */
function MiniSheet({ shown, total }: { shown: PadLayoutSection[]; total: number }) {
  const [open, setOpen] = useState(false)
  return (
    <aside className="md:sticky md:top-0 md:self-start">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="pad-layout-preview"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'text-label text-text-muted hover:text-text flex min-h-10 w-full items-center justify-between rounded-md md:hidden',
          'duration-fast ease-standard transition-colors',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
      >
        Preview page order
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform duration-fast', open && 'rotate-180')}
        />
      </button>
      <div id="pad-layout-preview" aria-hidden className={cn(!open && 'max-md:hidden')}>
        <p className="text-caption text-text-muted flex items-baseline justify-between px-0.5 pb-1.5">
          <span>Page order</span>
          <span className="tabular-nums">
            {shown.length} of {total} shown
          </span>
        </p>
        <ol className="border-border bg-surface text-caption flex flex-col overflow-hidden rounded-lg border shadow-xs">
          <Fixed>Patient and vitals</Fixed>
          {shown.map((s) => (
            <li
              key={s.key}
              className="text-text border-border truncate border-t px-2.5 py-1.5 font-medium"
            >
              {s.label || '…'}
            </li>
          ))}
          <Fixed>Medicines</Fixed>
        </ol>
      </div>
    </aside>
  )
}

/** A block the doctor cannot move or hide. */
function Fixed({ children }: { children: React.ReactNode }) {
  return (
    <li className="bg-bg-sunken text-text-muted border-border flex items-center gap-1.5 border-t px-2.5 py-1.5 first:border-t-0">
      <Lock aria-hidden className="text-text-subtle size-3 shrink-0" />
      {children}
    </li>
  )
}

/* -------------------------------- entry point ----------------------------- */

/** A button that opens the editor. Used on the pad header and in Settings. */
export function CustomizeLayoutButton({
  variant = 'ghost',
  size = 'sm',
  className,
  children = 'Customize layout',
}: Pick<ButtonProps, 'variant' | 'size' | 'className' | 'children'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn('max-sm:min-h-tap', className)}
        iconLeft={<SlidersHorizontal aria-hidden className="size-4" />}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <PadLayoutEditor open={open} onOpenChange={setOpen} />
    </>
  )
}

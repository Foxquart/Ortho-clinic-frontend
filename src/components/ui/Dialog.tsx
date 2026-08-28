import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export const DialogRoot = RD.Root
export const DialogTrigger = RD.Trigger
export const DialogClose = RD.Close

const OVERLAY = cn(
  'fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]',
  'data-[state=open]:animate-[fade-in_160ms_var(--ease-standard)]',
  'data-[state=closed]:animate-[fade-out_120ms_var(--ease-standard)]',
)

export interface DialogProps {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  /** `md` for forms, `sm` for confirmations, `lg` for anything with a table. */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' } as const

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: DialogProps) {
  return (
    <RD.Portal>
      <RD.Overlay className={OVERLAY} />
      <RD.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'flex max-h-[85dvh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-overlay',
          'data-[state=open]:animate-[dialog-in_200ms_var(--ease-out-quint)]',
          'data-[state=closed]:animate-[dialog-out_130ms_var(--ease-standard)]',
          SIZES[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <RD.Title className="text-heading font-semibold text-text">{title}</RD.Title>
            {description ? (
              <RD.Description className="mt-1 text-caption text-text-muted">
                {description}
              </RD.Description>
            ) : (
              // Radix warns loudly without one; an empty node is the honest fix.
              <RD.Description className="sr-only">{title}</RD.Description>
            )}
          </div>
          <RD.Close asChild>
            {/* 26px is a fine target for a mouse and a poor one for a thumb, so
                below `sm` this grows to the 44px `--spacing-tap` floor. The
                negative margin keeps the icon optically where it has always
                been rather than pushing the title inward to make room. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="max-sm:-my-2.5 max-sm:-mr-2.5 max-sm:size-tap"
            >
              <X aria-hidden className="size-4" />
            </Button>
          </RD.Close>
        </div>

        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {children}
        </div>

        {footer && (
          /* Every footer button gets the 44px touch floor below `sm` from here
             rather than from each call site. A confirmation footer is the one
             place in the app where a mis-hit is expensive — "Deactivate" sits
             a gap away from "Cancel" — and there is no reason for the dozen
             `ConfirmDialog` callers to each remember that. */
          <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-sunken/70 px-5 py-3 max-sm:[&>*]:min-h-tap">
            {footer}
          </div>
        )}
      </RD.Content>
    </RD.Portal>
  )
}

/**
 * Bottom drawer, for showing something large over the screen you are on
 * without leaving it.
 *
 * Deliberately NOT the centred `DialogContent`: a dialog floats detached in the
 * middle of the viewport and reads as an interruption, which is the wrong note
 * for "let me look at the page I am writing". A drawer stays attached to the
 * bottom edge, keeps a strip of the screen behind it visible so the doctor can
 * see he has not gone anywhere, and rises towards the thumb that opened it.
 *
 * `height` defaults to 80% of the *dynamic* viewport (`dvh`, not `vh`): on a
 * phone `vh` is the viewport with the browser chrome hidden, so a `80vh` drawer
 * silently loses its bottom edge under the address bar for as long as that bar
 * is showing.
 */
export function DrawerContent({
  title,
  description,
  children,
  footer,
  className,
  height = 'h-[80dvh]',
  action,
}: Omit<DialogProps, 'size'> & {
  height?: string
  /** Optional control in the header row, beside the close button. */
  action?: React.ReactNode
}) {
  return (
    <RD.Portal>
      <RD.Overlay className={OVERLAY} />
      <RD.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-border bg-surface shadow-overlay',
          'data-[state=open]:animate-[sheet-in-bottom_260ms_var(--ease-out-quint)]',
          'data-[state=closed]:animate-[sheet-out-bottom_180ms_var(--ease-standard)]',
          height,
          className,
        )}
      >
        {/* The grab handle is decorative — this drawer is not drag-dismissable,
            and pretending otherwise would be a lie the thumb finds out about.
            It earns its place as the one glyph that says "this came up from the
            bottom and goes back down there". */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2">
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>

        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <RD.Title className="text-heading font-semibold text-text">{title}</RD.Title>
            {description ? (
              <RD.Description className="mt-0.5 text-caption text-text-muted">
                {description}
              </RD.Description>
            ) : (
              <RD.Description className="sr-only">{title}</RD.Description>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {action}
            <RD.Close asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                className="max-sm:-my-2.5 max-sm:-mr-2 max-sm:size-tap"
              >
                <X aria-hidden className="size-4" />
              </Button>
            </RD.Close>
          </div>
        </div>

        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-sunken/70 px-4 py-3 sm:px-5 max-sm:[&>*]:min-h-tap">
            {footer}
          </div>
        )}
      </RD.Content>
    </RD.Portal>
  )
}

/** Right-hand sheet, for editing without losing the list behind it. */
export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
  width = 'max-w-md',
}: Omit<DialogProps, 'size'> & { width?: string }) {
  return (
    <RD.Portal>
      <RD.Overlay className={OVERLAY} />
      <RD.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-overlay',
          'data-[state=open]:animate-[sheet-in-right_260ms_var(--ease-out-quint)]',
          'data-[state=closed]:animate-[sheet-out-right_180ms_var(--ease-standard)]',
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <RD.Title className="text-heading font-semibold text-text">{title}</RD.Title>
            {description ? (
              <RD.Description className="mt-0.5 text-caption text-text-muted">
                {description}
              </RD.Description>
            ) : (
              <RD.Description className="sr-only">{title}</RD.Description>
            )}
          </div>
          <RD.Close asChild>
            {/* 26px is a fine target for a mouse and a poor one for a thumb, so
                below `sm` this grows to the 44px `--spacing-tap` floor. The
                negative margin keeps the icon optically where it has always
                been rather than pushing the title inward to make room. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="max-sm:-my-2.5 max-sm:-mr-2.5 max-sm:size-tap"
            >
              <X aria-hidden className="size-4" />
            </Button>
          </RD.Close>
        </div>

        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </div>
        )}
      </RD.Content>
    </RD.Portal>
  )
}

/**
 * Destructive confirmation. Always names the specific thing being acted on —
 * "Delete" alone is how people delete the wrong record.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  destructive = false,
  loading = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  body?: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
  destructive?: boolean
  loading?: boolean
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={title}
        footer={
          <>
            <RD.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </RD.Close>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {body && <div className="text-body text-text-muted">{body}</div>}
      </DialogContent>
    </RD.Root>
  )
}

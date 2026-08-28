import { cn } from '@/lib/cn'

/** A raised container. The default card for content that isn't a table. */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        /* `flex-wrap` rather than a plain row: on a phone the header's action
           ("Write another", "Open schedule") drops onto its own line instead of
           holding the card open at its own width. A non-wrapping row makes the
           card's min-content the title plus the button, and a grid item cannot
           shrink below that — which is exactly how this card used to push the
           whole patient screen sideways at 320px. */
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="truncate text-heading font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-caption text-text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export function CardBody({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('p-4', className)}>{children}</div>
}

/** Page title row. Every screen uses this so headers never drift. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
  className?: string
}) {
  return (
    /* Below `sm` the title and its actions are two stacked blocks, not two ends
       of a row. The actions used to be a `shrink-0` row that simply ran off the
       right edge of a phone — the Print button on a prescription was entirely
       off-screen — because nothing in a `justify-between` row is allowed to
       wrap when its children refuse to shrink. */
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-caption text-text-subtle">{breadcrumb}</div>}
        {/* `break-words` on a phone, `truncate` from `sm` up: a long patient
            name should use the second line it has rather than lose its ending
            to an ellipsis on the one screen with the least room for it. */}
        <h1 className="text-title font-semibold tracking-tight text-text break-words sm:truncate">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-prose text-body text-text-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  )
}

export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  )
}

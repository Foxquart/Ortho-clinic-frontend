import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'

/*
 * The furniture the six panels are built from.
 *
 * The one structural rule on this screen: a panel owns its own request and its
 * own failure. Six independent aggregations over a live database will not all
 * succeed forever, and a 500 on `/system/database` blanking the status strip
 * would take away the one panel that says whether the API is up at all.
 * `PanelState` is how that rule is kept — every panel wraps its body in it.
 */

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col overflow-hidden', className)}>
      <CardHeader title={title} description={description} action={action} />
      {children}
    </Card>
  )
}

export function PanelState({
  pending,
  error,
  onRetry,
  skeleton,
  children,
}: {
  pending: boolean
  error: unknown
  onRetry: () => void
  skeleton?: React.ReactNode
  children: React.ReactNode
}) {
  if (error != null) {
    return (
      <div className="p-4">
        <ErrorState error={error} onRetry={onRetry} compact />
      </div>
    )
  }
  if (pending) {
    return <div className="p-4">{skeleton ?? <PanelSkeleton />}</div>
  }
  return <>{children}</>
}

/** Three rules of grey at the panel's own rhythm, so nothing shifts on arrival. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  )
}

export type FigureTone = 'default' | 'muted' | 'success' | 'warning' | 'danger'

const FIGURE_TONE: Record<FigureTone, string> = {
  default: 'text-text',
  muted: 'text-text-subtle',
  success: 'text-success-muted-fg',
  warning: 'text-warning-muted-fg',
  danger: 'text-danger-muted-fg',
}

/**
 * One figure with its unit spelled out beneath it. The eyebrow is `text-micro`
 * caps because these are column headers in spirit — the reader scans the row of
 * labels first and only then reads the number under the one they wanted.
 */
export function Figure({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: FigureTone
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-micro text-text-subtle uppercase">{label}</span>
      <span
        data-numeric
        className={cn('text-heading leading-none font-semibold tracking-tight', FIGURE_TONE[tone])}
      >
        {value}
      </span>
      {hint && <span className="text-caption text-text-subtle">{hint}</span>}
    </div>
  )
}

/** A definition row. Label left, value right, both on one line where it fits. */
export function KeyValue({
  label,
  children,
  mono,
}: {
  label: React.ReactNode
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-caption text-text-muted shrink-0">{label}</dt>
      <dd
        data-numeric
        className={cn(
          'text-label text-text min-w-0 truncate text-right',
          mono && 'text-caption font-mono',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/**
 * A proportion bar for pool and connection usage. It carries the numbers in
 * text above it and the bar is `aria-hidden`: the bar is the glance, the text
 * is the answer, and a progressbar role that repeated the same figure would
 * only make a screen reader say it twice.
 */
export function Meter({
  label,
  value,
  max,
  detail,
}: {
  label: React.ReactNode
  value: number | null
  max: number | null
  detail?: React.ReactNode
}) {
  const usable = value != null && max != null && max > 0
  const ratio = usable ? Math.min(1, Math.max(0, value / max)) : 0
  /* 90% of a connection pool is a real operational signal — the next request
     queues. Below that this stays neutral rather than spending a status hue on
     a number that is fine. */
  const hot = usable && ratio >= 0.9

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-micro text-text-subtle uppercase">{label}</span>
        <span data-numeric className="text-label text-text font-medium">
          {usable ? `${value} / ${max}` : '—'}
        </span>
      </div>
      <div aria-hidden className="bg-bg-sunken h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', hot ? 'bg-warning' : 'bg-accent')}
          style={{ width: `${Math.max(usable ? 2 : 0, ratio * 100)}%` }}
        />
      </div>
      {detail && <span className="text-caption text-text-subtle">{detail}</span>}
    </div>
  )
}

/**
 * A value that exists to be pasted somewhere else. The click target is the
 * whole chip rather than a 14px icon, because this is the string somebody is
 * grabbing while they are on the phone to the clinic.
 */
export function CopyValue({
  value,
  what,
  className,
}: {
  value: string
  /** Names it for the screen reader: "Copy correlation id". */
  what: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('The browser would not give this page access to the clipboard.')
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void copy()}
      aria-label={`Copy ${what}`}
      title={value}
      className={cn('text-caption text-text-muted max-w-full gap-1.5 px-1.5 font-mono', className)}
      iconRight={
        copied ? (
          <Check aria-hidden className="text-success size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )
      }
    >
      <span className="truncate">{value}</span>
    </Button>
  )
}

import { AlertTriangle, Loader2, WifiOff } from 'lucide-react'
import { ApiError, toApiError } from '@/api/errors'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/** Layout-matched placeholder. Never a spinner where content will appear. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md bg-border-field/25 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-px', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 px-3">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${55 + ((i * 13) % 30)}%` }} />
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/**
 * A spinner only after a delay — anything that resolves in under ~300ms should
 * not flash a loading state at all.
 */
export function DelayedSpinner({
  className,
  label = 'Loading',
}: {
  className?: string
  label?: string
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'grid place-items-center py-10 text-text-subtle opacity-0',
        'animate-[fade-in_180ms_ease-out_300ms_forwards] motion-reduce:animate-none motion-reduce:opacity-100',
        className,
      )}
    >
      <Loader2 aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden
          className="mb-1 grid size-10 place-items-center rounded-full border border-border bg-bg-sunken text-text-muted [&_svg]:size-5"
        >
          {icon}
        </div>
      )}
      <p className="text-body font-medium text-text">{title}</p>
      {description && (
        <p className="max-w-prose text-caption text-text-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/**
 * The one error surface. Distinguishes the cases the user can act on
 * (permission, session, offline) from the ones they cannot (upstream, server),
 * and always exposes the correlation id for a bug report.
 */
export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
  compact?: boolean
}) {
  const e: ApiError = toApiError(error)

  const offline = e.status === 0
  const upstream = e.status === 502 || e.code === 'upstream_error'

  const title = offline
    ? 'Cannot reach the server'
    : e.isForbidden
      ? 'You do not have access to this'
      : upstream
        ? 'A third-party service failed'
        : e.status === 404
          ? 'Not found'
          : 'Something went wrong'

  const description = upstream
    ? 'The clinic API reached an external service that did not respond. This is not caused by anything you did — try again in a moment.'
    : e.message

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-danger/35 bg-danger-muted p-4',
        compact ? 'text-caption' : 'text-body',
        className,
      )}
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-danger [&_svg]:size-4.5">
        {offline ? <WifiOff /> : <AlertTriangle />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text">{title}</p>
        <p className="mt-0.5 text-text-muted">{description}</p>
        {e.correlationId && (
          <p className="mt-2 font-mono text-[11px] text-text-subtle">
            ref {e.correlationId}
          </p>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
          Try again
        </Button>
      )}
    </div>
  )
}

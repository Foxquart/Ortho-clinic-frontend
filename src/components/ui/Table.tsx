import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/**
 * A deliberately plain table. Density is the point: a doctor scanning a
 * medication list should see as many rows as fit without squinting.
 */
export function Table({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="scrollbar-subtle w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-body', className)}>{children}</table>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface">
      <tr className="border-b border-border">{children}</tr>
    </thead>
  )
}

export function TH({
  children,
  align = 'left',
  width,
  sort,
  onSort,
  className,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  /** `null` = sortable but not currently sorting by this column. */
  sort?: 'asc' | 'desc' | null
  onSort?: () => void
  className?: string
}) {
  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {children}
      {sort !== undefined &&
        (sort === 'asc' ? (
          <ArrowUp aria-hidden className="size-3 text-accent" />
        ) : sort === 'desc' ? (
          <ArrowDown aria-hidden className="size-3 text-accent" />
        ) : (
          <ArrowUp aria-hidden className="size-3 opacity-0 group-hover/th:opacity-40" />
        ))}
    </span>
  )

  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      className={cn(
        'group/th whitespace-nowrap px-3 py-2 text-label font-medium text-text-subtle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center rounded transition-colors duration-fast hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  )
}

export function TR({
  children,
  onClick,
  selected,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  selected?: boolean
  className?: string
}) {
  const interactive = Boolean(onClick)
  return (
    <tr
      onClick={onClick}
      // A row that navigates must be reachable by keyboard too.
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={cn(
        'border-b border-border transition-colors duration-fast ease-standard last:border-b-0',
        interactive &&
          'cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        selected && 'bg-accent-muted',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function TD({
  children,
  align = 'left',
  className,
  colSpan,
  numeric,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  colSpan?: number
  numeric?: boolean
}) {
  return (
    <td
      colSpan={colSpan}
      data-numeric={numeric || undefined}
      className={cn(
        'px-3 py-2 align-middle text-text',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * Page controls for the API's `{items,total,page,page_size,pages}` envelope.
 * Shows the actual record range, because "page 3 of 6" answers a question
 * nobody asked.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  className,
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}) {
  if (total === 0) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-t border-border px-3 py-2',
        className,
      )}
    >
      <p className="text-caption text-text-muted" data-numeric>
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span className="px-1 text-caption text-text-muted" data-numeric>
          {page} / {Math.max(pages, 1)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  )
}

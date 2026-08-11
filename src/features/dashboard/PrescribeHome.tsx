import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { formatAgo } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { PRESCRIBE_ACTIONS } from '@/app/navigation'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Badge'
import { Card, CardHeader, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import type { ActionItem } from '@/app/navigation'
import type { ListPrescriptionsParams } from '@/api/endpoints'
import type { Paginated, PrescriptionResponse } from '@/api/schema'

const RECENT_PARAMS = {
  page: 1,
  page_size: 6,
  sort_by: 'created_at',
  sort_order: 'desc',
} satisfies ListPrescriptionsParams

/**
 * One of the two ways in. Both cards are the same size, the same weight and the
 * same colour on purpose: the doctor picks by habit, not by hierarchy, and a
 * "recommended" one would just be wrong half the time.
 */
function StartCard({ action, autoFocus }: { action: ActionItem; autoFocus?: boolean }) {
  const Icon = action.icon
  return (
    <Link
      to={action.to}
      autoFocus={autoFocus}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm',
        'transition-[background-color,border-color,transform] duration-fast ease-standard',
        'hover:border-border-strong hover:bg-surface-hover',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'active:scale-[0.99] motion-reduce:active:scale-100',
      )}
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-md bg-accent-muted text-accent [&_svg]:size-5"
      >
        <Icon />
      </span>
      <span className="flex items-center gap-2">
        <span className="text-heading font-semibold text-text">{action.label}</span>
        {action.goKey && (
          <span className="flex shrink-0 items-center gap-0.5">
            <Kbd>g</Kbd>
            <Kbd>{action.goKey}</Kbd>
          </span>
        )}
      </span>
      <span className="text-caption text-text-muted">{action.hint}</span>
    </Link>
  )
}

function RecentRow({ item }: { item: PrescriptionResponse }) {
  return (
    <li>
      <Link
        to={`/prescriptions/${item.id}`}
        className={cn(
          'flex h-11 items-center gap-3 px-4 text-body',
          'transition-colors duration-fast hover:bg-surface-hover',
          'focus-visible:bg-surface-hover focus-visible:outline-none',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-text">
          {item.patient_name?.trim() || 'Unnamed patient'}
        </span>
        <span className="shrink-0 font-mono text-caption text-text-subtle">
          {item.prescription_number}
        </span>
        <span className="w-24 shrink-0 text-right text-caption text-text-muted" data-numeric>
          {formatAgo(item.created_at)}
        </span>
      </Link>
    </li>
  )
}

/**
 * The landing screen. It is not a dashboard: a tool used a hundred times a day
 * should open on the thing you came to do, not on a report about it. Two equal
 * entry points, then the handful of prescriptions recent enough to reprint or
 * continue. The old dashboard still exists, at `/dashboard`.
 */
export function PrescribeHome() {
  const { can } = useAuth()

  const actions = PRESCRIBE_ACTIONS.filter((a) => !a.requires || can(a.requires))

  const recent = useQuery({
    queryKey: qk.prescriptions.list(RECENT_PARAMS),
    queryFn: () =>
      apiGet<Paginated<PrescriptionResponse>>(endpoints.prescriptions.list, {
        params: RECENT_PARAMS,
      }),
    staleTime: 15_000,
  })

  const items = recent.data?.items ?? []

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pb-8 pt-5">
      <PageHeader
        title="New prescription"
        description={
          actions.length > 0
            ? 'Speak it or type it. Everything else in the app supports this one screen.'
            : 'Your account can read prescriptions but not write them.'
        }
      />

      {actions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action, i) => (
            /* Focus lands on the first card so `g n` then Enter starts writing
               without touching the mouse. `g v` still jumps straight to the mic. */
            <StartCard key={action.to} action={action} autoFocus={i === 0} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="Recent prescriptions"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/prescriptions">View all</Link>
            </Button>
          }
        />

        {recent.isError ? (
          <div className="p-4">
            <ErrorState error={recent.error} onRetry={() => void recent.refetch()} compact />
          </div>
        ) : recent.isPending ? (
          <ul className="divide-y divide-border/60">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex h-11 items-center gap-3 px-4">
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-20 shrink-0" />
                <Skeleton className="h-3 w-16 shrink-0" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="Nothing written yet"
            description="Prescriptions appear here the moment you sign them, ready to reopen or reprint."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <RecentRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

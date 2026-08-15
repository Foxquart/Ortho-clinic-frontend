import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FileText, Printer } from 'lucide-react'
import { API_BASE_URL, apiGet, resolveApiUrl } from '@/api/http'
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
 * Fuller sentences than the palette hints in `navigation.ts`, because here
 * there is room to say what actually happens next.
 */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  '/speech?autostart=1': 'The microphone is already live. Just speak the prescription.',
  '/prescriptions/new?focus=patient': 'The pad opens on the patient field, ready to fill in.',
}

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
        'group flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm',
        'transition-[background-color,border-color,transform] duration-fast ease-standard',
        'hover:border-border-strong hover:bg-surface-hover',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'active:scale-[0.99] motion-reduce:active:scale-100',
      )}
    >
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-lg bg-accent-muted text-accent [&_svg]:size-6"
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
        <ChevronRight
          aria-hidden
          className="ml-auto size-5 shrink-0 text-text-subtle transition-colors duration-fast group-hover:text-text"
        />
      </span>
      <span className="text-body text-text-muted">
        {ACTION_DESCRIPTIONS[action.to] ?? action.hint}
      </span>
    </Link>
  )
}

function RecentRow({ item }: { item: PrescriptionResponse }) {
  const patientName = item.patient_name?.trim() || 'Unnamed patient'
  /* Same URL the prescription detail screen prints from: the API renders the
     A4 sheet itself, and a new tab hands over the browser's print dialog. */
  const printUrl = resolveApiUrl(
    `${API_BASE_URL}${endpoints.prescriptions.printView(item.id)}`,
  )

  return (
    <li className="flex items-center gap-1 pr-2 transition-colors duration-fast hover:bg-surface-hover">
      <Link
        to={`/prescriptions/${item.id}`}
        className={cn(
          'flex h-12 min-w-0 flex-1 items-center gap-3 px-4 text-body',
          'focus-visible:bg-surface-hover focus-visible:outline-none',
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium text-text">{patientName}</span>
        <span className="hidden shrink-0 font-mono text-label text-text-subtle sm:block" data-numeric>
          {item.prescription_number}
        </span>
        <span className="w-24 shrink-0 text-right text-label text-text-muted" data-numeric>
          {formatAgo(item.created_at)}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-subtle" />
      </Link>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<Printer aria-hidden className="size-3.5" />}
        aria-label={`Print prescription for ${patientName}`}
        onClick={() => window.open(printUrl, '_blank', 'noopener,noreferrer')}
      >
        Print
      </Button>
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
              <li key={i} className="flex h-12 items-center gap-3 px-4">
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

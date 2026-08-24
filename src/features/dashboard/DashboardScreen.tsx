import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarClock,
  Clock,
  CalendarDays,
  FileText,
  Pill,
  Plus,
  Users,
} from 'lucide-react'
import { apiGet } from '@/api/http'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { formatRelativeDay, formatTime, formatAgo, humanizeEnum } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card, CardHeader, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import type { DashboardSummaryResponse } from '@/api/schema'
import type {
  DashboardRecentAppointment,
  DashboardRecentPrescription,
} from '@/api/derived'

const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: 'info',
  confirmed: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

function StatTile({
  label,
  value,
  icon,
  to,
  loading,
  emphasis = false,
}: {
  label: string
  value: number | undefined
  icon: React.ReactNode
  to: string
  loading: boolean
  emphasis?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm',
        'transition-[border-color,transform] duration-fast ease-standard',
        'hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'active:scale-[0.995] motion-reduce:active:scale-100',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className={cn(
            'grid size-7 place-items-center rounded-lg [&_svg]:size-4',
            emphasis ? 'bg-accent-muted text-accent' : 'bg-surface-raised text-text-subtle',
          )}
        >
          {icon}
        </span>
        <ArrowUpRight
          aria-hidden
          className="size-4 text-text-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        />
      </div>
      <div>
        {loading ? (
          <Skeleton className="h-8 w-14" />
        ) : (
          <p
            data-numeric
            className="text-display font-semibold leading-none tracking-tight text-text"
          >
            {value ?? 0}
          </p>
        )}
        <p className="mt-1.5 text-caption text-text-muted">{label}</p>
      </div>
    </Link>
  )
}

export function DashboardScreen() {
  const { user, can } = useAuth()

  const summary = useQuery({
    queryKey: qk.dashboard.summary(),
    queryFn: () => apiGet<DashboardSummaryResponse>('/dashboard/summary'),
  })

  const data = summary.data
  const loading = summary.isPending

  const appointments = (data?.recent_appointments ?? []) as unknown as DashboardRecentAppointment[]
  const prescriptions = (data?.recent_prescriptions ?? []) as unknown as DashboardRecentPrescription[]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (user?.full_name ?? user?.username ?? '').split(/\s+/)[0]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        description="Today at a glance."
        actions={
          <>
            {/* The hours behind the public booking page live one click away,
                because "which days am I available" should never need hunting —
                but it is secondary, so it does not compete with the pad. */}
            <Button variant="secondary" asChild iconLeft={<Clock className="size-4" />}>
              <Link to="/appointments?hours=1">Set clinic hours</Link>
            </Button>
            {/* The one thing this app exists to do, and — since the rail no
                longer carries a row for it — the only signposted way in. It is
                the largest control on the screen on purpose. */}
            {can('prescriptions.write') && (
              <Button
                variant="primary"
                size="lg"
                asChild
                iconLeft={<Plus className="size-5" />}
                className="min-h-11 px-5 text-body font-semibold shadow-md"
              >
                <Link to="/prescriptions/new">New prescription</Link>
              </Button>
            )}
          </>
        }
      />

      {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Appointments today"
          value={data?.appointments_today}
          icon={<CalendarDays />}
          to="/appointments"
          loading={loading}
          emphasis
        />
        <StatTile
          label="Upcoming"
          value={data?.appointments_upcoming}
          icon={<CalendarClock />}
          to="/appointments"
          loading={loading}
        />
        <StatTile
          label="Prescriptions today"
          value={data?.prescriptions_today}
          icon={<FileText />}
          to="/prescriptions"
          loading={loading}
        />
        <StatTile
          label="Patients"
          value={data?.total_patients}
          icon={<Users />}
          to="/patients"
          loading={loading}
        />
        <StatTile
          label="Medicines"
          value={data?.total_medicines}
          icon={<Pill />}
          to="/medicines"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent appointments"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/appointments">View all</Link>
              </Button>
            }
          />
          {loading ? (
            <div className="flex flex-col gap-px p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex h-10 items-center gap-3 px-2">
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="No appointments yet"
              description="Booked appointments will appear here."
              action={
                can('appointments.write') && (
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/appointments">Open schedule</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {appointments.map((a) => (
                <li key={a.id}>
                  <Link
                    to="/appointments"
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-text">
                      {a.patient_name}
                    </span>
                    <span className="shrink-0 text-caption text-text-muted" data-numeric>
                      {formatRelativeDay(a.date)} · {formatTime(a.time)}
                    </span>
                    <Badge tone={STATUS_TONE[a.status] ?? 'neutral'} dot>
                      {humanizeEnum(a.status)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent prescriptions"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/prescriptions">View all</Link>
              </Button>
            }
          />
          {loading ? (
            <div className="flex flex-col gap-px p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex h-10 items-center gap-3 px-2">
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          ) : prescriptions.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="No prescriptions yet"
              description="Everything you write will be listed here."
              action={
                can('prescriptions.write') && (
                  <Button variant="primary" size="sm" asChild>
                    <Link to="/prescriptions/new">Write one</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {prescriptions.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/prescriptions/${p.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-text">
                      {p.patient_name}
                    </span>
                    <span className="shrink-0 font-mono text-caption text-text-subtle">
                      {p.prescription_number}
                    </span>
                    <span className="w-24 shrink-0 text-right text-caption text-text-muted">
                      {formatAgo(p.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

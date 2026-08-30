import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  CalendarClock,
  Clock,
  FileText,
  Pill,
  Plus,
  Users,
} from 'lucide-react'
import { apiGet } from '@/api/http'
import { qk } from '@/lib/query'
import { formatAgo } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import {
  PersonRow,
  RecordLink,
  RowChevron,
  StatFigure,
} from './dashboardParts'
import { NextPatient, TodaySchedule, useTodayAppointments } from './TodayPanel'
import type { DashboardSummaryResponse } from '@/api/schema'
import type { DashboardRecentPrescription } from '@/api/derived'

/*
 * THE DASHBOARD
 * =============
 * One surgeon, one day. This is a cockpit, not an analytics console: there is
 * no second doctor to compare against, no throughput to manage, and no
 * revenue — so there is no KPI grid either. The screen answers three questions
 * in this order and then stops:
 *
 *   1. What is happening today?          -> the Today band, full width, top
 *   2. Who has been booked, and where?   -> Recent appointments, the wide column
 *   3. What have I written?              -> Recent prescriptions, the narrow one
 *
 * and then, quietly, at the very bottom and in a sunken well rather than on a
 * card: how big the records are. `total_patients` is a lifetime figure. It used
 * to sit at exactly the same visual rank as `appointments_today`, which is the
 * number the doctor actually opened the screen for. Three tiers now separate
 * them — 32px accent-chipped figures on a raised card, 24px neutral-chipped
 * figures in a sunken strip, and nothing in between.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * `GET /dashboard/summary` returns five integers and two five-row lists. It
 * returns no time series, no ratings, no outcomes and no per-hour data, so
 * there is no chart, no trend arrow and no sparkline on this screen. Every
 * number rendered below is a number the API actually sent.
 *
 * In particular `recent_appointments` is ordered by `created_at desc` — it is
 * the five most recently BOOKED appointments, not today's schedule in time
 * order. It is therefore labelled "Recent appointments" and never "Today's
 * schedule", and each row carries its own day so a row for next Tuesday cannot
 * be mistaken for a row for this morning.
 */

/** `Thursday, 27 August 2026` — the anchor for a screen entirely about today. */
function today(): string {
  return format(new Date(), 'EEEE, d MMMM yyyy')
}

export function DashboardScreen() {
  const { can } = useAuth()

  const summary = useQuery({
    queryKey: qk.dashboard.summary(),
    queryFn: () => apiGet<DashboardSummaryResponse>('/dashboard/summary'),
  })

  /* The day itself comes from the appointments endpoint, not from the summary:
     `recent_appointments` is ordered by booking time, which is the wrong axis
     for a screen about today. See TodayPanel. */
  const todayAppointments = useTodayAppointments()
  const todayLoading = todayAppointments.isPending

  const data = summary.data
  const loading = summary.isPending

  const prescriptions = (data?.recent_prescriptions ?? []) as unknown as DashboardRecentPrescription[]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  /* "Sir", not the account name. One surgeon uses this, and being greeted by
     your own login — "Good morning, Administrator" — reads as software talking
     to a database row rather than to a person. */
  const address = 'Sir'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:gap-8">
      <PageHeader
        title={`${greeting}, ${address}`}
        description={today()}
        actions={
          /* No wrapper of its own any more: `PageHeader` now supplies the
             wrapping flex row, and it is full-width below `sm`. A nested
             `justify-end` div inside that container did nothing but shove both
             buttons against the right edge of a phone. */
          <>
            {/* The hours behind the public booking page live one click away,
                because "which days am I available" should never need hunting —
                but it is secondary, so it does not compete with the pad — and
                it keeps its natural width on a phone for exactly that reason. */}
            <Button variant="info" asChild iconLeft={<Clock className="size-4" />}>
              <Link to="/appointments?hours=1">Set clinic hours</Link>
            </Button>
            {/* The one thing this app exists to do, and — since the rail no
                longer carries a row for it — the only signposted way in. It is
                the largest control on the screen on purpose, and on a phone
                that means the full width of the screen: it takes its own line
                and there is nothing else on it to mis-hit. */}
            {can('prescription.write') && (
              <Button
                variant="primary"
                size="lg"
                asChild
                iconLeft={<Plus className="size-5" />}
                className="w-full min-h-11 px-5 text-body font-semibold shadow-md sm:w-auto"
              >
                <Link to="/prescriptions/new">New prescription</Link>
              </Button>
            )}
          </>
        }
      />

      {summary.isError ? (
        /* One honest failure instead of five zeros. A dashboard that renders
           `0 / 0 / 0` when the request failed is worse than one that renders
           nothing, because zeros look like an answer. */
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          {/* ---------------------------------------------------------------
              THE DAY, and everything else in service of it.

              An asymmetric split rather than stacked full-width bands: the
              left column is the clinic in progress, the right is reference.
              Equal columns would say the two matter equally. They do not.
              --------------------------------------------------------------- */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
            {/* ---------------- the day ---------------- */}
            <div className="flex min-w-0 flex-col gap-6">
              <NextPatient appointments={todayAppointments.data} loading={todayLoading} />

              <Card className="overflow-hidden">
                <CardHeader
                  title="Today's schedule"
                  description={
                    todayLoading
                      ? 'Loading the day…'
                      : `${todayAppointments.data?.length ?? 0} booked · in time order`
                  }
                  action={
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/appointments">Open schedule</Link>
                    </Button>
                  }
                />
                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                  <TodaySchedule appointments={todayAppointments.data} loading={todayLoading} />
                </div>
              </Card>
            </div>

            {/* ---------------- reference ---------------- */}
            <div className="flex min-w-0 flex-col gap-6">
              {/* Two figures, not three: "appointments today" is the schedule
                  beside it counted twice, so it lives in that card's
                  description instead of competing as a tile. */}
              <Card className="overflow-hidden">
                {/* Side by side from `sm` up, stacked below it. Two columns of
                    a 320px screen leave each figure about 120px of content, and
                    the label — the word that says what the number counts — was
                    the part that lost: "Prescriptions" truncated to "Pre…" next
                    to a 32px numeral, which is a number with no meaning. Each
                    figure's phone arrangement is already the short horizontal
                    one (label left, figure right, ~72px tall), so stacking them
                    costs one row of height and buys back both labels. */}
                <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <StatFigure
                    label="Upcoming"
                    value={data?.appointments_upcoming}
                    hint="Today and later"
                    zeroHint="Nothing booked ahead"
                    icon={<CalendarClock />}
                    to="/appointments"
                    loading={loading}
                  />
                  <StatFigure
                    label="Prescriptions"
                    value={data?.prescriptions_today}
                    hint="Written today"
                    zeroHint="None written yet"
                    icon={<FileText />}
                    to="/prescriptions"
                    loading={loading}
                  />
                </div>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader
                  title="Recent prescriptions"
                  description="The last five you wrote."
                  action={
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/prescriptions">View all</Link>
                    </Button>
                  }
                />
                {loading ? (
                  <SkeletonRows rows={5} />
                ) : prescriptions.length === 0 ? (
                  <EmptyState
                    title="Nothing written yet"
                    description="Prescriptions you write will appear here."
                  />
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {prescriptions.map((rx) => (
                      <PersonRow
                        key={rx.id}
                        to={`/prescriptions/${rx.id}`}
                        name={rx.patient_name ?? 'Unknown patient'}
                        meta={
                          <>
                            <span className="numeric">{rx.prescription_number}</span>
                            {rx.created_at && <> · {formatAgo(rx.created_at)}</>}
                          </>
                        }
                        trailing={<RowChevron />}
                      />
                    ))}
                  </ul>
                )}
              </Card>

              {/* Context, and the quietest thing here: a sunken well rather
                  than a card, at the foot of the reference column. It also
                  stops the right rail ending 400px short of the schedule and
                  leaving a hole in the composition. */}
              <section
                aria-labelledby="dashboard-records"
                className={
                  'flex flex-col gap-3 rounded-xl border border-border bg-bg-sunken px-5 py-4'
                }
              >
                <h2 id="dashboard-records" className="text-micro uppercase text-text-subtle">
                  In your records
                </h2>
                {/* Left-aligned, hard against its own heading. Spread across the
                    full 1100px the label and its two numbers stop reading as one
                    group — and a group is the only reason this strip exists. */}
                <div className="flex flex-col gap-2">
                  <RecordLink
                    label="Patients"
                    value={data?.total_patients}
                    icon={<Users />}
                    to="/patients"
                    loading={loading}
                  />
                  <RecordLink
                    label="Medicines in the formulary"
                    value={data?.total_medicines}
                    icon={<Pill />}
                    to="/medicines"
                    loading={loading}
                  />
                </div>
              </section>
            </div>
          </div>

        </>
      )}
    </div>
  )
}

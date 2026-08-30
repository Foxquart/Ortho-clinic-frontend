import { useMemo } from 'react'
import { EmptyState } from '@/components/ui/Feedback'
import { Table, TD, TH, THead, TR } from '@/components/ui/Table'
import { Sparkline } from './Sparkline'
import { Figure, Panel, PanelState } from './systemParts'
import {
  SPARKLINE_POINTS,
  downsampleSeries,
  formatCount,
  formatMs,
  formatRate,
} from './systemFormat'
import { useSystemMetrics } from './useSystem'
import type { MonitoringWindow, RouteMetricsResponse } from '@/api/schema'

/*
 * 5.3 — volume, error rate, latency, and the per-route tables.
 *
 * Two labelling obligations from the spec, both about not overstating what the
 * numbers mean:
 *
 *   - The window's `latency_p95_ms` is the WORST per-interval p95, not a p95
 *     over the window. Percentiles cannot be averaged, so the backend does not
 *     try and neither does this panel — the tile says "worst p95 in window".
 *   - The route keys are TEMPLATES (`/api/v1/patients/{patient_id}`). They are
 *     never resolved URLs, so nothing here links them to a record; the brace
 *     segment is a literal part of the key.
 *
 * Also cosmetic, and deliberately not corrected: rows written before
 * 2026-08-30 can carry a route key without the `/api/v1` prefix, so the same
 * endpoint may appear under two spellings until those rows age out at the
 * retention horizon. Normalising them client-side would merge two counters the
 * backend deliberately kept apart.
 */

function RouteTable({
  title,
  description,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  description: string
  rows: readonly RouteMetricsResponse[]
  emptyTitle: string
  emptyDescription: string
}) {
  return (
    <section className="bg-surface min-w-0">
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-micro text-text-subtle uppercase">{title}</h3>
        <p className="text-caption text-text-subtle mt-0.5">{description}</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} className="py-8" />
      ) : (
        <Table label={title}>
          <THead>
            <TH>Route template</TH>
            <TH align="right">Reqs</TH>
            <TH align="right">5xx</TH>
            <TH align="right">p95</TH>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.route}>
                <TD className="text-caption font-mono">
                  <span className="block max-w-72 truncate" title={row.route}>
                    {row.route}
                  </span>
                </TD>
                <TD align="right" numeric>
                  {formatCount(row.requests)}
                </TD>
                <TD
                  align="right"
                  numeric
                  className={row.errors > 0 ? 'text-danger-muted-fg' : undefined}
                >
                  {formatCount(row.errors)}
                </TD>
                <TD align="right" numeric>
                  {formatMs(row.p95_ms)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  )
}

export function MetricsPanel({
  windowKey,
  monitoringEnabled,
}: {
  windowKey: MonitoringWindow
  monitoringEnabled: boolean | undefined
}) {
  const metrics = useSystemMetrics(windowKey)
  const data = metrics.data

  /* One point per probe interval: ~1.4k at 24h and ~43k at 30d, which is a
     megabyte of path data for four 32px squiggles. Bucketing runs before
     anything is charted, and the panel says so when it has happened — a
     downsampled line is a summary and the reader should know which they are
     looking at. */
  const series = useMemo(
    () => (data ? downsampleSeries(data.series, SPARKLINE_POINTS) : []),
    [data],
  )
  const downsampled = data != null && data.series.length > series.length

  return (
    <Panel
      title="Traffic and latency"
      description="Request volume, error rate and response times over the selected window."
    >
      <PanelState
        pending={metrics.isPending}
        error={metrics.error}
        onRetry={() => void metrics.refetch()}
      >
        {data && (
          <>
            {monitoringEnabled === false && (
              <p className="border-warning/30 bg-warning-muted text-caption text-warning-muted-fg border-b px-4 py-2">
                The health sampler is stopped. The series below ends where sampling stopped and will
                not extend.
              </p>
            )}

            <div className="border-border grid gap-4 border-b p-4 sm:grid-cols-3 lg:grid-cols-6">
              <Figure label="Requests" value={formatCount(data.requests_total)} hint="in window" />
              <Figure
                label="4xx"
                value={formatCount(data.requests_4xx)}
                hint="client errors"
                tone="muted"
              />
              <Figure
                label="5xx"
                value={formatCount(data.requests_5xx)}
                hint="server errors"
                tone={data.requests_5xx > 0 ? 'danger' : 'default'}
              />
              <Figure
                label="Error rate"
                value={formatRate(data.error_rate)}
                hint="5xx ÷ total"
                tone={data.error_rate > 0 ? 'warning' : 'default'}
              />
              <Figure label="p50" value={formatMs(data.latency_p50_ms)} hint="median latency" />
              <Figure
                label="p95"
                value={formatMs(data.latency_p95_ms)}
                /* Not a p95 over the window — the worst interval's p95. Saying
                   otherwise would claim a statistic nobody computed. */
                hint="worst p95 in window"
              />
            </div>

            <div className="border-border border-b p-4">
              {data.series.length === 0 ? (
                <EmptyState
                  title="No samples in this window"
                  description="Either the health sampler was not running, or the window predates the monitoring history."
                  className="py-8"
                />
              ) : (
                <>
                  <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Sparkline
                      label="Requests per interval"
                      values={series.map((p) => p.requests_total)}
                      formatValue={(v) => formatCount(v)}
                      tone="accent"
                    />
                    <Sparkline
                      label="5xx per interval"
                      values={series.map((p) => p.requests_5xx)}
                      formatValue={(v) => formatCount(v)}
                      tone="danger"
                    />
                    <Sparkline
                      label="Worst p95 per interval"
                      values={series.map((p) => p.latency_p95_ms)}
                      formatValue={(v) => formatMs(v)}
                      tone="info"
                      baseline="min"
                    />
                    <Sparkline
                      label="Database latency"
                      values={series.map((p) => p.db_latency_ms)}
                      formatValue={(v) => formatMs(v)}
                      tone="warning"
                      baseline="min"
                    />
                  </div>
                  <p className="text-caption text-text-subtle mt-3" data-numeric>
                    {downsampled
                      ? `${formatCount(data.series.length)} samples bucketed to ${formatCount(series.length)} points — counters summed, latencies taken at their worst, so no spike is averaged away.`
                      : `${formatCount(data.series.length)} samples, one point each.`}
                  </p>
                </>
              )}
            </div>

            <div className="bg-border grid min-w-0 gap-px lg:grid-cols-3">
              <RouteTable
                title="Busiest routes"
                description="By request count."
                rows={data.busiest_routes}
                emptyTitle="No traffic"
                emptyDescription="Nothing was requested in this window."
              />
              <RouteTable
                title="Slowest routes"
                description="By p95 response time."
                rows={data.slowest_routes}
                emptyTitle="No timings"
                emptyDescription="No route recorded a latency in this window."
              />
              <RouteTable
                title="Failing routes"
                description="By 5xx count."
                rows={data.failing_routes}
                emptyTitle="Nothing failing"
                emptyDescription="No route returned a 5xx in this window."
              />
            </div>

            <p className="border-border text-caption text-text-subtle border-t px-4 py-2">
              Routes are templates, not visited URLs —{' '}
              <span className="font-mono">{'{patient_id}'}</span> is part of the key, so a row here
              cannot be opened as a record.
            </p>
          </>
        )}
      </PanelState>
    </Panel>
  )
}

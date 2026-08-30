import { Info, RotateCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { parseApiDate } from '@/lib/format'
import { Figure, Panel, PanelState } from './systemParts'
import {
  formatAvailability,
  formatCount,
  formatDuration,
  formatStamp,
  formatStampSeconds,
} from './systemFormat'
import { useSystemUptime } from './useSystem'
import type { IncidentResponse, MonitoringWindow, RestartResponse } from '@/api/schema'

/*
 * 5.2 — availability, and the three ways this number lies if you let it.
 *
 *   1. It is INFERRED. The service samples its own health, so a process that
 *      is fully stopped cannot record its own outage; downtime is reconstructed
 *      from gaps in the series. The `caveat` string says exactly that and is
 *      printed, not hidden behind a tooltip nobody opens.
 *   2. `coverage_start` can be later than `window_start` — a fresh deploy or
 *      the retention horizon. The figure therefore reads "99.9% since 30 Aug
 *      05:49" and never "99.9% (24h)". The backend already excluded the
 *      pre-coverage period, so nothing here treats it as downtime.
 *   3. RESTARTS ARE NOT INCIDENTS. A deploy lands in `restarts`. Folding them
 *      into the incident list is the single easiest way to make this panel
 *      lie, so they get their own section, their own neutral tone, and a line
 *      saying they cost no availability.
 */

/** A gap and an unhealthy period read very differently at 3am. Label them apart. */
function incidentLabel(kind: IncidentResponse['kind']): { title: string; explain: string } {
  return kind === 'gap'
    ? {
        title: 'Stopped reporting',
        explain:
          'No health sample arrived. The process was down, restarting, or the sampler was off.',
      }
    : {
        title: 'Database unreachable',
        explain: 'The service was up and answering, but its database check failed.',
      }
}

function IncidentRow({ incident }: { incident: IncidentResponse }) {
  const { title, explain } = incidentLabel(incident.kind)
  return (
    <li className="border-border flex flex-col gap-1 border-b px-4 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={incident.kind === 'gap' ? 'warning' : 'danger'} dot>
          {title}
        </Badge>
        <span data-numeric className="text-label text-text font-medium">
          {formatDuration(incident.seconds)}
        </span>
        <span data-numeric className="text-caption text-text-muted">
          {formatStampSeconds(incident.started_at)} → {formatStampSeconds(incident.ended_at)}
        </span>
      </div>
      <p className="text-caption text-text-subtle">{incident.detail || explain}</p>
    </li>
  )
}

function RestartRow({ restart }: { restart: RestartResponse }) {
  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 last:border-b-0">
      <span className="text-label text-text flex items-center gap-2">
        <RotateCw aria-hidden className="text-text-subtle size-3.5 shrink-0" />
        <span data-numeric>{formatStampSeconds(restart.at)}</span>
      </span>
      <span className="text-caption text-text-subtle truncate font-mono">
        {restart.instance_id}
      </span>
    </li>
  )
}

export function UptimePanel({
  windowKey,
  monitoringEnabled,
  oldestHealthSample,
}: {
  windowKey: MonitoringWindow
  /** From `/system/status`. `false` means no new samples are being written. */
  monitoringEnabled: boolean | undefined
  /** From `/system/database`. It is what `coverage_start` clamps to. */
  oldestHealthSample: string | null | undefined
}) {
  const uptime = useSystemUptime(windowKey)
  const data = uptime.data

  const windowStart = parseApiDate(data?.window_start)
  const coverageStart = parseApiDate(data?.coverage_start)
  /* A minute of slack: coverage beginning a few seconds after the window opens
     is the sampler's own cadence, not a gap in the history. */
  const partial =
    windowStart != null &&
    coverageStart != null &&
    coverageStart.getTime() - windowStart.getTime() > 60_000

  return (
    <Panel
      title="Uptime"
      description="Availability, incidents and restarts over the selected window."
      action={data && <Badge tone="neutral">{formatCount(data.sample_count)} health samples</Badge>}
    >
      <PanelState
        pending={uptime.isPending}
        error={uptime.error}
        onRetry={() => void uptime.refetch()}
      >
        {data && (
          <>
            {monitoringEnabled === false && (
              <p className="border-warning/30 bg-warning-muted text-caption text-warning-muted-fg border-b px-4 py-2">
                The health sampler is stopped. Nothing new is being recorded, so this figure
                describes the past and will not move.
              </p>
            )}

            <div className="border-border grid gap-4 border-b p-4 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1 sm:col-span-1">
                <span className="text-micro text-text-subtle uppercase">Availability</span>
                <span
                  data-numeric
                  className="text-display text-text leading-none font-semibold tracking-tight"
                >
                  {formatAvailability(data.availability)}
                </span>
                {/* The spec's exact wording. "since <time>" is true whether or
                    not coverage is partial; "(24h)" is only true when it is not. */}
                <span data-numeric className="text-caption text-text-muted">
                  since {formatStamp(data.coverage_start)}
                </span>
                {partial && (
                  <span className="mt-1">
                    <Badge tone="info" dot>
                      Partial coverage
                    </Badge>
                  </span>
                )}
              </div>

              <Figure
                label="Downtime"
                value={data.downtime_seconds > 0 ? formatDuration(data.downtime_seconds) : 'none'}
                tone={data.downtime_seconds > 0 ? 'danger' : 'default'}
                hint={`window ${formatStamp(data.window_start)} → ${formatStamp(data.window_end)}`}
              />

              <Figure
                label="History begins"
                value={oldestHealthSample ? formatStamp(oldestHealthSample) : '—'}
                hint={
                  oldestHealthSample
                    ? 'oldest health sample — coverage cannot start before this'
                    : 'from /system/database'
                }
              />
            </div>

            {/* Printed, not tucked away. The number above is only honest with
                this sentence attached to it. */}
            <p className="border-border bg-bg-sunken text-caption text-text-muted flex items-start gap-2 border-b px-4 py-2.5">
              <Info aria-hidden className="text-text-subtle mt-0.5 size-3.5 shrink-0" />
              <span className="max-w-prose">
                {data.caveat}
                {data.inferred && ' Treat it as an estimate, not a contractual SLA figure.'}
              </span>
            </p>

            <div className="bg-border grid min-w-0 gap-px lg:grid-cols-2">
              <section className="bg-surface min-w-0">
                <h3 className="text-micro text-text-subtle px-4 pt-3 pb-1 uppercase">
                  Incidents ({data.incidents.length})
                </h3>
                {data.incidents.length === 0 ? (
                  <EmptyState
                    title="No incidents"
                    description="Nothing in this window failed a health check or stopped reporting."
                    className="py-8"
                  />
                ) : (
                  <ul>
                    {data.incidents.map((incident) => (
                      <IncidentRow
                        key={`${incident.started_at}-${incident.kind}`}
                        incident={incident}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="bg-surface min-w-0">
                <h3 className="text-micro text-text-subtle px-4 pt-3 pb-1 uppercase">
                  Restarts ({data.restarts.length})
                </h3>
                <p className="text-caption text-text-subtle px-4 pb-2">
                  A deploy or a process restart. Not an incident, and not counted as downtime.
                </p>
                {data.restarts.length === 0 ? (
                  <EmptyState
                    title="No restarts"
                    description="The same process has been serving for the whole window."
                    className="py-8"
                  />
                ) : (
                  <ul>
                    {data.restarts.map((restart) => (
                      <RestartRow key={`${restart.at}-${restart.instance_id}`} restart={restart} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </PanelState>
    </Panel>
  )
}

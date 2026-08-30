import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Figure, KeyValue, Meter } from './systemParts'
import { formatDuration, formatMs, formatStampSeconds } from './systemFormat'
import { LATENCY_ELEVATED_MS, useDatabaseLatencyTrend, useSystemStatus } from './useSystem'
import type { DependencyStatusResponse } from '@/api/schema'

/*
 * 5.1 — the "is it up right now" strip. The only panel that polls.
 */

/**
 * `dependencies[].ok` is TRI-STATE and the third state is the whole point:
 * `null` means the feature is not configured or was not checked, which is not
 * a failure. Speech with no provider key is a deployment choice; painting it
 * red trains the operator to ignore red.
 */
function dependencyTone(ok: boolean | null): BadgeTone {
  if (ok === true) return 'success'
  if (ok === false) return 'danger'
  return 'neutral'
}

function dependencyWord(ok: boolean | null): string {
  if (ok === true) return 'Reachable'
  if (ok === false) return 'Failing'
  return 'Not configured'
}

function DependencyChip({ dependency }: { dependency: DependencyStatusResponse }) {
  const tone = dependencyTone(dependency.ok)
  return (
    <li className="border-border bg-bg-sunken flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label text-text truncate font-medium">{dependency.name}</span>
        <Badge tone={tone} dot>
          {dependencyWord(dependency.ok)}
        </Badge>
      </div>
      {/* The detail is the answer to "not configured *how*" — the storage path,
          the provider name, the missing key. It is the reason a grey chip is
          informative rather than an absence. */}
      <p className="text-caption text-text-subtle truncate" title={dependency.detail ?? undefined}>
        {dependency.detail ?? (dependency.ok === null ? 'Not checked' : '—')}
      </p>
    </li>
  )
}

export function StatusPanel() {
  const status = useSystemStatus()
  const data = status.data
  const trend = useDatabaseLatencyTrend(data?.database_latency_ms, status.dataUpdatedAt)

  const degraded = data?.status === 'degraded'

  /* The whole strip takes its colour from `status`, per the spec. `degraded`
     gets `danger` rather than `warning`: the API is failing its own health
     check, which in this deployment means the database is unreachable — that
     is not "needs attention later". */
  const tint = !data
    ? 'border-border bg-bg-sunken'
    : degraded
      ? 'border-danger/35 bg-danger-muted'
      : 'border-success/30 bg-success-muted'

  return (
    <Card className={cn('overflow-hidden', degraded && 'border-danger/35')}>
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3', tint)}>
        <span
          aria-hidden
          className={cn('shrink-0 [&_svg]:size-5', degraded ? 'text-danger' : 'text-success')}
        >
          {degraded ? <AlertTriangle /> : <CheckCircle2 />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading text-text font-semibold">
            {status.isPending
              ? 'Checking…'
              : status.isError
                ? 'Status unavailable'
                : degraded
                  ? 'Degraded'
                  : 'Operational'}
          </h2>
          <p className="text-caption text-text-muted mt-0.5 truncate">
            {data ? `${data.app} ${data.version} · ${data.environment}` : 'GET /system/status'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data && (
            <span className="text-caption text-text-muted font-mono" title="Instance id">
              {data.instance_id}
            </span>
          )}
          {/* Polled, so it says when it last heard back. A strip that is silently
              15 minutes stale is worse than one that admits it. */}
          <span className="text-caption text-text-subtle">
            {status.dataUpdatedAt > 0
              ? `checked ${formatStampSeconds(new Date(status.dataUpdatedAt).toISOString())}`
              : ''}
          </span>
        </div>
      </div>

      {status.isError ? (
        <div className="p-4">
          <ErrorState error={status.error} onRetry={() => void status.refetch()} compact />
        </div>
      ) : !data ? (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <>
          <div className="border-border grid gap-4 border-b p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label="Process uptime"
              value={formatDuration(data.process_uptime_seconds)}
              hint={`since ${formatStampSeconds(data.process_started_at)}`}
            />
            <Figure
              label="Database latency"
              value={formatMs(data.database_latency_ms)}
              tone={!data.database_ok ? 'danger' : trend === 'sustained' ? 'warning' : 'default'}
              hint={
                !data.database_ok
                  ? 'Unreachable'
                  : trend === 'sustained'
                    ? `over ${LATENCY_ELEVATED_MS} ms for several polls — no longer a cold start`
                    : trend === 'elevated'
                      ? 'high, but a cold start reads like this'
                      : 'Reachable'
              }
            />
            <Meter
              label="Connection pool"
              value={data.pool_in_use}
              max={data.pool_size}
              detail={
                data.pool_overflow != null && data.pool_overflow > 0
                  ? `${data.pool_overflow} overflow connections open`
                  : 'no overflow'
              }
            />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-micro text-text-subtle uppercase">Health sampler</span>
              <Badge tone={data.monitoring_enabled ? 'success' : 'warning'} dot>
                {data.monitoring_enabled ? 'Running' : 'Stopped'}
              </Badge>
              <span className="text-caption text-text-subtle">
                {data.monitoring_enabled
                  ? `probes every ${data.monitoring_interval_seconds}s`
                  : 'no new samples are being written'}
              </span>
            </div>
          </div>

          <div className="p-4">
            <h3 className="text-micro text-text-subtle mb-2 uppercase">Dependencies</h3>
            {data.dependencies.length === 0 ? (
              <p className="text-caption text-text-subtle">This build declares no dependencies.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.dependencies.map((dependency) => (
                  <DependencyChip key={dependency.name} dependency={dependency} />
                ))}
              </ul>
            )}
            <dl className="border-border mt-3 border-t pt-2">
              <KeyValue label="Instance" mono>
                {data.instance_id}
              </KeyValue>
            </dl>
          </div>
        </>
      )}
    </Card>
  )
}

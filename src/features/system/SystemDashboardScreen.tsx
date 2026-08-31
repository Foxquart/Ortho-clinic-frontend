import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/Surface'
import { SegmentedControl } from '@/components/ui/Controls'
import { MONITORING_WINDOWS } from '@/api/schema'
import { DatabasePanel } from './DatabasePanel'
import { ErrorsPanel } from './ErrorsPanel'
import { MetricsPanel } from './MetricsPanel'
import { SecurityPanel } from './SecurityPanel'
import { StatusPanel } from './StatusPanel'
import { StoragePanel } from './StoragePanel'
import { UptimePanel } from './UptimePanel'
import { WINDOW_LABEL } from './systemFormat'
import {
  STATUS_POLL_MS,
  useMonitoringRefresh,
  useSystemDatabase,
  useSystemStatus,
} from './useSystem'
import type { MonitoringWindow } from '@/api/schema'

/*
 * THE SUPERADMIN SYSTEM DASHBOARD
 * ===============================
 * One screen, seven panels, one reader: the vendor's operator, who opened this
 * because something is either wrong or about to be. Nothing on it is for the
 * clinic — `/system/*` 403s for every other account, and the error feed below
 * carries internal exception text for exactly that reason.
 *
 * This is the one screen in the app where density beats calm. The dashboard the
 * surgeon uses answers three questions and stops; this one is a console, and an
 * operator scanning for an anomaly would rather have seven panels in one viewport
 * than four clicks between them.
 *
 * POLLING
 * -------
 * Only `/system/status` polls, every 15 seconds. The other six are
 * aggregations over a window — running them on a timer would cost the database
 * more than the clinic does. They load on view and refresh from the one control
 * in the header. There is no websocket in this deployment.
 *
 * THE WINDOW
 * ----------
 * `1h | 24h | 7d | 30d`, default `24h`, and it drives exactly two panels:
 * uptime and metrics. Status, errors, security, database and storage have no
 * window parameter, so the selector sits with the two panels it governs rather
 * than in the page header, where it would appear to control all seven.
 */

export function SystemDashboardScreen() {
  const [windowKey, setWindowKey] = useState<MonitoringWindow>('24h')

  /* Both of these are already fetched by their own panels; subscribing again
     here reads from the same cache entry rather than issuing a second request.
     The screen needs two facts out of them: whether the sampler is running (so
     uptime and metrics can say their data has stopped moving rather than
     drawing an empty chart), and where the monitoring history begins. */
  const status = useSystemStatus()
  const database = useSystemDatabase()
  const { refresh, isRefreshing } = useMonitoringRefresh()

  return (
    <div className="max-w-content mx-auto flex flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="System"
        description="Live health, availability and traffic for this deployment. Visible to the vendor's operator account only."
        actions={
          <Button
            variant="secondary"
            onClick={refresh}
            loading={isRefreshing}
            iconLeft={
              <RefreshCw
                aria-hidden
                className={cn('size-4', isRefreshing && 'animate-spin motion-reduce:animate-none')}
              />
            }
          >
            Refresh
          </Button>
        }
      />

      <StatusPanel />

      <div className="border-border bg-bg-sunken flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-label text-text font-medium">Window</h2>
          <p className="text-caption text-text-subtle">
            {WINDOW_LABEL[windowKey]} · applies to uptime and traffic. The status strip refreshes
            itself every {STATUS_POLL_MS / 1000} seconds.
          </p>
        </div>
        <SegmentedControl
          label="Monitoring window"
          value={windowKey}
          onChange={setWindowKey}
          options={MONITORING_WINDOWS.map((w) => ({ value: w, label: w }))}
        />
      </div>

      <UptimePanel
        windowKey={windowKey}
        monitoringEnabled={status.data?.monitoring_enabled}
        oldestHealthSample={database.data?.oldest_health_sample}
      />

      <MetricsPanel windowKey={windowKey} monitoringEnabled={status.data?.monitoring_enabled} />

      <ErrorsPanel />

      {/* The reference panels. None of them is time-windowed and none is what
          somebody opens this screen in a hurry for, so they sit last: security
          and the database overview share a row, and storage takes a full one
          because its five-column table needs the width. */}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
        <SecurityPanel />
        <DatabasePanel />
      </div>

      <StoragePanel />
    </div>
  )
}

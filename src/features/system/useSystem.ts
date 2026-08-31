import { useCallback, useEffect, useState } from 'react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type {
  DatabaseOverviewResponse,
  DatabaseStorageResponse,
  ErrorEventResponse,
  MetricsResponse,
  MonitoringWindow,
  SecurityOverviewResponse,
  SystemStatusResponse,
  UptimeResponse,
} from '@/api/schema'

/*
 * The seven monitoring reads.
 *
 * Only `/system/status` polls. It is the "is it up right now" strip and it is
 * cheap; the other six are aggregations over a window and re-running them
 * every fifteen seconds would put more load on the database than the clinic
 * does. They refresh on view and on the explicit control in the page header.
 * There is no websocket in this deployment — do not add one here.
 */

export const STATUS_POLL_MS = 15_000

/** The feed's cap. The endpoint allows 1–200; 50 is its documented default. */
export const ERROR_FEED_LIMIT = 50

export function useSystemStatus() {
  return useQuery({
    queryKey: qk.monitoring.status(),
    queryFn: () => apiGet<SystemStatusResponse>(endpoints.monitoring.status),
    refetchInterval: STATUS_POLL_MS,
    /* A tab nobody is looking at does not need a heartbeat. The first poll
       after it comes back to the foreground refills the strip. */
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}

export function useSystemUptime(windowKey: MonitoringWindow) {
  return useQuery({
    queryKey: qk.monitoring.uptime(windowKey),
    queryFn: () =>
      apiGet<UptimeResponse>(endpoints.monitoring.uptime, { params: { window: windowKey } }),
  })
}

export function useSystemMetrics(windowKey: MonitoringWindow) {
  return useQuery({
    queryKey: qk.monitoring.metrics(windowKey),
    queryFn: () =>
      apiGet<MetricsResponse>(endpoints.monitoring.metrics, { params: { window: windowKey } }),
  })
}

export function useSystemErrors(limit: number = ERROR_FEED_LIMIT) {
  return useQuery({
    queryKey: qk.monitoring.errors(limit),
    queryFn: () => apiGet<ErrorEventResponse[]>(endpoints.monitoring.errors, { params: { limit } }),
  })
}

export function useSystemSecurity() {
  return useQuery({
    queryKey: qk.monitoring.security(),
    queryFn: () => apiGet<SecurityOverviewResponse>(endpoints.monitoring.security),
  })
}

export function useSystemDatabase() {
  return useQuery({
    queryKey: qk.monitoring.database(),
    queryFn: () => apiGet<DatabaseOverviewResponse>(endpoints.monitoring.database),
  })
}

export function useSystemStorage() {
  return useQuery({
    queryKey: qk.monitoring.storage(),
    queryFn: () => apiGet<DatabaseStorageResponse>(endpoints.monitoring.storage),
  })
}

/**
 * The manual refresh. It invalidates the monitoring root rather than calling
 * seven `refetch()`es, so a panel that is currently in its error state is
 * retried by the same control as the six that are fine — and so a window the
 * operator switched away from is not silently left stale in the cache.
 */
export function useMonitoringRefresh(): { refresh: () => void; isRefreshing: boolean } {
  const client = useQueryClient()
  const inFlight = useIsFetching({ queryKey: qk.monitoring.all() })

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: qk.monitoring.all() })
  }, [client])

  return { refresh, isRefreshing: inFlight > 0 }
}

/* -------------------------------------------------------------------------- */
/*  Database latency: one high reading is not an incident                      */
/* -------------------------------------------------------------------------- */

export type LatencyVerdict = 'unknown' | 'normal' | 'elevated' | 'sustained'

/** Above this a reading is worth mentioning. It is not yet worth a colour. */
export const LATENCY_ELEVATED_MS = 400

/** How many consecutive elevated polls (15s apart) before it stops being cold start. */
const SUSTAINED_SAMPLES = 4

/**
 * Serverless Postgres charges the first query after a scale-to-zero for the
 * whole cold start, so `database_latency_ms` in the high hundreds on the first
 * reading of a session is normal and flagging it red trains the operator to
 * ignore the strip. What is *not* normal is the same reading four polls in a
 * row — by then the pool is warm and something else is wrong.
 *
 * This is why the poll interval matters: the verdict is a statement about the
 * last minute of readings, not about one number.
 */
export function useDatabaseLatencyTrend(
  latencyMs: number | null | undefined,
  updatedAt: number,
): LatencyVerdict {
  const [readings, setReadings] = useState<number[]>([])

  useEffect(() => {
    if (updatedAt === 0 || latencyMs == null || !Number.isFinite(latencyMs)) return
    setReadings((prev) => [...prev, latencyMs].slice(-SUSTAINED_SAMPLES))
    // `updatedAt` is deliberately the only dependency: two consecutive polls
    // can report the identical latency, and both still count as observations.
    // Keying on the value itself would drop the second one and the run of four
    // this hook is looking for could never form.
  }, [updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (readings.length === 0) return 'unknown'
  const latest = readings[readings.length - 1]
  if (latest < LATENCY_ELEVATED_MS) return 'normal'
  if (readings.length < SUSTAINED_SAMPLES) return 'elevated'
  return readings.every((ms) => ms >= LATENCY_ELEVATED_MS) ? 'sustained' : 'elevated'
}

import { format } from 'date-fns'
import { parseApiDate } from '@/lib/format'
import type { MetricsPoint, MonitoringWindow } from '@/api/schema'

/*
 * Formatting rules for the monitoring area, kept out of `@/lib/format` because
 * every one of them is an operations convention rather than a clinical one:
 * 24-hour clocks, byte sizes, sub-second latencies and availability figures
 * that must never round in the flattering direction.
 */

export const WINDOW_LABEL: Record<MonitoringWindow, string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}

/**
 * `30 Aug 05:49`. A 24-hour clock, unlike the rest of the app: this reader is
 * correlating a row here against a server log, and server logs do not say "pm".
 */
export function formatStamp(value: string | null | undefined, fallback = '—'): string {
  const d = parseApiDate(value)
  return d ? format(d, 'd MMM HH:mm') : fallback
}

/** Same, to the second — for an incident boundary or an error event. */
export function formatStampSeconds(value: string | null | undefined, fallback = '—'): string {
  const d = parseApiDate(value)
  return d ? format(d, 'd MMM HH:mm:ss') : fallback
}

/**
 * `availability` arrives as an unrounded 0.0–1.0. Two rules, both of them about
 * not lying:
 *
 *   - a perfect window reads "100%", never "1";
 *   - a window with *any* downtime never rounds up to "100%". 99.9994% is not
 *     100%, and a reader who sees 100% beside a listed incident stops trusting
 *     the whole panel. It is clamped to 99.99% instead.
 */
export function formatAvailability(availability: number | null | undefined): string {
  if (availability == null || !Number.isFinite(availability)) return '—'
  if (availability >= 1) return '100%'
  const pct = Math.max(0, Math.min(availability * 100, 99.99))
  const digits = pct >= 99 ? 2 : 1
  return `${Number(pct.toFixed(digits))}%`
}

/** `error_rate` is 5xx ÷ total, 0.0–1.0. Same non-flattering rounding. */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  if (rate === 0) return '0%'
  const pct = rate * 100
  if (pct < 0.01) return '<0.01%'
  return `${Number(pct.toFixed(2))}%`
}

/** `833.62` → `834 ms`; anything past a second reads in seconds. */
export function formatMs(ms: number | null | undefined, fallback = '—'): string {
  if (ms == null || !Number.isFinite(ms)) return fallback
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  if (ms >= 10) return `${Math.round(ms)} ms`
  return `${Number(ms.toFixed(1))} ms`
}

/** Process uptime and incident lengths: the two largest units and no more. */
export function formatDuration(seconds: number | null | undefined, fallback = '—'): string {
  if (seconds == null || !Number.isFinite(seconds)) return fallback
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

export function formatCount(value: number | null | undefined, fallback = '—'): string {
  if (value == null || !Number.isFinite(value)) return fallback
  return value.toLocaleString()
}

/**
 * A 0..100 percentage as the storage endpoint reports them — NOT the 0..1
 * rates `formatRate` takes. One decimal, and no clamp at the top: a database
 * over its quota honestly reads "104.2%".
 */
export function formatPercent(pct: number | null | undefined, fallback = '—'): string {
  if (pct == null || !Number.isFinite(pct)) return fallback
  return `${Number(pct.toFixed(1))}%`
}

/** Binary units, because that is what `pg_database_size` is measured in. */
export function formatBytes(bytes: number | null | undefined, fallback = '—'): string {
  if (bytes == null || !Number.isFinite(bytes)) return fallback
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : Number(value.toFixed(value < 10 ? 1 : 0))} ${units[unit]}`
}

/* -------------------------------------------------------------------------- */
/*  Downsampling                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One SVG point per ~3 device pixels of a full-width sparkline. Past that the
 * polyline is drawing detail the screen cannot resolve, and at 30d the series
 * is ~43k points (30d ÷ 60s, more with several instances reporting) — which is
 * a megabyte of path data for a 40px-tall squiggle.
 */
export const SPARKLINE_POINTS = 200

/**
 * Bucket the series down to at most `target` points.
 *
 * The aggregation is chosen per field rather than uniformly averaged, because
 * averaging is what would make this chart dishonest:
 *
 *   - counters (`requests_total`, `requests_5xx`) are SUMMED, so the area under
 *     the sparkline still equals the traffic that actually happened;
 *   - latencies are reduced with MAX, not mean. A p95 cannot be averaged
 *     across intervals — that is the same arithmetic the backend refuses to do
 *     for the window figure — and a spike that gets averaged away is exactly
 *     the spike somebody opened this screen to find;
 *   - `db_ok` is AND-ed, so a bucket containing one unhealthy probe reads as
 *     unhealthy rather than being outvoted by its neighbours.
 *
 * The bucket's timestamp is its first sample's, so the x-axis stays monotonic
 * and a hovered value can still be traced back to a real observation.
 */
export function downsampleSeries(
  series: readonly MetricsPoint[],
  target: number = SPARKLINE_POINTS,
): MetricsPoint[] {
  if (series.length <= target || target < 1) return series.slice()

  const bucket = series.length / target
  const out: MetricsPoint[] = []

  for (let i = 0; i < target; i += 1) {
    const start = Math.floor(i * bucket)
    const end = Math.min(series.length, Math.floor((i + 1) * bucket))
    if (end <= start) continue

    let requests = 0
    let errors = 0
    let p95: number | null = null
    let dbLatency: number | null = null
    let dbOk = true

    for (let j = start; j < end; j += 1) {
      const point = series[j]
      requests += point.requests_total
      errors += point.requests_5xx
      if (point.latency_p95_ms != null) {
        p95 = p95 == null ? point.latency_p95_ms : Math.max(p95, point.latency_p95_ms)
      }
      if (point.db_latency_ms != null) {
        dbLatency =
          dbLatency == null ? point.db_latency_ms : Math.max(dbLatency, point.db_latency_ms)
      }
      if (!point.db_ok) dbOk = false
    }

    out.push({
      observed_at: series[start].observed_at,
      requests_total: requests,
      requests_5xx: errors,
      latency_p95_ms: p95,
      db_latency_ms: dbLatency,
      db_ok: dbOk,
    })
  }

  return out
}

/**
 * The last value the API actually reported, ignoring trailing nulls. A
 * sparkline's text fallback has to quote a real reading, not "—" because the
 * final probe happened to miss.
 */
export function lastReading(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

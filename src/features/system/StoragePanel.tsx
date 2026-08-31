import { EmptyState } from '@/components/ui/Feedback'
import { Table, TD, TH, THead, TR } from '@/components/ui/Table'
import { cn } from '@/lib/cn'
import { Panel, PanelState } from './systemParts'
import { DonutChart, ProgressRing } from './RingCharts'
import { formatBytes, formatCount, formatPercent } from './systemFormat'
import { useSystemStorage } from './useSystem'
import type { StorageBreakdown } from '@/api/schema'

/*
 * 5.7 — where the bytes are, against the quota.
 *
 * `storage_limit_bytes` is the ceiling the server was CONFIGURED with, not a
 * live figure from the provider — Neon's real quota is not queryable over SQL.
 * That is also why `percent_used` may honestly exceed 100: the configured
 * number can lag behind reality, and a database over its quota should read as
 * over, not clamped to full.
 *
 * The sizes here are the ones `TableStat` deliberately omits: `DatabasePanel`
 * answers "how many rows", this panel answers "whose bytes" — the question the
 * operator has when the capacity ring starts running warm.
 *
 * Both rings are glances; the numbers beside them and the table below are the
 * answer. Nothing on this panel is carried by colour alone.
 */

/** A quota is approached slowly; 80% is when there is still time to act. */
const STORAGE_WARN_RATIO = 0.8

/** Fixed slot order — the legend, the donut and the swatches all share it. */
const BREAKDOWN_SLOTS = [
  {
    key: 'tables',
    label: 'Tables',
    hint: null,
    stroke: 'stroke-chart-1',
    swatch: 'bg-chart-1',
    bytes: (b: StorageBreakdown) => b.tables_bytes,
    percent: (b: StorageBreakdown) => b.tables_percent,
  },
  {
    key: 'indexes',
    label: 'Indexes',
    hint: null,
    stroke: 'stroke-chart-2',
    swatch: 'bg-chart-2',
    bytes: (b: StorageBreakdown) => b.indexes_bytes,
    percent: (b: StorageBreakdown) => b.indexes_percent,
  },
  {
    key: 'toast',
    label: 'TOAST',
    hint: 'oversized values stored out of line',
    stroke: 'stroke-chart-3',
    swatch: 'bg-chart-3',
    bytes: (b: StorageBreakdown) => b.toast_bytes,
    percent: (b: StorageBreakdown) => b.toast_percent,
  },
  {
    key: 'other',
    label: 'Other',
    hint: 'catalogs and bookkeeping',
    stroke: 'stroke-chart-4',
    swatch: 'bg-chart-4',
    bytes: (b: StorageBreakdown) => b.other_bytes,
    percent: (b: StorageBreakdown) => b.other_percent,
  },
] as const

export function StoragePanel() {
  const storage = useSystemStorage()
  const data = storage.data

  const ratio = data && data.storage_limit_bytes > 0 ? data.percent_used / 100 : 0
  /* Over quota outranks warm — the ring is the first thing read on this panel. */
  const capacityStroke =
    ratio >= 1 ? 'stroke-danger' : ratio >= STORAGE_WARN_RATIO ? 'stroke-warning' : 'stroke-accent'

  return (
    <Panel title="Storage" description="Database size against the configured quota, and where the bytes are.">
      <PanelState
        pending={storage.isPending}
        error={storage.error}
        onRetry={() => void storage.refetch()}
      >
        {data && (
          <>
            <div className="border-border grid gap-6 border-b p-4 sm:grid-cols-2">
              {/* Capacity — one number against its ceiling, so a ring. */}
              <div className="flex items-center gap-4">
                <ProgressRing
                  ratio={ratio}
                  strokeClass={capacityStroke}
                  className="size-28 shrink-0 sm:size-32"
                >
                  <span data-numeric className="text-heading leading-none font-semibold tracking-tight">
                    {formatPercent(data.percent_used)}
                  </span>
                  <span className="text-micro text-text-subtle mt-1 uppercase">used</span>
                </ProgressRing>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-micro text-text-subtle uppercase">Capacity</span>
                  <span data-numeric className="text-label text-text font-medium">
                    {formatBytes(data.database_size_bytes)} of {formatBytes(data.storage_limit_bytes)}
                  </span>
                  <span className="text-caption text-text-subtle">
                    {formatBytes(data.remaining_bytes)} remaining against the configured quota — not a
                    live figure from the provider
                  </span>
                </div>
              </div>

              {/* Breakdown — whose bytes. The donut is the glance, the legend
                  is the same four figures the old grid carried, kept as text. */}
              <div className="flex items-center gap-4">
                <DonutChart
                  segments={BREAKDOWN_SLOTS.map((slot) => ({
                    key: slot.key,
                    value: slot.bytes(data.breakdown),
                    strokeClass: slot.stroke,
                  }))}
                  className="size-28 shrink-0 sm:size-32"
                >
                  <span data-numeric className="text-label leading-none font-semibold tracking-tight">
                    {formatBytes(data.database_size_bytes)}
                  </span>
                  <span className="text-micro text-text-subtle mt-1 uppercase">database</span>
                </DonutChart>
                <dl className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {BREAKDOWN_SLOTS.map((slot) => (
                    <div key={slot.key} className="flex items-baseline gap-2">
                      <span aria-hidden className={cn('size-2.5 shrink-0 self-center rounded-[3px]', slot.swatch)} />
                      <dt
                        className="text-caption text-text-muted min-w-0 truncate"
                        title={slot.hint ?? undefined}
                      >
                        {slot.label}
                      </dt>
                      <dd data-numeric className="text-caption text-text ml-auto shrink-0 font-medium">
                        {formatBytes(slot.bytes(data.breakdown))}
                      </dd>
                      <dd data-numeric className="text-caption text-text-subtle w-12 shrink-0 text-right">
                        {formatPercent(slot.percent(data.breakdown))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {data.tables.length === 0 ? (
              <EmptyState
                title="No table sizes"
                description="The database reported no user tables to measure."
                className="py-8"
              />
            ) : (
              <Table label="Table sizes">
                <THead>
                  <TH>Table</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Table / index</TH>
                  {/* "approx." for the same reason as the row counts next door:
                      these are the planner's live-tuple estimates. */}
                  <TH align="right">Rows (approx.)</TH>
                  <TH align="right">% of DB</TH>
                </THead>
                <tbody>
                  {data.tables.map((table) => (
                    <TR key={table.name}>
                      <TD className="text-caption font-mono">{table.name}</TD>
                      <TD align="right" numeric>
                        {formatBytes(table.total_bytes)}
                      </TD>
                      <TD align="right" numeric className="text-text-muted">
                        {formatBytes(table.table_bytes)} / {formatBytes(table.index_bytes)}
                      </TD>
                      <TD align="right" numeric className="text-text-muted">
                        ~{formatCount(table.live_rows)}
                      </TD>
                      <TD align="right" numeric className="text-text-muted">
                        {formatPercent(table.percent_of_database)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </PanelState>
    </Panel>
  )
}

import { EmptyState } from '@/components/ui/Feedback'
import { Table, TD, TH, THead, TR } from '@/components/ui/Table'
import { Figure, Meter, Panel, PanelState } from './systemParts'
import { formatBytes, formatCount, formatStamp } from './systemFormat'
import { useSystemDatabase } from './useSystem'

/*
 * 5.6 — size, connections and per-table stats.
 *
 * `estimated_rows` is the query planner's estimate from `pg_class.reltuples`,
 * not `COUNT(*)`. It is labelled "approx." everywhere it appears, because an
 * exact count of every table on each dashboard load would sequentially scan the
 * database — which would make opening this screen the most expensive thing the
 * clinic's server does all day.
 *
 * `oldest_health_sample` is the true beginning of the monitoring history and is
 * repeated in the uptime panel, since it is the floor that `coverage_start`
 * clamps to.
 */

export function DatabasePanel() {
  const database = useSystemDatabase()
  const data = database.data

  return (
    <Panel title="Database" description="Storage, connections and the monitoring history.">
      <PanelState
        pending={database.isPending}
        error={database.error}
        onRetry={() => void database.refetch()}
      >
        {data && (
          <>
            <div className="border-border grid gap-4 border-b p-4 sm:grid-cols-2">
              <Figure label="Database" value={data.database} hint={formatBytes(data.size_bytes)} />
              <Meter
                label="Connections"
                value={data.connections}
                max={data.max_connections}
                detail="open server connections against the configured ceiling"
              />
              <Figure
                label="Health samples"
                value={formatCount(data.health_sample_rows)}
                hint="rows in the monitoring history"
              />
              <Figure
                label="History begins"
                value={data.oldest_health_sample ? formatStamp(data.oldest_health_sample) : '—'}
                hint={
                  data.oldest_health_sample
                    ? 'uptime coverage cannot start before this'
                    : 'no samples recorded yet'
                }
              />
            </div>

            {data.tables.length === 0 ? (
              <EmptyState
                title="No table statistics"
                description="The planner has no size estimates for this database yet."
                className="py-8"
              />
            ) : (
              <Table label="Table row counts">
                <THead>
                  <TH>Table</TH>
                  {/* "approx." is part of the column header, not a footnote —
                      a footnote under a table of exact-looking integers is read
                      after the number has already been believed. */}
                  <TH align="right">Rows (approx.)</TH>
                </THead>
                <tbody>
                  {data.tables.map((table) => (
                    <TR key={table.table}>
                      <TD className="text-caption font-mono">{table.table}</TD>
                      <TD align="right" numeric className="text-text-muted">
                        ~{formatCount(table.estimated_rows)}
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

import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { formatAgo } from '@/lib/format'
import { CopyValue, Panel, PanelState } from './systemParts'
import { formatStampSeconds } from './systemFormat'
import { ERROR_FEED_LIMIT, useSystemErrors } from './useSystem'
import type { ErrorEventResponse } from '@/api/schema'

/*
 * 5.4 — the recent 5xx feed. Newest first, and 5xx only: a 404 or a 403 is the
 * API working as designed and would bury the rows that are not.
 *
 * The order comes from the server and is left alone. Re-sorting here would
 * silently disagree with the feed the operator is quoting from.
 *
 * `message` can carry internal detail — a driver error, a stack frame, a
 * fragment of a query. That is precisely why the whole `/system/*` area sits
 * behind the superadmin gate, and why this row is rendered inline here rather
 * than lifted into `components/ui`: a shared error-row primitive is one import
 * away from appearing on a clinic-facing screen.
 */

function ErrorRow({ event }: { event: ErrorEventResponse }) {
  return (
    <li className="border-border flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="danger" dot>
          {event.status_code}
        </Badge>
        <span className="text-caption text-text-muted font-mono font-semibold uppercase">
          {event.method}
        </span>
        <span
          className="text-caption text-text min-w-0 flex-1 truncate font-mono"
          title={event.path}
        >
          {event.path}
        </span>
        <span data-numeric className="text-caption text-text-subtle shrink-0">
          {formatStampSeconds(event.occurred_at)} · {formatAgo(event.occurred_at)}
        </span>
      </div>

      {event.exception_type && (
        <p className="text-caption text-danger-muted-fg font-mono">{event.exception_type}</p>
      )}
      {event.message && (
        <p className="text-caption text-text-muted max-w-prose break-words">{event.message}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* The single most useful thing to quote in a support ticket: it is the
            value the client was handed in `X-Correlation-Id` and the value that
            appears in the server log, so it joins the two ends of a report. */}
        {event.correlation_id ? (
          <span className="flex min-w-0 items-center gap-1">
            <span className="text-caption text-text-subtle shrink-0">ref</span>
            <CopyValue value={event.correlation_id} what="correlation id" />
          </span>
        ) : (
          <span className="text-caption text-text-subtle">no correlation id recorded</span>
        )}
        {event.ip_address && (
          <span className="text-caption text-text-subtle font-mono">{event.ip_address}</span>
        )}
        {event.user_id && (
          <span className="text-caption text-text-subtle truncate font-mono" title={event.user_id}>
            user {event.user_id.slice(0, 8)}
          </span>
        )}
      </div>
    </li>
  )
}

export function ErrorsPanel() {
  const errors = useSystemErrors(ERROR_FEED_LIMIT)
  const data = errors.data

  return (
    <Panel
      title="Recent errors"
      description={`The last ${ERROR_FEED_LIMIT} server errors. 5xx only — newest first.`}
      action={data && data.length > 0 ? <Badge tone="danger">{data.length}</Badge> : undefined}
    >
      <PanelState
        pending={errors.isPending}
        error={errors.error}
        onRetry={() => void errors.refetch()}
      >
        {data && data.length === 0 ? (
          <EmptyState
            title="No server errors"
            description="Nothing in the retained window returned a 5xx. Client errors are not shown here by design."
          />
        ) : (
          <ul className="scrollbar-subtle max-h-[32rem] overflow-y-auto">
            {data?.map((event) => (
              <ErrorRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </PanelState>
    </Panel>
  )
}

import { ShieldAlert } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Figure, Panel, PanelState } from './systemParts'
import { formatCount } from './systemFormat'
import { useSystemSecurity } from './useSystem'

/*
 * 5.5 — sessions, logins and the population of accounts.
 */

/**
 * The signal the spec asks for: failed sign-ins climbing while successful ones
 * do not. `/system/security` returns a 24-hour SNAPSHOT and no history, so
 * "climbing" cannot be measured directly from one response — it is inferred
 * from the shape of the pair instead.
 *
 * The thresholds are a judgement call and are stated plainly rather than
 * hidden: five failures is past the range of one person fumbling a password on
 * a phone keyboard, and a ratio of 3:1 against successes is the point where the
 * failures stop looking like the clinic's own staff. Below that this returns
 * nothing at all — a badge that fires on two typos is a badge that gets
 * ignored the week it matters.
 */
function failedLoginSignal(
  failed: number,
  successful: number,
): { tone: BadgeTone; label: string; detail: string } | null {
  if (failed < 5) return null
  if (successful === 0) {
    return {
      tone: 'danger',
      label: 'Failures with no successes',
      detail: `${formatCount(failed)} failed sign-ins in 24 hours and not one success. That is the shape of somebody guessing, not of somebody mistyping.`,
    }
  }
  if (failed >= successful * 3) {
    return {
      tone: 'warning',
      label: 'Failures outpacing sign-ins',
      detail: `${formatCount(failed)} failures against ${formatCount(successful)} successful sign-ins. Worth knowing which account, and from where.`,
    }
  }
  return null
}

export function SecurityPanel() {
  const security = useSystemSecurity()
  const data = security.data
  const signal = data ? failedLoginSignal(data.failed_logins_24h, data.successful_logins_24h) : null

  /* `users_by_role` is keyed by role KEY and roles are rows, not an enum — a
     clinic can define `reception_x1` tomorrow. So this renders whatever keys
     arrive, in count order, and shows the raw key in mono rather than guessing
     at a display name: the name lives on the role record, which this endpoint
     does not return. */
  const roles = data
    ? Object.entries(data.users_by_role).sort(
        ([aKey, aCount], [bKey, bCount]) => bCount - aCount || aKey.localeCompare(bKey),
      )
    : []

  return (
    <Panel title="Sessions and accounts" description="Signed-in activity over the last 24 hours.">
      <PanelState
        pending={security.isPending}
        error={security.error}
        onRetry={() => void security.refetch()}
      >
        {data && (
          <>
            {signal && (
              <div
                className={
                  signal.tone === 'danger'
                    ? 'border-danger/35 bg-danger-muted flex items-start gap-2 border-b px-4 py-2.5'
                    : 'border-warning/30 bg-warning-muted flex items-start gap-2 border-b px-4 py-2.5'
                }
              >
                <ShieldAlert
                  aria-hidden
                  className={
                    signal.tone === 'danger'
                      ? 'text-danger mt-0.5 size-4 shrink-0'
                      : 'text-warning mt-0.5 size-4 shrink-0'
                  }
                />
                <div className="min-w-0">
                  <p className="text-label text-text font-medium">{signal.label}</p>
                  <p className="text-caption text-text-muted mt-0.5 max-w-prose">{signal.detail}</p>
                </div>
              </div>
            )}

            <div className="border-border grid gap-4 border-b p-4 sm:grid-cols-2">
              <Figure
                label="Active sessions"
                value={formatCount(data.active_sessions)}
                hint="signed in right now"
              />
              <Figure
                label="Sessions started"
                value={formatCount(data.sessions_last_24h)}
                hint="last 24 hours"
              />
              <Figure
                label="Successful sign-ins"
                value={formatCount(data.successful_logins_24h)}
                hint="last 24 hours"
              />
              <Figure
                label="Failed sign-ins"
                value={formatCount(data.failed_logins_24h)}
                hint="last 24 hours"
                tone={signal ? (signal.tone === 'danger' ? 'danger' : 'warning') : 'default'}
              />
            </div>

            <div className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-micro text-text-subtle uppercase">Accounts by role</h3>
                <span className="flex items-center gap-2">
                  <Badge tone="success" dot>
                    {formatCount(data.active_users)} active
                  </Badge>
                  <Badge tone="neutral" dot>
                    {formatCount(data.inactive_users)} inactive
                  </Badge>
                </span>
              </div>
              {roles.length === 0 ? (
                <p className="text-caption text-text-subtle mt-2">No accounts reported.</p>
              ) : (
                <dl className="divide-border mt-2 divide-y">
                  {roles.map(([key, count]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="text-caption text-text-muted min-w-0 truncate font-mono">
                        {key}
                      </dt>
                      <dd data-numeric className="text-label text-text shrink-0 font-medium">
                        {formatCount(count)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </>
        )}
      </PanelState>
    </Panel>
  )
}

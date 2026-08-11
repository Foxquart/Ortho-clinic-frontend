import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { formatDateTime } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Surface'
import { Field, Input } from '@/components/ui/Input'
import { Select, type SelectOption } from '@/components/ui/Controls'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import { Pagination, TD, TH, THead, TR, Table } from '@/components/ui/Table'
import { repairPage } from '@/lib/pagination'
import { AuditDetailSheet } from './AuditDetailSheet'
import { AUDIT_ACTIONS } from '@/api/schema'
import type { AuditLogResponse, Paginated, UserResponse } from '@/api/schema'

const ANY = '__any__'
const PAGE_SIZES = ['25', '50', '100', '200'] as const

const ACTION_OPTIONS: readonly SelectOption[] = [
  { value: ANY, label: 'Any action' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action, label: action })),
]

const SIZE_OPTIONS: readonly SelectOption[] = PAGE_SIZES.map((n) => ({
  value: n,
  label: `${n} rows`,
}))

export function AuditLogScreen() {
  const [params, setParams] = useSearchParams()

  const userId = params.get('user') ?? ''
  const entityType = params.get('entity') ?? ''
  const action = params.get('action') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const pageSize = PAGE_SIZES.includes((params.get('size') ?? '') as (typeof PAGE_SIZES)[number])
    ? Number(params.get('size'))
    : 50

  /** Every filter lives in the URL, so a view can be pasted into a message. */
  const update = (patch: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!keepPage) next.delete('page')
    setParams(next, { replace: true })
  }

  // The entity filter is free text, so it is debounced before it becomes a URL
  // change and a request.
  const [entityDraft, setEntityDraft] = useState(entityType)
  const debouncedEntity = useDebouncedValue(entityDraft.trim(), 300)
  useEffect(() => {
    if (debouncedEntity === entityType) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debouncedEntity === '') next.delete('entity')
        else next.set('entity', debouncedEntity)
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [debouncedEntity, entityType, setParams])

  const logs = useQuery({
    queryKey: qk.auditLogs.list({
      user_id: userId || null,
      entity_type: entityType || null,
      page,
      page_size: pageSize,
    }),
    queryFn: () =>
      apiGet<Paginated<AuditLogResponse>>(endpoints.auditLogs.list, {
        params: {
          page,
          page_size: pageSize,
          ...(userId ? { user_id: userId } : {}),
          ...(entityType ? { entity_type: entityType } : {}),
        },
      }),
    placeholderData: keepPreviousData,
  })

  // Unfiltered, this endpoint reports total: 1 no matter how many rows exist,
  // which would strand every record past the first page. See repairPage.
  const paging = repairPage(logs.data)

  // Actors are ids in the log; this turns them into the names of real people.
  const users = useQuery({
    queryKey: qk.users.list({ page: 1, page_size: 200 }),
    queryFn: () =>
      apiGet<Paginated<UserResponse>>(endpoints.users.list, {
        params: { page: 1, page_size: 200 },
      }),
    staleTime: 5 * 60_000,
  })

  const actorName = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of users.data?.items ?? []) map.set(u.id, u.full_name || u.username)
    return map
  }, [users.data])

  const userOptions = useMemo<readonly SelectOption[]>(
    () => [
      { value: ANY, label: 'Anyone' },
      ...(users.data?.items ?? []).map((u) => ({
        value: u.id,
        label: u.full_name || u.username,
        description: u.username,
      })),
    ],
    [users.data],
  )

  const rows = logs.data?.items ?? []
  // The API has no `action` query parameter — this one filter is applied to the
  // page in the browser, and the note under the table says so.
  const visible = action ? rows.filter((r) => r.action === action) : rows
  const entitySuggestions = useMemo(
    () => Array.from(new Set((logs.data?.items ?? []).map((r) => r.entity_type))).sort(),
    [logs.data],
  )

  const [selected, setSelected] = useState<AuditLogResponse | null>(null)
  const hasFilters = Boolean(userId || entityType || action)

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-body text-text-muted">
        What the server recorded, newest first, exactly as it was written. Nothing here can be
        edited or removed.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Actor" className="w-52">
          {(a) => (
            <Select
              {...a}
              size="sm"
              value={userId || ANY}
              onChange={(v) => update({ user: v === ANY ? '' : v })}
              options={userOptions}
            />
          )}
        </Field>

        <Field label="Entity type" className="w-44">
          {(a) => (
            <>
              <Input
                {...a}
                inputSize="sm"
                list="audit-entity-types"
                placeholder="patient, user…"
                className="font-mono"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={entityDraft}
                onChange={(e) => setEntityDraft(e.target.value)}
              />
              <datalist id="audit-entity-types">
                {entitySuggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="Action" className="w-44">
          {(a) => (
            <Select
              {...a}
              size="sm"
              value={action || ANY}
              onChange={(v) => update({ action: v === ANY ? '' : v })}
              options={ACTION_OPTIONS}
            />
          )}
        </Field>

        <Field label="Page size" className="w-28">
          {(a) => (
            <Select
              {...a}
              size="sm"
              value={String(pageSize)}
              onChange={(v) => update({ size: v })}
              options={SIZE_OPTIONS}
            />
          )}
        </Field>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => {
              setEntityDraft('')
              setParams(new URLSearchParams(), { replace: true })
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {logs.isError && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}

      <Card className="overflow-hidden">
        {logs.isPending ? (
          <SkeletonRows rows={12} className="p-2" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title={hasFilters ? 'No entries match these filters' : 'Nothing has been recorded yet'}
            description={
              hasFilters
                ? 'The audit log is written by the server as people work. Widen the filters to see more.'
                : 'Every sign-in, edit and print is recorded here as it happens.'
            }
            action={
              hasFilters && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEntityDraft('')
                    setParams(new URLSearchParams(), { replace: true })
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table className="text-caption">
              <THead>
                <TH width="12rem">Timestamp</TH>
                <TH width="11rem">Actor</TH>
                <TH width="8rem">Action</TH>
                <TH width="8rem">Entity</TH>
                <TH width="14rem">Entity id</TH>
                <TH>Summary</TH>
              </THead>
              <tbody>
                {visible.map((entry) => (
                  <TR key={entry.id} onClick={() => setSelected(entry)}>
                    <TD className="whitespace-nowrap py-1 font-mono text-text-muted">
                      <time dateTime={entry.created_at} title={entry.created_at}>
                        {formatDateTime(entry.created_at)}
                      </time>
                    </TD>
                    <TD className="max-w-44 truncate py-1">
                      {entry.user_id ? (
                        (actorName.get(entry.user_id) ?? (
                          <span className="font-mono text-text-subtle">{entry.user_id}</span>
                        ))
                      ) : (
                        <span className="text-text-subtle">system</span>
                      )}
                    </TD>
                    <TD className="py-1 font-mono">{entry.action}</TD>
                    <TD className="py-1 font-mono text-text-muted">{entry.entity_type}</TD>
                    <TD className="max-w-56 truncate py-1 font-mono text-text-subtle">
                      {entry.entity_id ? (
                        <span title={entry.entity_id}>{entry.entity_id}</span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="max-w-md truncate py-1 text-text-muted">
                      {entry.summary ?? ''}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            {paging && (
              <>
                <Pagination
                  page={paging.page}
                  pages={paging.pages}
                  total={paging.total}
                  pageSize={paging.page_size}
                  onPageChange={(next) => update({ page: String(next) }, true)}
                />
                {!paging.exact && (
                  <p className="px-3 pb-2 text-caption text-text-subtle">
                    The server does not report a correct total for an unfiltered audit
                    query, so the count above is a floor. Filter by actor or entity type
                    for an exact one.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </Card>

      {action && (
        <p className="text-caption text-text-subtle">
          Showing {visible.length} of {rows.length} rows on this page. The API cannot filter by
          action, so the action filter is applied in the browser to the current page only —
          paging and totals ignore it.
        </p>
      )}

      {selected && (
        <AuditDetailSheet
          key={selected.id}
          entry={selected}
          actor={selected.user_id ? (actorName.get(selected.user_id) ?? null) : null}
          open
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </div>
  )
}

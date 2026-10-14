/**
 * `/prescriptions` — built for a clinic that writes ~100 a day.
 *
 * The default view is TODAY, newest first, grouped under sticky day headers; a
 * doctor opening the page sees today's patients and nothing else. Anything older
 * is one chip or one keystroke away: `/` jumps to search, which matches patient
 * name, phone and Rx number on the server and — unless a range was chosen on
 * purpose — looks across all dates, because the patient you are hunting for was
 * rarely here today. Nothing loads more than 25 rows at a time.
 *
 * All view state lives in the URL (`range`, `q`, `patient_id`) so back/forward
 * and "open a prescription, come back" land exactly where the doctor was.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { FileText, Plus, SearchX, User, X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { formatDate, fullName } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { isTypingTarget } from '@/app/useGoToShortcuts'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import { DayHeader, RxListSkeleton, RxRow } from './list/RxRow'
import { RxToolbar } from './list/RxToolbar'
import {
  dayLabel,
  groupByDay,
  isIsoDay,
  isSingleDay,
  rangeBounds,
  resolveRange,
} from './list/range'
import type { ListPrescriptionsParams } from '@/api/endpoints'
import type {
  Paginated,
  PatientResponse,
  PrescriptionResponse,
  PrescriptionStatsToday,
} from '@/api/schema'

const PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 250
/** `q` is 1..100 on the API. */
const Q_MAX = 100

/** "today", "in the last 7 days" etc. for the header line. */
function scopeWords(range: string, q: string): string {
  if (range === 'today') return 'today'
  if (range === 'yesterday') return 'yesterday'
  if (range === '7d') return 'in the last 7 days'
  if (isIsoDay(range)) return `on ${formatDate(range)}`
  return q ? 'across all dates' : 'in total'
}

interface EmptyCopy {
  title: string
  en: string
  /** The one sensible widening, offered as a button. */
  next?: { label: string; range: string }
}

/** Empty states say what is true and what to do next — never just "No data". */
function emptyCopy(range: string, q: string): EmptyCopy {
  if (q) {
    return {
      title: `No prescriptions match “${q}”`,
      en: 'Try the first letters of the name, the phone number, or the Rx number.',
      next:
        range === 'all'
          ? undefined
          : { label: 'Search all dates', range: 'all' },
    }
  }
  switch (range) {
    case 'today':
      return {
        title: 'No prescriptions yet today',
        en: 'They show up here the moment one is written.',
        next: { label: 'See yesterday', range: 'yesterday' },
      }
    case 'yesterday':
      return {
        title: 'Nothing was written yesterday',
        en: 'Check the last week to find an older one.',
        next: { label: 'See last 7 days', range: '7d' },
      }
    case '7d':
      return {
        title: 'No prescriptions in the last 7 days',
        en: 'Older ones are filed under All.',
        next: { label: 'See all', range: 'all' },
      }
    case 'all':
      return {
        title: 'No prescriptions yet',
        en: 'Every prescription written on the pad is filed here.',
      }
    default:
      return {
        title: `No prescriptions on ${formatDate(range)}`,
        en: 'Pick another day, or look at everything.',
        next: { label: 'See all', range: 'all' },
      }
  }
}

export function PrescriptionListScreen() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  /* `patient_id` is the canonical filter param — it is the API's own spelling.
     `patientId` is accepted as an alias so a link written in the pad's camelCase
     convention still lands on a filtered list rather than the unfiltered one. */
  const patientId = searchParams.get('patient_id') ?? searchParams.get('patientId')
  const urlQ = (searchParams.get('q') ?? '').trim().slice(0, Q_MAX)
  const range = resolveRange(searchParams.get('range'), Boolean(urlQ || patientId))

  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(next)) {
            if (value === null) params.delete(key)
            else params.set(key, value)
          }
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  /* The debounced write below fires 250ms after the last keystroke, from a
     closure made at that keystroke. React Router's functional updater reads the
     params of the render that created it, so a chip clicked inside that window
     would be overwritten. Always calling the latest `patch` avoids that. */
  const patchRef = useRef(patch)
  useEffect(() => {
    patchRef.current = patch
  })

  const clearPatientFilter = () => patch({ patient_id: null, patientId: null })
  const setRange = (next: string) => patch({ range: next })

  /* ---- search: typing is local, the URL (and so the query) follows 250ms later ---- */
  const searchRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(urlQ)
  const writeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(writeTimer.current), [])

  const onTextChange = (value: string) => {
    setText(value)
    window.clearTimeout(writeTimer.current)
    writeTimer.current = window.setTimeout(
      () => patchRef.current({ q: value.trim().slice(0, Q_MAX) || null }),
      SEARCH_DEBOUNCE_MS,
    )
  }
  const clearSearch = () => {
    window.clearTimeout(writeTimer.current)
    setText('')
    patch({ q: null })
  }

  /* ---- data ---- */
  const params: ListPrescriptionsParams = {
    page_size: PAGE_SIZE,
    sort_by: 'created_at',
    sort_order: 'desc',
    ...rangeBounds(range),
    ...(urlQ ? { q: urlQ } : {}),
    ...(patientId ? { patient_id: patientId } : {}),
  }

  const feed = useInfiniteQuery({
    queryKey: [...qk.prescriptions.all(), 'feed', params] as const,
    queryFn: ({ pageParam }) =>
      apiGet<Paginated<PrescriptionResponse>>(endpoints.prescriptions.list, {
        params: { ...params, page: pageParam },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    // A new filter must not blank the list the doctor is reading.
    placeholderData: keepPreviousData,
  })

  /* Chip counts. Decoration, not a dependency: if this fails the chips simply
     show no number. */
  const stats = useQuery({
    queryKey: [...qk.prescriptions.all(), 'stats-today'] as const,
    queryFn: () => apiGet<PrescriptionStatsToday>(endpoints.prescriptions.statsToday),
    staleTime: 60_000,
  })

  /* The filtered empty state has to name the patient even when the list comes
     back with zero rows, so the name cannot come from the rows themselves. */
  const patient = useQuery({
    queryKey: qk.patients.detail(patientId ?? ''),
    queryFn: () => apiGet<PatientResponse>(endpoints.patients.byId(patientId as string)),
    enabled: Boolean(patientId),
  })

  /* A new prescription landing between two "Load more" clicks shifts every
     later row down by one, so page 2 can repeat the last row of page 1. */
  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: PrescriptionResponse[] = []
    for (const page of feed.data?.pages ?? []) {
      for (const rx of page.items) {
        if (seen.has(rx.id)) continue
        seen.add(rx.id)
        out.push(rx)
      }
    }
    return out
  }, [feed.data])
  const groups = useMemo(() => groupByDay(rows), [rows])
  const total = feed.data?.pages[feed.data.pages.length - 1]?.total ?? 0

  const filterName = patient.data
    ? fullName(patient.data.first_name, patient.data.last_name)
    : (rows[0]?.patient_name ?? 'this patient')

  const canWrite = can('prescription.write')
  const newHref = patientId ? `/prescriptions/new?patientId=${patientId}` : '/prescriptions/new'

  const isEmpty = Boolean(feed.data) && rows.length === 0
  /* A plain empty range owns a "New prescription" button of its own, and one
     view gets one primary button — so the header and phone "+" step aside. */
  const emptyOwnsNew = isEmpty && canWrite && !urlQ
  const showNew = canWrite && !emptyOwnsNew

  /* ---- keyboard ---- */
  const listRef = useRef<HTMLDivElement>(null)
  const rowLinks = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('[data-rx-row]') ?? [])

  /* `/` = search, `n` = new (the reserved table in navigation.ts). Both are
     ignored while typing, and `n` is never bound for someone the guard would bounce. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (canWrite && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        navigate(newHref)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canWrite, navigate, newHref])

  /* ↑ ↓ walk the rows, so a hundred-row day is not a hundred Tab presses. */
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = rowLinks()
    const at = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (at === -1) return
    e.preventDefault()
    if (e.key === 'ArrowUp' && at === 0) searchRef.current?.focus()
    else links[at + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
  }

  /* Keyboard focus would otherwise stay on a button that has just slid down
     below the rows it loaded. Hand it to the first new row. */
  const loadMore = async () => {
    const before = rows.length
    await feed.fetchNextPage()
    requestAnimationFrame(() => rowLinks()[before]?.focus())
  }

  /* ---- copy ---- */
  const scope = scopeWords(range, urlQ)
  const noun = total === 1 ? 'prescription' : 'prescriptions'
  const countLine = `${total.toLocaleString()} ${noun}${urlQ ? ` matching “${urlQ}”` : ''} ${scope}`
  const empty = emptyCopy(range, urlQ)

  return (
    <div className="max-w-content flex flex-col gap-4 px-4 py-6 sm:px-6">
      <PageHeader
        /* The header button is hidden below `sm` (the toolbar has a "+" there),
           so the empty actions row must not leave its flex gap behind. */
        className="gap-0 sm:gap-4"
        title="Prescriptions"
        description={<span aria-live="polite">{feed.data ? countLine : 'Newest first.'}</span>}
        actions={
          showNew && (
            <Button
              variant="primary"
              onClick={() => navigate(newHref)}
              iconLeft={<Plus className="size-4" />}
              className="hidden sm:inline-flex"
            >
              New prescription
            </Button>
          )
        }
      />

      {patientId && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-accent border-accent/25 bg-accent-muted inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 font-medium">
            <User aria-hidden className="size-3.5" />
            <span className="max-w-60 truncate">{filterName}</span>
            <button
              type="button"
              aria-label={`Clear filter for ${filterName}`}
              onClick={clearPatientFilter}
              className="text-accent duration-instant hover:bg-accent/15 focus-visible:outline-focus grid size-4.5 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
          <Link
            to={`/patients/${patientId}`}
            className="text-caption text-text-muted duration-fast hover:text-text underline-offset-4 transition-colors hover:underline"
          >
            Open patient record
          </Link>
        </div>
      )}

      <RxToolbar
        text={text}
        onTextChange={onTextChange}
        onClearSearch={clearSearch}
        searchRef={searchRef}
        onArrowDown={() => rowLinks()[0]?.focus()}
        range={range}
        onRange={setRange}
        todayCount={stats.data?.today}
        weekCount={stats.data?.this_week}
        onNew={showNew ? () => navigate(newHref) : undefined}
      />

      {feed.isError && <ErrorState error={feed.error} onRetry={() => feed.refetch()} />}

      <div
        ref={listRef}
        onKeyDown={onListKeyDown}
        aria-busy={feed.isFetching && !feed.isFetchingNextPage}
        className={cn(
          'duration-base ease-standard transition-opacity',
          feed.isPlaceholderData && 'opacity-60',
        )}
      >
        {feed.isPending ? (
          <RxListSkeleton />
        ) : isEmpty ? (
          <Card>
            <EmptyState
              icon={urlQ ? <SearchX /> : <FileText />}
              title={patientId ? `${empty.title} — ${filterName}` : empty.title}
              description={empty.en}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {emptyOwnsNew && (
                    <Button
                      variant="primary"
                      onClick={() => navigate(newHref)}
                      iconLeft={<Plus className="size-4" />}
                      className="sm:h-control h-11"
                    >
                      {range === 'all' ? 'Write the first one' : 'New prescription'}
                    </Button>
                  )}
                  {empty.next && (
                    <Button
                      variant="secondary"
                      onClick={() => setRange(empty.next!.range)}
                      className="sm:h-control h-11"
                    >
                      {empty.next.label}
                    </Button>
                  )}
                  {urlQ && (
                    <Button variant="ghost" onClick={clearSearch} className="sm:h-control h-11">
                      Clear search
                    </Button>
                  )}
                </div>
              }
            />
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {groups.map((group, i) => {
                const label = dayLabel(group.day)
                const id = `rx-day-${group.day}`
                /* A one-day range knows the day's exact count. Over several days
                   the last group may still be filling, hence the "+". */
                const count = isSingleDay(range)
                  ? total.toLocaleString()
                  : `${group.rows.length}${i === groups.length - 1 && feed.hasNextPage ? '+' : ''}`
                return (
                  <section key={group.day} aria-labelledby={id}>
                    <DayHeader id={id} label={label} count={`${count} Rx`} />
                    <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-xl border shadow-sm">
                      {group.rows.map((rx) => (
                        <RxRow key={rx.id} rx={rx} />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>

            <div className="flex flex-col items-center gap-1.5 pt-4 pb-2">
              {feed.hasNextPage ? (
                <>
                  <Button
                    variant="secondary"
                    size="lg"
                    loading={feed.isFetchingNextPage}
                    onClick={loadMore}
                    className="h-11 w-full sm:w-auto sm:min-w-56"
                  >
                    Load more
                  </Button>
                  <p className="text-caption text-text-subtle" data-numeric>
                    Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="text-caption text-text-subtle text-center" data-numeric>
                  That’s all {total.toLocaleString()}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

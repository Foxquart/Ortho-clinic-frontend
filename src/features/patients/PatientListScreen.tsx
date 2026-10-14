/**
 * `/patients` — built for a clinic that sees ~100 patients a day.
 *
 * Search comes first: the box is focused on arrival (desktop), `/` jumps back
 * to it from anywhere on the page, and ↓ / Enter walk from the box to the first
 * row, whose focus target is the "New Rx" button. So the whole loop for a
 * returning patient is: `/`, type a few letters, ↓, Enter — and the pad opens
 * with that patient already chosen.
 *
 * With the box empty the list is "who has been seen": Today by default, then
 * Yesterday / 7 days / All, always newest visit first, 25 at a time. With text
 * in the box the date chips step aside — a search must find anyone, whatever
 * day is selected — and the same endpoint answers with `q`.
 *
 * Allergies are on the row, not on the detail page. This practice prescribes
 * NSAIDs all day; the doctor should never have to open a record to find out
 * that opening it was necessary.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarCheck, Loader2, Plus, Search, UserPlus, Users, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/app/AuthProvider'
import { isTypingTarget } from '@/app/useGoToShortcuts'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import type { PatientListItem } from '@/api/schema'
import { SEARCH_Q_MAX } from './api'
import { PatientFormSheet } from './PatientFormSheet'
import { GROUP_LABEL, visitGroup, type VisitGroup } from './list/lastVisit'
import { PatientRow, PatientRowSkeleton } from './list/PatientRow'
import {
  FEED_PAGE_SIZE,
  isPatientView,
  usePatientFeed,
  usePatientViewCounts,
  type PatientView,
} from './list/usePatientFeed'
import { ViewChips } from './list/ViewChips'

/** Empty-state wording per date chip. */
const EMPTY_VIEW: Record<Exclude<PatientView, 'all'>, { en: string; hint: string }> = {
  today: {
    en: 'No one seen yet today',
    hint: 'A patient lands here the moment you write their prescription. Search to find someone, or browse recent patients.',
  },
  yesterday: {
    en: 'No one was seen yesterday',
    hint: 'Nothing was prescribed yesterday. Try 7 days, or look through everyone.',
  },
  week: {
    en: 'No one seen in the last 7 days',
    hint: 'Nothing was prescribed this past week. Look through everyone instead.',
  },
}

interface Group {
  key: VisitGroup | 'flat'
  rows: PatientListItem[]
}

export function PatientListScreen() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canWrite = can('patient.write')
  const canPrescribe = can('prescription.write')

  const [searchParams, setSearchParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [prefill, setPrefill] = useState('')

  /* The chip lives in the URL so "back" from a record lands on the same day,
     but it replaces rather than pushes: Back should leave the list, not walk
     through every chip the doctor tried. The search text is deliberately NOT
     in the URL — patient names and phone numbers do not belong in history. */
  const viewParam = searchParams.get('view')
  const view: PatientView = isPatientView(viewParam) ? viewParam : 'today'

  function setView(next: PatientView) {
    const params = new URLSearchParams(searchParams)
    if (next === 'today') params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  // `q` is declared minLength 1 / maxLength 100 — clamped before it can 422.
  // Emptying the box takes effect at once; only typing waits for the debounce.
  const typed = query.trim().slice(0, SEARCH_Q_MAX)
  const debounced = useDebouncedValue(typed, 250)
  const term = typed ? debounced : ''
  const searching = term.length > 0

  /* The command palette links to `/patients?new=1`, so the URL owns the sheet:
     it stays shareable, and the browser's back button closes it. The
     capability is re-checked here so a hand-typed URL cannot open a form whose
     submit would 403. */
  const createOpen = canWrite && searchParams.get('new') === '1'

  function setCreateOpen(open: boolean, prefillWith = '') {
    setPrefill(open ? prefillWith : '')
    const next = new URLSearchParams(searchParams)
    if (open) next.set('new', '1')
    else next.delete('new')
    setSearchParams(next, { replace: true })
  }

  // Closing the sheet must not strand focus on <body> — when it was opened from
  // the URL there is no trigger for Radix to hand focus back to. 220ms clears
  // the sheet's exit animation, after which Radix has finished with focus.
  const wasOpen = useRef(createOpen)
  useEffect(() => {
    const was = wasOpen.current
    wasOpen.current = createOpen
    if (!was || createOpen) return
    const id = window.setTimeout(() => searchRef.current?.focus(), 220)
    return () => window.clearTimeout(id)
  }, [createOpen])

  // Focus the box on arrival — but only where there is a physical keyboard. On a
  // phone it would raise the on-screen keyboard over the list before it is seen.
  const autofocused = useRef(false)
  useEffect(() => {
    if (autofocused.current || createOpen) return
    autofocused.current = true
    if (window.matchMedia('(min-width: 640px) and (pointer: fine)').matches) {
      searchRef.current?.focus()
    }
  }, [createOpen])

  // `/` from anywhere on the page (not while typing, not inside the sheet).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const feed = usePatientFeed(view, term)
  const counts = usePatientViewCounts()

  const pages = feed.data?.pages
  // A patient can move between pages while the doctor is loading more (a new
  // prescription re-sorts them), so the flattened list is de-duplicated by id.
  const rows = useMemo(() => {
    const seen = new Set<string>()
    return (pages ?? []).flatMap((p) => p.items).filter((p) => !seen.has(p.id) && seen.add(p.id))
  }, [pages])
  const total = pages ? pages[pages.length - 1].total : 0

  // `placeholderData` keeps the previous rows up while the next ones load, so
  // `isPending` is only true on the very first fetch — which is when a skeleton belongs.
  const firstLoad = feed.isPending
  const stale = feed.isPlaceholderData
  const waiting = typed !== term || stale || (feed.isFetching && !feed.isFetchingNextPage)
  const loadFailed = feed.isFetchNextPageError
  const failed = feed.isError && !loadFailed

  // The active chip shows the live total, the others their cached head-count.
  const chipCounts = !searching && pages && !stale ? { ...counts, [view]: total } : counts
  const seenToday = chipCounts.today

  /* "All" and "7 days" are sorted by last visit, so recency sections fall out
     of the order for free: "Seen today", then everyone before. Single-day
     chips and search results need no headings. */
  const grouped = !searching && (view === 'all' || view === 'week')
  const groups = useMemo<Group[]>(() => {
    if (!grouped) return [{ key: 'flat', rows }]
    const out: Group[] = []
    for (const patient of rows) {
      const key = visitGroup(patient.last_visit_date)
      const last = out[out.length - 1]
      if (last?.key === key) last.rows.push(patient)
      else out.push({ key, rows: [patient] })
    }
    return out
  }, [rows, grouped])

  function clearSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  /* ↓ / ↑ walk between rows (and back up into the box); each row exposes one
     focus target, `[data-row-focus]` — its New Rx button, or its name link when
     the user cannot prescribe. */
  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const current = (e.target as HTMLElement).closest('li[data-row]')
    if (!current) return
    const all = Array.from(e.currentTarget.querySelectorAll('li[data-row]'))
    const next = all[all.indexOf(current) + (e.key === 'ArrowDown' ? 1 : -1)]
    e.preventDefault()
    if (next) next.querySelector<HTMLElement>('[data-row-focus]')?.focus()
    else if (e.key === 'ArrowUp') searchRef.current?.focus()
  }

  function focusFirstRow() {
    document.querySelector<HTMLElement>('li[data-row] [data-row-focus]')?.focus()
  }

  const emptyState = searching ? (
    <EmptyState
      icon={<Search />}
      title={`No patient matches “${term}”`}
      description={
        <>
          The search covers names and phone numbers across every patient, whichever day is selected.
          Check the spelling, or add them now.
        </>
      }
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={clearSearch}
            className="min-h-tap sm:min-h-0"
          >
            Clear search
          </Button>
          {canWrite && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<UserPlus className="size-4" />}
              onClick={() => setCreateOpen(true, term)}
              className="min-h-tap sm:min-h-0"
            >
              Add “{term}”
            </Button>
          )}
        </div>
      }
    />
  ) : view === 'all' ? (
    <EmptyState
      icon={<Users />}
      title="No patients yet"
      description={
        canWrite
          ? 'Add the first one — a name and a phone number is enough. Everything else, including allergies, can be filled in later.'
          : 'Once the clinic registers its first patient they will be listed here.'
      }
      action={
        canWrite && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="size-4" />}
            onClick={() => setCreateOpen(true)}
            className="min-h-tap sm:min-h-0"
          >
            Add the first patient
          </Button>
        )
      }
    />
  ) : (
    <EmptyState
      icon={<CalendarCheck />}
      title={EMPTY_VIEW[view].en}
      description={
        <>
          {EMPTY_VIEW[view].hint}
        </>
      }
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setView('all')}
            className="min-h-tap sm:min-h-0"
          >
            Show recent patients
          </Button>
          {canWrite && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="size-4" />}
              onClick={() => setCreateOpen(true)}
              className="min-h-tap sm:min-h-0"
            >
              New patient
            </Button>
          )}
        </div>
      }
    />
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <PageHeader
        title="Patients"
        description={
          searching ? (
            'Searching everyone on the books, most recent visit first.'
          ) : (
            <span data-numeric>
              <span className="text-text font-semibold">
                {seenToday === undefined ? '–' : seenToday.toLocaleString()}
              </span>{' '}
              seen today
              {chipCounts.all !== undefined && (
                <span className="text-text-subtle">
                  {' '}
                  · {chipCounts.all.toLocaleString()} in all
                </span>
              )}
            </span>
          )
        }
        actions={
          canWrite && (
            <Button
              variant="primary"
              iconLeft={<Plus className="size-4" />}
              onClick={() => setCreateOpen(true)}
              /* `PageHeader` gives its actions a full-width row below `sm`;
                 this fills it and reaches the 44px touch minimum there. */
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
            >
              New patient
            </Button>
          )
        }
      />

      {/* Search + date window. From `sm` the bar sticks to the top of the
          scroller, so the box is still there after "Load more" has pushed the
          list three screens long. On a phone it would eat a third of the
          viewport, so it scrolls away there. */}
      <div className="sm:bg-bg/95 flex flex-col gap-3 sm:sticky sm:top-0 sm:z-20 sm:-mx-6 sm:flex-row sm:items-center sm:px-6 sm:py-2 sm:backdrop-blur-md">
        <div className="min-w-0 sm:flex-1">
          <label htmlFor="patient-search" className="sr-only">
            Search patients by name or phone number
          </label>
          <Input
            id="patient-search"
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                if (query) clearSearch()
                else e.currentTarget.blur()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                focusFirstRow()
              } else if (e.key === 'Enter' && !waiting && rows.length > 0) {
                // Only against fresh results: Enter must never land on a row
                // that is about to be replaced by the search still in flight.
                e.preventDefault()
                focusFirstRow()
              }
            }}
            type="text"
            maxLength={SEARCH_Q_MAX}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            inputSize="lg"
            placeholder="Search name or phone"
            iconLeft={<Search />}
            slotRight={
              waiting && typed ? (
                <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
              ) : query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="text-text-subtle duration-fast hover:text-text relative grid size-5 place-items-center rounded-xs transition-colors before:absolute before:-inset-3 before:content-['']"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : (
                <span aria-hidden className="max-sm:hidden">
                  <Kbd>/</Kbd>
                </span>
              )
            }
          />
        </div>

        {searching ? (
          <p className="text-caption text-text-muted flex items-center gap-2 sm:w-[26rem] sm:shrink-0">
            Searching all patients
          </p>
        ) : (
          <ViewChips
            value={view}
            onChange={setView}
            counts={chipCounts}
            className="sm:w-[26rem] sm:shrink-0"
          />
        )}
      </div>

      {/* Results change under the user without a page load. */}
      <p aria-live="polite" className="sr-only">
        {!firstLoad && !waiting
          ? searching
            ? `${total} ${total === 1 ? 'patient matches' : 'patients match'} ${term}`
            : `${total} ${total === 1 ? 'patient' : 'patients'}`
          : ''}
      </p>

      {failed ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : (
        <Card
          className="overflow-hidden"
          onKeyDown={onListKeyDown}
          aria-busy={waiting || undefined}
        >
          {firstLoad ? (
            <ul className="divide-border/60 divide-y" aria-label="Loading patients">
              {Array.from({ length: 8 }, (_, i) => (
                <PatientRowSkeleton key={i} />
              ))}
            </ul>
          ) : rows.length === 0 ? (
            emptyState
          ) : (
            <div
              className={cn(
                'duration-fast ease-standard transition-opacity',
                stale && 'opacity-60',
              )}
            >
              {groups.map((group, index) => (
                <section
                  key={group.key}
                  aria-label={group.key === 'flat' ? 'Patients' : GROUP_LABEL[group.key]}
                >
                  {group.key !== 'flat' && (
                    <h2
                      className={cn(
                        'border-border/60 bg-bg-sunken flex items-baseline gap-2 border-b px-3 py-1.5 sm:px-4',
                        'text-micro text-text-muted uppercase',
                        index > 0 && 'border-t',
                      )}
                    >
                      {GROUP_LABEL[group.key]}
                    </h2>
                  )}
                  <ul className="divide-border/60 divide-y">
                    {group.rows.map((patient) => (
                      <PatientRow key={patient.id} patient={patient} canPrescribe={canPrescribe} />
                    ))}
                  </ul>
                </section>
              ))}

              <div className="border-border flex flex-col items-center gap-3 border-t px-3 py-4">
                <p className="text-caption text-text-muted" data-numeric>
                  Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
                </p>
                {loadFailed && (
                  <ErrorState
                    compact
                    error={feed.error}
                    onRetry={() => void feed.fetchNextPage()}
                    className="w-full"
                  />
                )}
                {feed.hasNextPage && !loadFailed && (
                  <Button
                    variant="secondary"
                    loading={feed.isFetchingNextPage}
                    onClick={() => void feed.fetchNextPage()}
                    className="min-h-tap w-full sm:min-h-0 sm:w-auto"
                  >
                    Load {Math.min(FEED_PAGE_SIZE, Math.max(total - rows.length, 1))} more
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {canWrite && (
        <PatientFormSheet
          open={createOpen}
          onOpenChange={(open) => setCreateOpen(open)}
          prefillQuery={prefill}
          onSaved={(patient) => navigate(`/patients/${patient.id}`)}
        />
      )}
    </div>
  )
}

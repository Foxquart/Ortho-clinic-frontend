/**
 * `/patients` — one table, two data sources.
 *
 * With text in the box the rows come from `GET /patients/search`, which the
 * server ranks over name AND phone; nothing is re-filtered here, because a
 * client-side `includes()` would throw away the fuzzy phone match the server
 * just did. With the box empty the rows come from the paginated
 * `GET /patients`, whose `PatientResponse` genuinely has no last-visit date and
 * no prescription count — so those two columns appear only in search results
 * rather than showing an em dash and implying the data is missing.
 *
 * Allergies are on the row, not on the detail page. This practice prescribes
 * NSAIDs all day; the doctor should never have to open a record to find out
 * that opening it was necessary.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Plus, Search, UserPlus, Users, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDate, formatRelativeDay, fullName, patientAge } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Pagination, TD, TH, THead, TR, Table } from '@/components/ui/Table'
import type { PatientSearchResult, SortOrder } from '@/api/schema'
import { PAGE_SIZE, SEARCH_Q_MAX, shortGender, usePatientList, usePatientSearch } from './api'
import { AllergyChip } from './AllergyDisplay'
import { PatientFormSheet } from './PatientFormSheet'

/**
 * `sort_by` is a free string the backend resolves with `getattr` on the model,
 * so only real columns are safe. These four are.
 */
const SORTABLE = {
  name: 'first_name',
  age: 'date_of_birth',
  city: 'city',
  added: 'created_at',
} as const

/** Rendered while the first page loads, at the row height the real rows use. */
function LoadingRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, row) => (
        <tr key={row} className="border-b border-border/60 last:border-b-0">
          {Array.from({ length: columns }, (_, col) => (
            <td key={col} className="px-3 py-2">
              <Skeleton className={cn('h-3', col === 0 ? 'w-40' : 'w-14')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function PatientListScreen() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canWrite = can('patients.write')

  const [searchParams, setSearchParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [prefill, setPrefill] = useState('')

  // `q` is declared minLength 1 / maxLength 100 — clamped before it can 422.
  const term = useDebouncedValue(query.trim().slice(0, SEARCH_Q_MAX), 180)
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

  const listParams = useMemo(() => ({ page, sortBy, sortOrder }), [page, sortBy, sortOrder])
  const list = usePatientList(listParams, !searching)
  const search = usePatientSearch(term)

  /* `PatientSearchResult` only ADDS two optional fields, so a `PatientResponse`
     satisfies it structurally — but the keys are genuinely absent at runtime on
     the plain list, which is why the cells below test for them. */
  const rows: PatientSearchResult[] = searching
    ? (search.data ?? [])
    : (list.data?.items ?? [])

  // `placeholderData` keeps the previous rows on screen, so "pending" is only
  // true on the very first fetch — which is exactly when a skeleton belongs.
  const firstLoad = searching ? search.isPending : list.isPending
  const refetching = searching
    ? search.isFetching && !search.isPending
    : list.isFetching && !list.isPending
  const failed = searching ? search.isError : list.isError
  const failure = searching ? search.error : list.error
  const retry = () => {
    if (searching) void search.refetch()
    else void list.refetch()
  }
  const columns = searching ? 6 : 5

  function toggleSort(column: string) {
    setPage(1)
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  function sortState(column: string) {
    return sortBy === column ? sortOrder : null
  }

  function clearSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  const total = list.data?.total ?? 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Patients"
        description={
          searching
            ? 'Ranked by the server across names and phone numbers.'
            : 'Everyone on the books, most recently updated first.'
        }
        actions={
          canWrite && (
            <Button
              variant="primary"
              iconLeft={<Plus className="size-4" />}
              onClick={() => setCreateOpen(true)}
            >
              New patient
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="patient-search" className="sr-only">
            Search patients by name or phone number
          </label>
          <Input
            id="patient-search"
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                clearSearch()
              }
            }}
            type="text"
            maxLength={SEARCH_Q_MAX}
            autoComplete="off"
            placeholder="Search by name or phone…"
            iconLeft={<Search />}
            slotRight={
              refetching ? (
                <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
              ) : query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="grid size-5 place-items-center rounded-xs text-text-subtle transition-colors duration-fast hover:text-text"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : undefined
            }
          />
        </div>
        {!searching && total > 0 && (
          <p className="text-caption text-text-muted" data-numeric>
            {total.toLocaleString()} {total === 1 ? 'patient' : 'patients'}
          </p>
        )}
      </div>

      {/* Type-ahead results change under the user without a page load. */}
      <p aria-live="polite" className="sr-only">
        {searching && !refetching && !firstLoad
          ? `${rows.length} ${rows.length === 1 ? 'patient matches' : 'patients match'} ${term}`
          : ''}
      </p>

      {failed ? (
        <ErrorState error={failure} onRetry={retry} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TH
                sort={searching ? undefined : sortState(SORTABLE.name)}
                onSort={searching ? undefined : () => toggleSort(SORTABLE.name)}
              >
                Patient
              </TH>
              <TH
                width="6.5rem"
                sort={searching ? undefined : sortState(SORTABLE.age)}
                onSort={searching ? undefined : () => toggleSort(SORTABLE.age)}
              >
                Age / Sex
              </TH>
              <TH width="9.5rem">Phone</TH>
              <TH
                width="9rem"
                sort={searching ? undefined : sortState(SORTABLE.city)}
                onSort={searching ? undefined : () => toggleSort(SORTABLE.city)}
              >
                City
              </TH>
              {searching ? (
                <>
                  <TH width="8rem">Last visit</TH>
                  <TH width="4rem" align="right">
                    Rx
                  </TH>
                </>
              ) : (
                <TH
                  width="8rem"
                  sort={sortState(SORTABLE.added)}
                  onSort={() => toggleSort(SORTABLE.added)}
                >
                  Added
                </TH>
              )}
            </THead>

            <tbody>
              {firstLoad ? (
                <LoadingRows columns={columns} />
              ) : rows.length === 0 ? (
                <tr>
                  <TD colSpan={columns}>
                    {searching ? (
                      <EmptyState
                        icon={<Search />}
                        title={`No patient matches “${term}”`}
                        description="The search covers full names and phone numbers. Check the spelling, or add them now."
                        action={
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button variant="secondary" size="sm" onClick={clearSearch}>
                              Clear search
                            </Button>
                            {canWrite && (
                              <Button
                                variant="primary"
                                size="sm"
                                iconLeft={<UserPlus className="size-4" />}
                                onClick={() => setCreateOpen(true, term)}
                              >
                                Add “{term}”
                              </Button>
                            )}
                          </div>
                        }
                      />
                    ) : (
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
                            >
                              Add the first patient
                            </Button>
                          )
                        }
                      />
                    )}
                  </TD>
                </tr>
              ) : (
                rows.map((patient) => {
                  const age = patientAge(patient.date_of_birth)
                  // Only search results carry these; the plain list does not.
                  const lastVisit = 'last_visit_date' in patient ? patient.last_visit_date : null
                  const rxCount =
                    'prescription_count' in patient ? (patient.prescription_count ?? 0) : null

                  return (
                    <TR key={patient.id} onClick={() => navigate(`/patients/${patient.id}`)}>
                      <TD>
                        {/* items-start, or the allergy chip stretches to the
                            full column width and reads as a banner. */}
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-body font-medium text-text">
                              {fullName(patient.first_name, patient.last_name)}
                            </span>
                            {!patient.is_active && <Badge tone="neutral">Inactive</Badge>}
                          </span>
                          <AllergyChip allergies={patient.allergies} />
                        </div>
                      </TD>
                      <TD numeric>
                        <span className="text-label text-text-muted">
                          {age === null ? '—' : age}
                          <span className="text-text-subtle"> / {shortGender(patient.gender)}</span>
                        </span>
                      </TD>
                      <TD numeric className="font-mono text-label text-text-muted">
                        {patient.phone}
                      </TD>
                      <TD className="text-label text-text-muted">
                        <span className="block truncate">{patient.city || '—'}</span>
                      </TD>
                      {searching ? (
                        <>
                          <TD numeric className="text-label text-text-muted">
                            {lastVisit ? formatRelativeDay(lastVisit) : 'Never'}
                          </TD>
                          <TD numeric align="right" className="text-label text-text-muted">
                            {rxCount ?? '—'}
                          </TD>
                        </>
                      ) : (
                        <TD numeric className="text-label text-text-muted">
                          {formatDate(patient.created_at)}
                        </TD>
                      )}
                    </TR>
                  )
                })
              )}
            </tbody>
          </Table>

          {searching ? (
            rows.length > 0 && (
              <p className="border-t border-border px-3 py-2 text-caption text-text-muted">
                Top {rows.length} matches, ranked by the server. Narrow the search to see fewer.
              </p>
            )
          ) : (
            <Pagination
              page={list.data?.page ?? 1}
              pages={list.data?.pages ?? 1}
              total={total}
              pageSize={list.data?.page_size ?? PAGE_SIZE}
              onPageChange={setPage}
            />
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

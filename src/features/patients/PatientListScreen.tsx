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
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDate, formatRelativeDay, fullName, patientAge } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { PatientAvatar } from './PatientAvatar'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { TD, TH, THead, TR, Table } from '@/components/ui/Table'
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

/**
 * One patient, stacked, for the phone-width list.
 *
 * Below `sm` the table is not narrowed, it is replaced: six columns in 288px is
 * 667px of sideways scrolling, and a doctor thumbing down a patient list will
 * not scroll a table horizontally to find a phone number. The same `rows` array
 * feeds both renders, so there is one query and one sort — only the shape of a
 * row changes.
 *
 * The row is a stretched link: the name's `after:absolute after:inset-0` covers
 * the whole `<li>`, which makes the entire row one big target without nesting a
 * `tel:` anchor inside another anchor (illegal, and the phone number has to stay
 * dialable). The phone and the quick action sit `relative` above that overlay,
 * so they stay separately tappable.
 */
function PatientCardRow({
  patient,
  meta,
  canPrescribe,
}: {
  patient: PatientSearchResult
  /** The quiet second line, already assembled by the caller. */
  meta: string
  canPrescribe: boolean
}) {
  const name = fullName(patient.first_name, patient.last_name)

  return (
    <li className="relative flex min-h-tap items-start gap-3 px-3 py-3 transition-colors duration-fast ease-standard focus-within:bg-surface-hover active:bg-surface-active">
      <PatientAvatar name={name} gender={patient.gender} size="sm" className="mt-0.5" />

      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex min-w-0 max-w-full items-center gap-2">
          <Link
            to={`/patients/${patient.id}`}
            className="truncate text-body font-semibold text-text after:absolute after:inset-0 focus-visible:outline-none"
          >
            {name}
          </Link>
          {!patient.is_active && <Badge tone="neutral">Inactive</Badge>}
        </span>

        <p className="flex max-w-full flex-wrap items-center gap-x-2 text-caption text-text-muted">
          <span data-numeric>{meta}</span>
          <a
            href={`tel:${patient.phone}`}
            data-numeric
            className="relative font-mono text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            {patient.phone}
          </a>
        </p>

        <AllergyChip allergies={patient.allergies} />
      </div>

      {/* One trailing affordance, never two. Where the doctor can prescribe,
          the quick action IS the affordance and it doubles as the "this row
          does something" cue; where they cannot, a chevron says the row opens. */}
      {canPrescribe ? (
        <Link
          to={`/prescriptions/new?patientId=${patient.id}`}
          aria-label={`New prescription for ${name}`}
          className="relative grid size-tap shrink-0 place-items-center rounded-md border border-border-field bg-surface text-text-muted shadow-sm transition-colors duration-fast hover:text-text active:bg-surface-active"
        >
          <FilePlus2 aria-hidden className="size-4" />
        </Link>
      ) : (
        <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-text-subtle" />
      )}
    </li>
  )
}

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

/**
 * Local, fully labelled pagination. The shared `Pagination` uses icon-only
 * chevrons; this list is walked dozens of times a day between patients, so the
 * controls here spell out Previous / Next at full button size.
 */
function ListPagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  if (total === 0) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
      <p className="text-label text-text-muted" data-numeric>
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} patients
      </p>
      {/* On a phone the three controls take the whole line and push apart, so
          Previous and Next land under the thumbs rather than bunched in the
          middle — and both reach the 44px touch minimum. */}
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
        <Button
          variant="secondary"
          iconLeft={<ChevronLeft aria-hidden className="size-4" />}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-h-tap sm:min-h-0"
        >
          Previous
        </Button>
        <span className="px-1 text-label text-text-muted" data-numeric>
          Page {page} of {Math.max(pages, 1)}
        </span>
        <Button
          variant="secondary"
          iconRight={<ChevronRight aria-hidden className="size-4" />}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="min-h-tap sm:min-h-0"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export function PatientListScreen() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canWrite = can('patient.write')
  const canPrescribe = can('prescription.write')

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
  const columns = (searching ? 6 : 5) + (canPrescribe ? 1 : 0)

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

  /* Built once and rendered in whichever of the two row layouts is on screen —
     inside the table's `colSpan` cell from `sm` up, and on its own below it.
     The empty state is the one thing both renders must say identically. */
  const emptyState = searching ? (
    <EmptyState
      icon={<Search />}
      title={`No patient matches “${term}”`}
      description="The search covers full names and phone numbers. Check the spelling, or add them now."
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={clearSearch} className="min-h-tap sm:min-h-0">
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
            className="min-h-tap sm:min-h-0"
          >
            Add the first patient
          </Button>
        )
      }
    />
  )

  /**
   * The stacked row's quiet second line — age/sex, city, and, in search results
   * only, when the patient was last seen.
   *
   * The plain list's "Added" column is deliberately NOT carried over. It is the
   * column this list is already sorted by, it is the least useful fact about a
   * patient a doctor is trying to find, and at phone width it is what pushed
   * this line onto a third row. `last_visit_date` earns its place because it
   * answers a real question; a registration date does not.
   */
  function metaLine(patient: PatientSearchResult): string {
    const age = patientAge(patient.date_of_birth)
    const lastVisit = 'last_visit_date' in patient ? patient.last_visit_date : null
    const parts = [
      `${age === null ? '—' : age} / ${shortGender(patient.gender)}`,
      patient.city || null,
      // Only search results carry it; an em dash on the plain list would say
      // "never seen" when the endpoint simply does not report it.
      searching ? (lastVisit ? `seen ${formatRelativeDay(lastVisit)}` : 'never seen') : null,
    ]
    return parts.filter(Boolean).join(' · ')
  }

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
              /* `PageHeader` gives its actions a full-width row below `sm`;
                 this fills it and reaches the 44px touch minimum there. */
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
            >
              New patient
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* `min-w-64` is 256px and the phone shell is 288px wide, so it fits
            today — but only just, and a 256px floor on a flex child is exactly
            the shape that starts pushing the moment anything shares its line.
            Zero below `sm`, the intended floor from `sm` up. */}
        <div className="min-w-0 basis-full sm:min-w-64 sm:flex-1 sm:basis-auto">
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
            /* Large and pre-focused: between patients the doctor walks in and
               just types — no click, no squint. */
            inputSize="lg"
            autoFocus
            placeholder="Search by name or phone"
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
          {/* Below `sm`: stacked rows. See `PatientCardRow` for why the table is
              replaced here rather than squeezed. Both branches read the same
              `rows`, `firstLoad` and `emptyState`. */}
          <div className="sm:hidden">
            {firstLoad ? (
              <div className="flex flex-col gap-4 p-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3 w-2/5" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              emptyState
            ) : (
              <ul className="divide-y divide-border/60">
                {rows.map((patient) => (
                  <PatientCardRow
                    key={patient.id}
                    patient={patient}
                    meta={metaLine(patient)}
                    canPrescribe={canPrescribe}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="hidden sm:block">
            <Table label="Patients">
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
                {canPrescribe && (
                  <TH width="1%">
                    <span className="sr-only">Quick actions</span>
                  </TH>
                )}
              </THead>
  
              <tbody>
                {firstLoad ? (
                  <LoadingRows columns={columns} />
                ) : rows.length === 0 ? (
                  <tr>
                    <TD colSpan={columns}>{emptyState}</TD>
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
                        <TD className="py-2.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <PatientAvatar
                              name={fullName(patient.first_name, patient.last_name)}
                              gender={patient.gender}
                              size="sm"
                            />
                            {/* items-start, or the allergy chip stretches to the
                                full column width and reads as a banner. */}
                            <div className="flex min-w-0 flex-col items-start gap-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-body font-semibold text-text">
                                  {fullName(patient.first_name, patient.last_name)}
                                </span>
                                {!patient.is_active && <Badge tone="neutral">Inactive</Badge>}
                              </span>
                              <AllergyChip allergies={patient.allergies} />
                            </div>
                          </div>
                        </TD>
                        <TD numeric>
                          <span className="text-body text-text-muted">
                            {age === null ? '—' : age}
                            <span className="text-text-subtle"> / {shortGender(patient.gender)}</span>
                          </span>
                        </TD>
                        <TD numeric className="font-mono text-body text-text-muted">
                          {patient.phone}
                        </TD>
                        <TD className="text-body text-text-muted">
                          <span className="block truncate">{patient.city || '—'}</span>
                        </TD>
                        {searching ? (
                          <>
                            <TD numeric className="text-body text-text-muted">
                              {lastVisit ? formatRelativeDay(lastVisit) : 'Never'}
                            </TD>
                            <TD numeric align="right" className="text-body text-text-muted">
                              {rxCount ?? '—'}
                            </TD>
                          </>
                        ) : (
                          <TD numeric className="text-body text-text-muted">
                            {formatDate(patient.created_at)}
                          </TD>
                        )}
                        {canPrescribe && (
                          <TD align="right" className="w-px whitespace-nowrap">
                            {/* The single most common task, one click from the
                                list. `stopPropagation` keeps the row's own
                                navigation out of the way. */}
                            <Button
                              variant="secondary"
                              size="sm"
                              asChild
                              iconLeft={<FilePlus2 aria-hidden className="size-3.5" />}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                to={`/prescriptions/new?patientId=${patient.id}`}
                                aria-label={`New prescription for ${fullName(patient.first_name, patient.last_name)}`}
                              >
                                New prescription
                              </Link>
                            </Button>
                          </TD>
                        )}
                      </TR>
                    )
                  })
                )}
              </tbody>
            </Table>
          </div>

          {searching ? (
            rows.length > 0 && (
              <p className="border-t border-border px-3 py-2 text-caption text-text-muted">
                Top {rows.length} matches, ranked by the server. Narrow the search to see fewer.
              </p>
            )
          ) : (
            <ListPagination
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

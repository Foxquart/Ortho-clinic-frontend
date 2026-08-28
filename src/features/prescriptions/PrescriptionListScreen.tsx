import { useCallback, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileText, Plus, User, X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { formatAgo, formatDate, formatDateTime, fullName } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { isTypingTarget } from '@/app/useGoToShortcuts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import { Pagination, Table, TD, TH, THead, TR } from '@/components/ui/Table'
import type { ListPrescriptionsParams } from '@/api/endpoints'
import type { Paginated, PatientResponse, PrescriptionResponse, SortOrder } from '@/api/schema'

const PAGE_SIZE = 20

/**
 * `sort_by` is a nullable free string in the schema with no enum of allowed
 * columns, so only stored columns we are confident about are offered. Patient
 * name, diagnosis and the item count are derived or joined and are deliberately
 * not sortable — a control that silently no-ops is worse than no control.
 */
const SORTABLE = ['prescription_number', 'follow_up_date', 'created_at'] as const
type SortableColumn = (typeof SORTABLE)[number]

function isSortable(value: string): value is SortableColumn {
  return (SORTABLE as readonly string[]).includes(value)
}

export function PrescriptionListScreen() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  /* `patient_id` is the canonical filter param — it is the API's own spelling.
     `patientId` is accepted as an alias so a link written in the pad's camelCase
     convention still lands on a filtered list rather than the unfiltered one. */
  const patientId = searchParams.get('patient_id') ?? searchParams.get('patientId')
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1
  const sortByParam = searchParams.get('sort_by') ?? ''
  const sortBy: SortableColumn = isSortable(sortByParam) ? sortByParam : 'created_at'
  const sortOrder: SortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc'

  /* All list state lives in the URL: back/forward work, and a sorted, filtered
     view is a link the doctor can keep. */
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

  const clearPatientFilter = () => patch({ patient_id: null, patientId: null, page: null })

  const params: ListPrescriptionsParams = {
    page,
    page_size: PAGE_SIZE,
    sort_by: sortBy,
    sort_order: sortOrder,
    ...(patientId ? { patient_id: patientId } : {}),
  }

  const list = useQuery({
    queryKey: qk.prescriptions.list(params),
    queryFn: () =>
      apiGet<Paginated<PrescriptionResponse>>(endpoints.prescriptions.list, { params }),
    // Paging must not blank out the table the doctor is reading.
    placeholderData: keepPreviousData,
  })

  /* The filtered empty state has to name the patient even when the list comes
     back with zero rows, so the name cannot come from the rows themselves. */
  const patient = useQuery({
    queryKey: qk.patients.detail(patientId ?? ''),
    queryFn: () => apiGet<PatientResponse>(endpoints.patients.byId(patientId as string)),
    enabled: Boolean(patientId),
  })

  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const filterName = patient.data
    ? fullName(patient.data.first_name, patient.data.last_name)
    : (rows[0]?.patient_name ?? 'this patient')

  const newHref = patientId ? `/prescriptions/new?patientId=${patientId}` : '/prescriptions/new'
  const canWrite = can('prescriptions.write')

  /* `n` = new, per the reserved shortcut table. Ignored while typing, and never
     bound for someone the capability guard would bounce. */
  useEffect(() => {
    if (!canWrite) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() !== 'n') return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      navigate(newHref)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canWrite, navigate, newHref])

  const sortFor = (column: SortableColumn) => (sortBy === column ? sortOrder : null)
  const toggleSort = (column: SortableColumn) => {
    const nextOrder: SortOrder = sortBy === column && sortOrder === 'desc' ? 'asc' : 'desc'
    patch({ sort_by: column, sort_order: nextOrder, page: null })
  }

  const isEmpty = Boolean(list.data) && rows.length === 0
  const isUnfilteredEmpty = isEmpty && !patientId

  /* One destination, quoted by both renders below. The table row navigates on
     click because a `<tr>` cannot contain an anchor that spans it; the phone
     card is a real `<Link>`, which is strictly better where it is possible —
     long-press, "open in new tab" and the status bar preview all come free. */
  const hrefFor = (rx: PrescriptionResponse) => `/prescriptions/${rx.id}`

  return (
    <div className="max-w-content flex flex-col gap-4 px-4 py-6 sm:px-6">
      <PageHeader
        title="Prescriptions"
        description={
          <span aria-live="polite" className="text-body text-text-muted">
            {list.data
              ? `${total.toLocaleString()} ${total === 1 ? 'prescription' : 'prescriptions'}${
                  patientId ? ' for this patient' : ''
                }`
              : 'Everything written at this clinic, newest first.'}
          </span>
        }
        actions={
          /* Hidden when the collection is genuinely empty: the empty state owns
             the primary action there, and one view gets one primary button. */
          canWrite &&
          !isUnfilteredEmpty && (
            /* Full width below `sm`: it is the only action on the screen, and a
               phone has no pointer to aim with. */
            <Button
              variant="primary"
              onClick={() => navigate(newHref)}
              iconLeft={<Plus className="size-4" />}
              className="w-full sm:w-auto"
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

      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}

      <Card className="overflow-hidden">
        {list.isPending ? (
          <SkeletonRows rows={8} className="py-2" />
        ) : isEmpty ? (
          patientId ? (
            /* A filter returned nothing: said in place, left-aligned, with a way
               back. No "create" here — they were looking, not authoring. */
            <div className="flex flex-wrap items-center gap-2 px-4 py-6">
              <p className="text-body text-text">No prescriptions for {filterName}.</p>
              <Button variant="link" onClick={clearPatientFilter}>
                Show all prescriptions
              </Button>
            </div>
          ) : (
            <EmptyState
              icon={<FileText />}
              title="No prescriptions yet"
              description="Every prescription written on the pad is filed here."
              action={
                canWrite && (
                  <Button variant="primary" size="sm" onClick={() => navigate(newHref)}>
                    Write the first one
                  </Button>
                )
              }
            />
          )
        ) : (
          <>
            {/* ---------------------------------------------------------------
                PHONE: a stacked card list, not a sideways table.

                Six columns need about 500px. On a 320–390px phone that made the
                doctor drag a list of his own prescriptions sideways to find out
                whose it was — the patient's name, the one thing the list is FOR,
                sat in the second column and was the first thing off-screen. So
                under `sm` the same row data is re-laid out vertically, in the
                order a person actually asks for it: which prescription, whose,
                what for, and then the numbers.

                There is deliberately no mobile sort control. Sorting only ever
                lived in the table header, and the list arrives `created_at desc`
                — newest first, which is the only order that makes sense on a
                phone, where the doctor is looking for something he wrote this
                morning rather than auditing a year. A sort UI here would be a
                second control surface to maintain for a case that does not
                exist; the sorted view is still reachable as a URL and still
                renders correctly from `sm` up.
                --------------------------------------------------------------- */}
            <ul className="divide-border divide-y sm:hidden">
              {rows.map((rx) => (
                <li key={rx.id}>
                  <Link
                    to={hrefFor(rx)}
                    className="min-h-tap duration-fast ease-standard hover:bg-surface-hover focus-visible:bg-surface-hover flex flex-col gap-1 px-4 py-3 transition-colors focus-visible:outline-offset-[-2px]"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-label text-text-muted font-mono">
                        {rx.prescription_number}
                      </span>
                      {rx.status !== 'active' && <Badge tone="danger">Voided</Badge>}
                    </span>

                    <span className="text-body text-text truncate font-medium">
                      {rx.patient_name || 'Unnamed patient'}
                    </span>

                    {rx.diagnosis && (
                      <span className="text-label text-text-muted line-clamp-2">
                        {rx.diagnosis}
                      </span>
                    )}

                    {/* The three table columns that were furthest off-screen,
                        folded into one quiet line. Separated by middots rather
                        than laid out on a sub-grid: they are context, and a grid
                        would give them back the rank the table gave them. */}
                    <span className="text-caption text-text-subtle flex flex-wrap items-center gap-x-1.5">
                      <span data-numeric>
                        {rx.items.length} {rx.items.length === 1 ? 'item' : 'items'}
                      </span>
                      {rx.follow_up_date && (
                        <>
                          <span aria-hidden>·</span>
                          <span data-numeric>follow-up {formatDate(rx.follow_up_date)}</span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <span>{formatAgo(rx.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* From `sm` up the table is untouched — same columns, same sort.
                Hidden on the WRAPPER rather than on the `<table>`, so the
                scroll region the primitive builds is not left behind as an
                empty focus stop on a phone. */}
            <div className="hidden sm:block">
              <Table label="Prescriptions">
                <THead>
                  <TH
                    width="10.5rem"
                    sort={sortFor('prescription_number')}
                    onSort={() => toggleSort('prescription_number')}
                  >
                    Number
                  </TH>
                  <TH>Patient</TH>
                  <TH>Diagnosis</TH>
                  <TH width="5rem" align="right">
                    Items
                  </TH>
                  <TH
                    width="9rem"
                    align="right"
                    sort={sortFor('follow_up_date')}
                    onSort={() => toggleSort('follow_up_date')}
                  >
                    Follow-up
                  </TH>
                  <TH
                    width="9rem"
                    align="right"
                    sort={sortFor('created_at')}
                    onSort={() => toggleSort('created_at')}
                  >
                    Created
                  </TH>
                </THead>
                <tbody>
                  {rows.map((rx) => (
                    <TR key={rx.id} onClick={() => navigate(hrefFor(rx))}>
                      <TD className="text-label text-text font-mono whitespace-nowrap">
                        {rx.prescription_number}
                        {rx.status !== 'active' && (
                          <Badge tone="danger" className="ml-2 font-sans">
                            Voided
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-body text-text max-w-0 truncate">
                        {rx.patient_name || 'Unnamed patient'}
                      </TD>
                      <TD className="text-label text-text-muted max-w-0 truncate">
                        {rx.diagnosis ?? <span className="text-text-subtle">—</span>}
                      </TD>
                      <TD align="right" numeric className="text-label text-text-muted">
                        {rx.items.length}
                      </TD>
                      <TD
                        align="right"
                        numeric
                        className="text-label text-text-muted whitespace-nowrap"
                      >
                        {rx.follow_up_date ? (
                          formatDate(rx.follow_up_date)
                        ) : (
                          <span className="text-text-subtle">—</span>
                        )}
                      </TD>
                      <TD align="right" className="text-caption text-text-subtle whitespace-nowrap">
                        <span title={formatDateTime(rx.created_at)}>{formatAgo(rx.created_at)}</span>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <Pagination
              page={list.data?.page ?? page}
              pages={list.data?.pages ?? 1}
              total={total}
              pageSize={list.data?.page_size ?? PAGE_SIZE}
              onPageChange={(next) => patch({ page: String(next) })}
            />
          </>
        )}
      </Card>
    </div>
  )
}

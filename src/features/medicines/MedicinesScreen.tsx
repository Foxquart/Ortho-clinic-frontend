import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Pill, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { humanizeEnum } from '@/lib/format'
import { errorMessage } from '@/api/errors'
import { useAuth } from '@/app/AuthProvider'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Surface'
import { Select, SegmentedControl } from '@/components/ui/Controls'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Input'
import { Pagination, TD, TH, THead, TR, Table } from '@/components/ui/Table'
import { MEDICINE_DOSAGE_FORMS } from '@/api/schema'
import type { MedicineResponse } from '@/api/schema'
import { MedicineSheet } from './MedicineSheet'
import {
  MAX_QUERY_LENGTH,
  SEARCH_LIMIT,
  useMedicineById,
  useMedicineList,
  useSetMedicineActive,
  type DosageFormFilter,
  type StatusFilter,
} from './useMedicines'

const DOSAGE_FORM_OPTIONS: readonly { value: DosageFormFilter; label: string }[] = [
  { value: 'all', label: 'All forms' },
  ...MEDICINE_DOSAGE_FORMS.map((form) => ({
    value: form as DosageFormFilter,
    label: humanizeEnum(form),
  })),
]

const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

/** An absent value is a fact worth showing, not a blank cell. */
function Cell({ value }: { value: string | null }) {
  const text = value?.trim()
  if (text) return <>{text}</>
  return (
    <>
      <span aria-hidden className="text-text-subtle">
        —
      </span>
      <span className="sr-only">Not recorded</span>
    </>
  )
}

/**
 * The prescription defaults in one glance: "1 tab · 1-0-1 · 5d · after".
 * Null when the medicine carries no defaults at all.
 */
function defaultsSummary(medicine: MedicineResponse): string | null {
  const parts: string[] = []
  if (medicine.default_dosage) parts.push(medicine.default_dosage)
  if (medicine.default_frequency) parts.push(medicine.default_frequency)
  if (medicine.default_duration_days != null) parts.push(`${medicine.default_duration_days}d`)
  if (medicine.default_food_timing) parts.push(medicine.default_food_timing)
  return parts.length > 0 ? parts.join(' · ') : null
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/* A ref callback, not a hook: it is handed to whichever of the two renders is
   mounted at this width, and a module-level function keeps a stable identity so
   React does not detach and re-attach it on every re-render. */
function scrollHighlightIntoView(node: HTMLElement | null) {
  node?.scrollIntoView({
    block: 'center',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

/**
 * The phone rendering of one formulary entry. Not a narrowed table — a table
 * with seven columns on a 320px screen scrolls sideways, which means the
 * strength and the row actions sit past the right edge where nobody looks. The
 * card puts the name on line one and folds form/strength/brand into a single
 * quiet meta line, so the whole entry is legible without a horizontal swipe.
 *
 * The name block is the tap target and opens the editor — the same thing the
 * "Edit" button does in the table — with the activate toggle as a separate
 * rectangle beside it, far enough away (gap-2, its own bounds) that a thumb
 * aiming at the name does not retire a medicine by accident.
 */
function MedicineCard({
  medicine,
  canWrite,
  highlighted,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  medicine: MedicineResponse
  canWrite: boolean
  highlighted: boolean
  onEdit: (medicine: MedicineResponse) => void
  onDeactivate: (medicine: MedicineResponse) => void
  onReactivate: (medicine: MedicineResponse) => void
}) {
  const inactive = !medicine.is_active
  const meta = [
    humanizeEnum(medicine.dosage_form),
    medicine.strength?.trim() || null,
    medicine.brand_name?.trim() || null,
    medicine.category?.trim() || null,
  ].filter(Boolean)
  const defaults = defaultsSummary(medicine)

  const identity = (
    <>
      <span className="flex items-center gap-2">
        <span className={cn('min-w-0 truncate font-semibold', inactive && 'text-text-subtle')}>
          {medicine.name}
        </span>
        {inactive && <Badge tone="neutral">Inactive</Badge>}
      </span>
      {medicine.generic_name && (
        <span className="text-label text-text-subtle block truncate">{medicine.generic_name}</span>
      )}
      <span className="text-caption text-text-muted block truncate">{meta.join(' · ')}</span>
      {defaults && (
        <span className="text-caption text-text-muted block truncate font-mono">{defaults}</span>
      )}
    </>
  )

  return (
    <li
      ref={highlighted ? scrollHighlightIntoView : undefined}
      className={cn(
        'border-border duration-slow ease-standard flex items-center gap-2 border-b px-4 transition-colors last:border-b-0',
        highlighted && 'bg-accent-muted',
      )}
    >
      {canWrite ? (
        <button
          type="button"
          onClick={() => onEdit(medicine)}
          aria-label={`Edit ${medicine.name}`}
          className="min-h-tap duration-fast ease-standard hover:bg-surface-hover focus-visible:outline-focus -mx-2 flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {identity}
        </button>
      ) : (
        <span className="min-h-tap flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2.5">
          {identity}
        </span>
      )}

      {canWrite &&
        (medicine.is_active ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-tap shrink-0"
            aria-label={`Deactivate ${medicine.name}`}
            onClick={() => onDeactivate(medicine)}
          >
            Deactivate
          </Button>
        ) : (
          <Button
            variant="tonal"
            size="sm"
            className="min-h-tap shrink-0"
            aria-label={`Reactivate ${medicine.name}`}
            onClick={() => onReactivate(medicine)}
          >
            Reactivate
          </Button>
        ))}
    </li>
  )
}

function MedicineRow({
  medicine,
  canWrite,
  highlighted,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  medicine: MedicineResponse
  canWrite: boolean
  highlighted: boolean
  onEdit: (medicine: MedicineResponse) => void
  onDeactivate: (medicine: MedicineResponse) => void
  onReactivate: (medicine: MedicineResponse) => void
}) {
  const inactive = !medicine.is_active

  return (
    <TR
      className={cn(
        'duration-slow ease-standard transition-colors',
        // Retired stock stays legible but stops competing with what is stocked.
        inactive && '[&>td]:text-text-subtle',
        highlighted && 'bg-accent-muted',
      )}
    >
      <TD className="py-2.5">
        {/* Attaches only on the highlighted row, so the deep-linked medicine
            brings itself into view the moment it renders. */}
        <span
          ref={highlighted ? scrollHighlightIntoView : undefined}
          className="flex items-center gap-2"
        >
          <span className="max-w-[28rem] min-w-0">
            <span className="block truncate font-semibold">{medicine.name}</span>
            {medicine.generic_name && (
              <span className="text-label text-text-subtle block truncate">
                {medicine.generic_name}
              </span>
            )}
          </span>
          {inactive && <Badge tone="neutral">Inactive</Badge>}
        </span>
      </TD>
      <TD className="hidden md:table-cell">
        <Cell value={medicine.brand_name} />
      </TD>
      <TD className="text-text-muted">{humanizeEnum(medicine.dosage_form)}</TD>
      <TD numeric>
        <Cell value={medicine.strength} />
      </TD>
      <TD className="hidden lg:table-cell">
        <Cell value={medicine.category} />
      </TD>
      {/* What the pad will pre-fill for this medicine. Compact and mono so the
          eye can scan the column like a prescription line. */}
      <TD className="hidden xl:table-cell">
        {defaultsSummary(medicine) ? (
          <span className="text-caption text-text-muted font-mono whitespace-nowrap">
            {defaultsSummary(medicine)}
          </span>
        ) : (
          <Cell value={null} />
        )}
      </TD>
      {/* 2xl, not xl: with fully labelled row actions the manufacturer column
          only fits once the card reaches its full 1152px. */}
      <TD className="hidden 2xl:table-cell">
        <Cell value={medicine.manufacturer} />
      </TD>
      {canWrite && (
        <TD align="right" className="w-px whitespace-nowrap">
          {/* Labelled, not icon-only: the action should be readable without a
              hover, a tooltip or a guess. Words only — the words are the
              affordance, and the column stays narrow enough to never clip. */}
          <span className="inline-flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${medicine.name}`}
              onClick={() => onEdit(medicine)}
            >
              Edit
            </Button>
            {medicine.is_active ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Deactivate ${medicine.name}`}
                onClick={() => onDeactivate(medicine)}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Reactivate ${medicine.name}`}
                onClick={() => onReactivate(medicine)}
              >
                Reactivate
              </Button>
            )}
          </span>
        </TD>
      )}
    </TR>
  )
}

export function MedicinesScreen() {
  const { can } = useAuth()
  const canWrite = can('medicine.write')

  const [searchParams, setSearchParams] = useSearchParams()
  const highlightParam = searchParams.get('highlight')

  const [query, setQuery] = useState('')
  const [dosageForm, setDosageForm] = useState<DosageFormFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<MedicineResponse | null>(null)
  const [draftName, setDraftName] = useState('')
  const [confirming, setConfirming] = useState<MedicineResponse | null>(null)
  // Held separately so the title doesn't fall back to "this medicine" during
  // the dialog's exit animation.
  const [confirmName, setConfirmName] = useState('')

  const debouncedQuery = useDebouncedValue(query.trim(), 180)
  const filtering = dosageForm !== 'all' || status !== 'all'

  const view = useMedicineList({ query: debouncedQuery, page, dosageForm, status })
  const setActive = useSetMedicineActive()

  // A new query or filter always starts at the first page — page 4 of a
  // different result set is meaningless.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, dosageForm, status])

  /* The command palette deep-links with `?highlight=<id>`. The medicine may sit
     on any page of the catalogue, so instead of hunting for it we look it up,
     put its name in the search box — where the server's ranking floats it to
     the top — and flash the row. The param is consumed immediately so a reload
     or a back-navigation doesn't replay the effect. */
  const highlightTarget = useMedicineById(highlightParam)

  useEffect(() => {
    const medicine = highlightTarget.data
    if (!medicine) return
    setQuery(medicine.name)
    setDosageForm('all')
    setStatus('all')
    setHighlighted(medicine.id)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('highlight')
        return next
      },
      { replace: true },
    )
  }, [highlightTarget.data, setSearchParams])

  useEffect(() => {
    if (!highlightParam || !highlightTarget.isError) return
    toast.error('That medicine is no longer in the formulary.')
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('highlight')
        return next
      },
      { replace: true },
    )
  }, [highlightParam, highlightTarget.isError, setSearchParams])

  // The flash is a pointer, not a state: it fades on its own.
  useEffect(() => {
    if (!highlighted) return
    const timer = setTimeout(() => setHighlighted(null), 1800)
    return () => clearTimeout(timer)
  }, [highlighted])

  const openCreate = useCallback((name = '') => {
    setEditing(null)
    setDraftName(name)
    setSheetOpen(true)
  }, [])

  const openEdit = useCallback((medicine: MedicineResponse) => {
    setEditing(medicine)
    setDraftName('')
    setSheetOpen(true)
  }, [])

  const askDeactivate = useCallback((medicine: MedicineResponse) => {
    setConfirmName(medicine.name)
    setConfirming(medicine)
  }, [])

  const reactivate = useCallback(
    (medicine: MedicineResponse) => {
      setActive.mutate(
        { id: medicine.id, active: true, name: medicine.name },
        {
          onSuccess: () => toast.success(`${medicine.name} is back in the formulary`),
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    },
    [setActive],
  )

  const confirmDeactivate = useCallback(() => {
    const medicine = confirming
    if (!medicine) return
    setActive.mutate(
      { id: medicine.id, active: false, name: medicine.name },
      {
        onSuccess: () => {
          setConfirming(null)
          toast.success(`${medicine.name} deactivated`, {
            description: 'It stays on past prescriptions and can be reactivated.',
          })
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }, [confirming, setActive])

  const clearFilters = useCallback(() => {
    setDosageForm('all')
    setStatus('all')
  }, [])

  const columnCount = canWrite ? 8 : 7
  const searching = debouncedQuery.length > 0
  const showSummary = searching || filtering || view.truncated

  const summary = useMemo(() => {
    if (searching) {
      return view.total === 1
        ? `1 match for “${debouncedQuery}”`
        : `${view.total.toLocaleString()} matches for “${debouncedQuery}”`
    }
    if (filtering) {
      return `${view.total.toLocaleString()} of ${view.matchedTotal.toLocaleString()} medicines`
    }
    return ''
  }, [debouncedQuery, filtering, searching, view.matchedTotal, view.total])

  /* Hoisted out of the table body: the same three empty states have to serve
     the phone card list and the desktop table, and an EmptyState duplicated
     into two renders is an EmptyState that drifts. */
  const emptyState = searching ? (
    <EmptyState
      icon={<Search />}
      title={`Nothing matches “${debouncedQuery}”`}
      description={
        filtering
          ? 'Search covers name, generic and brand, and forgives spelling. Your filters may be hiding the match.'
          : 'Search covers name, generic and brand, and forgives spelling.'
      }
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {canWrite && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="size-4" />}
              onClick={() => openCreate(debouncedQuery)}
            >
              Add “{debouncedQuery}”
            </Button>
          )}
          {filtering && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      }
    />
  ) : filtering ? (
    <EmptyState
      icon={<Pill />}
      title="No medicines match these filters"
      description="Nothing in the formulary has that combination of form and status."
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<Pill />}
      title="The formulary is empty"
      description="No medicines have been added yet — the catalogue has not been seeded. Until one exists, the prescription pad has nothing to offer."
      action={
        canWrite && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="size-4" />}
            onClick={() => openCreate()}
          >
            Add the first medicine
          </Button>
        )
      }
    />
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Formulary"
        description="Every medicine the pad can prescribe from."
        actions={
          canWrite && (
            /* Adding a medicine is the only reason an admin opens this screen
               with intent, so on a phone the button takes the whole line and a
               full 44px rather than sitting as a 32px chip beside the title. */
            <Button
              variant="primary"
              iconLeft={<Plus className="size-4" />}
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
              onClick={() => openCreate()}
            >
              Add medicine
            </Button>
          )
        }
      />

      {/* Already a wrapping row; what it lacked was height. Every control here
          is 32px, which is a comfortable mouse target and a poor thumb one, so
          below `sm` each one is raised to the 44px tap minimum. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <Field label="Search the formulary" className="[&>label]:sr-only">
            {(a) => (
              <Input
                {...a}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Escape clears without leaving the field — the browser's own
                  // type="search" clear button would duplicate the one below.
                  if (event.key === 'Escape' && query) {
                    event.preventDefault()
                    setQuery('')
                  }
                }}
                maxLength={MAX_QUERY_LENGTH}
                type="text"
                role="searchbox"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search name, generic or brand…"
                className="min-h-tap sm:min-h-0"
                iconLeft={<Search />}
                slotRight={
                  query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="duration-fast hover:text-text focus-visible:outline-focus rounded p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <X aria-hidden />
                    </button>
                  ) : undefined
                }
              />
            )}
          </Field>
        </div>

        <Select<DosageFormFilter>
          value={dosageForm}
          onChange={setDosageForm}
          options={DOSAGE_FORM_OPTIONS}
          aria-label="Filter by dosage form"
          className="min-h-tap w-auto min-w-36 sm:min-h-0"
        />

        <SegmentedControl<StatusFilter>
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          /* The segments are 28px each and the control has no size that reaches
             44, so the tap height is raised on the segments themselves. */
          className="max-sm:[&>button]:min-h-tap"
        />

        {filtering && (
          <Button variant="ghost" size="sm" className="min-h-tap sm:min-h-0" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {view.isError ? (
        <ErrorState error={view.error} onRetry={view.refetch} />
      ) : (
        <Card>
          {showSummary && (
            <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <p role="status" className="text-caption text-text-muted">
                {summary}
              </p>
              {view.capped && (
                <p className="text-caption text-text-subtle">
                  Showing the {SEARCH_LIMIT} closest matches — keep typing to narrow it.
                </p>
              )}
              {view.truncated && (
                <p className="text-caption text-text-subtle">
                  Filtering the first 1,000 medicines only.
                </p>
              )}
            </div>
          )}

          {/* Twin renders of the same `view.rows`, one query behind both. Below
              `sm` the formulary is a stacked card list; from `sm` up the dense
              table comes back untouched, because on a desk the seven columns
              are the fastest way to compare two medicines. */}
          <ul className="sm:hidden">
            {view.isPending
              ? Array.from({ length: 8 }, (_, index) => (
                  <li
                    key={index}
                    className="border-border flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0"
                  >
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </li>
                ))
              : view.rows.map((medicine) => (
                  <MedicineCard
                    key={medicine.id}
                    medicine={medicine}
                    canWrite={canWrite}
                    highlighted={highlighted === medicine.id}
                    onEdit={openEdit}
                    onDeactivate={askDeactivate}
                    onReactivate={reactivate}
                  />
                ))}
            {!view.isPending && view.rows.length === 0 && <li>{emptyState}</li>}
          </ul>

          <div className="hidden sm:block">
            <Table label="Formulary">
              <THead>
                <TH>Medicine</TH>
                <TH className="hidden md:table-cell">Brand</TH>
                <TH width="7rem">Form</TH>
                <TH width="7rem">Strength</TH>
                <TH className="hidden lg:table-cell">Category</TH>
                <TH className="hidden xl:table-cell">Defaults</TH>
                <TH className="hidden 2xl:table-cell">Manufacturer</TH>
                {canWrite && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <tbody>
                {view.isPending
                  ? Array.from({ length: 8 }, (_, index) => (
                      <TR key={index}>
                        <TD>
                          <Skeleton className="h-3 w-40" />
                        </TD>
                        <TD className="hidden md:table-cell">
                          <Skeleton className="h-3 w-24" />
                        </TD>
                        <TD>
                          <Skeleton className="h-3 w-14" />
                        </TD>
                        <TD>
                          <Skeleton className="h-3 w-12" />
                        </TD>
                        <TD className="hidden lg:table-cell">
                          <Skeleton className="h-3 w-20" />
                        </TD>
                        <TD className="hidden xl:table-cell">
                          <Skeleton className="h-3 w-28" />
                        </TD>
                        <TD className="hidden 2xl:table-cell">
                          <Skeleton className="h-3 w-24" />
                        </TD>
                        {canWrite && <TD />}
                      </TR>
                    ))
                  : view.rows.map((medicine) => (
                      <MedicineRow
                        key={medicine.id}
                        medicine={medicine}
                        canWrite={canWrite}
                        highlighted={highlighted === medicine.id}
                        onEdit={openEdit}
                        onDeactivate={askDeactivate}
                        onReactivate={reactivate}
                      />
                    ))}

                {!view.isPending && view.rows.length === 0 && (
                  <tr>
                    <td colSpan={columnCount}>{emptyState}</td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>

          {view.paginated && !view.isPending && (
            <Pagination
              page={view.page}
              pages={view.pages}
              total={view.total}
              pageSize={view.pageSize}
              onPageChange={setPage}
            />
          )}
        </Card>
      )}

      {canWrite && (
        <>
          <MedicineSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            medicine={editing}
            initialName={draftName}
          />

          <ConfirmDialog
            open={confirming !== null}
            onOpenChange={(open) => !open && setConfirming(null)}
            title={`Deactivate ${confirmName}?`}
            body="It stops appearing on the prescription pad. Prescriptions that already name it are untouched, and you can reactivate it at any time."
            confirmLabel="Deactivate"
            destructive
            loading={setActive.isPending}
            onConfirm={confirmDeactivate}
          />
        </>
      )}
    </div>
  )
}

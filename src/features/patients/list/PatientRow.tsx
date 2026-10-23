/**
 * One patient on the list — the same markup at every width.
 *
 * The row is a stretched link: the name's `after:absolute after:inset-0` makes
 * the whole `<li>` one target that opens the record, without nesting the
 * dialable phone number or the New Rx button inside another anchor. Those two
 * sit `relative z-10` above the overlay, so they stay separately tappable.
 *
 * Reading order, left to right: who (name, allergy, age, phone) -> when they
 * were last here -> how often -> the one next action. Below `sm` the last two
 * fold into a quiet second line so the button keeps its full 44px height.
 */

import { Link } from 'react-router-dom'
import { ChevronRight, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { fullName } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Feedback'
import type { PatientListItem } from '@/api/schema'
import { shortGender } from '../api'
import { AllergyChip } from '../AllergyDisplay'
import { PatientAvatar } from '../PatientAvatar'
import { relativeDay } from '../relativeDay'
import { formatAge } from '../age'

/** Programmatic-focus target of a row, so arrow keys can walk the list. */
const FOCUS_MARK = { 'data-row-focus': '' } as const

export function PatientRow({
  patient,
  canPrescribe,
}: {
  patient: PatientListItem
  canPrescribe: boolean
}) {
  const name = fullName(patient.first_name, patient.last_name)
  const age = formatAge(patient.date_of_birth)
  const visit = relativeDay(patient.last_visit_date)
  const visits = patient.prescription_count
  const visitsLabel = visits === 1 ? 'visit' : 'visits'
  // Seen today or yesterday reads as ink; older fades, so a glance finds the day's patients.
  const recent = visit?.en === 'Today' || visit?.en === 'Yesterday'

  return (
    <li
      data-row
      className={cn(
        'group relative flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4',
        'duration-fast ease-standard transition-colors',
        'hover:bg-surface-hover focus-within:bg-surface-hover active:bg-surface-active',
      )}
    >
      <PatientAvatar name={name} gender={patient.gender} size="md" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={`/patients/${patient.id}`}
            {...(canPrescribe ? {} : FOCUS_MARK)}
            className={cn(
              'text-body text-text max-w-full min-w-0 scroll-mt-28 truncate font-semibold',
              'after:absolute after:inset-0 focus-visible:outline-none',
              'focus-visible:after:outline-focus focus-visible:after:outline-2 focus-visible:after:-outline-offset-2',
            )}
          >
            {name}
          </Link>
          {!patient.is_active && <Badge tone="neutral">Inactive</Badge>}
          {/* Allergies sit beside the name on purpose: this practice prescribes
              NSAIDs all day and the warning must be seen before "New Rx". */}
          <AllergyChip allergies={patient.allergies} />
        </div>

        <p className="text-caption text-text-muted flex flex-wrap items-center gap-x-2">
          {age && (
            <span data-numeric>
              <span className="sr-only">
                {age} old, {patient.gender ?? 'gender not recorded'}.{' '}
              </span>
              <span aria-hidden>
                {age} · {shortGender(patient.gender)}
              </span>
            </span>
          )}
          <a
            href={`tel:${patient.phone}`}
            data-numeric
            className="text-text-muted hover:text-text relative z-10 -my-1.5 py-1.5 font-mono underline-offset-4 hover:underline"
          >
            {patient.phone}
          </a>
        </p>

        {/* Phone width: last visit and visit count as one quiet line. */}
        <p className="text-caption text-text-muted sm:hidden" data-numeric>
          {visit ? (
            <>
              <span
                lang="bn"
                className={cn('font-semibold', recent ? 'text-text' : 'text-text-muted')}
              >
                {visit.bn}
              </span>{' '}
              · {visit.en}
            </>
          ) : (
            'No visit yet'
          )}
          {visits > 0 && (
            <>
              {' '}
              · {visits} {visitsLabel}
            </>
          )}
        </p>
      </div>

      {/* From `sm`: the same two facts as columns, so a day's list scans down. */}
      <div className="hidden w-36 shrink-0 sm:block">
        {visit ? (
          <>
            <p
              lang="bn"
              className={cn('text-body font-medium', recent ? 'text-text' : 'text-text-muted')}
            >
              {visit.bn}
            </p>
            <p className="text-caption text-text-muted">{visit.en}</p>
          </>
        ) : (
          <p className="text-caption text-text-muted">No visit yet</p>
        )}
      </div>
      <div className="hidden w-14 shrink-0 text-right sm:block" data-numeric>
        <p className={cn('text-body font-semibold', visits > 0 ? 'text-text' : 'text-text-subtle')}>
          {visits}
        </p>
        <p className="text-caption text-text-muted">{visitsLabel}</p>
      </div>

      {canPrescribe && (
        <Button
          asChild
          variant="tonal"
          size="md"
          iconLeft={<FilePlus2 aria-hidden className="size-4" />}
          className="min-h-tap relative z-10 shrink-0 sm:min-h-0"
        >
          <Link
            to={`/prescriptions/new?patientId=${patient.id}`}
            aria-label={`New Rx for ${name}`}
            className="scroll-mt-28"
            {...FOCUS_MARK}
          >
            New Rx
          </Link>
        </Button>
      )}

      {/* The row opens the record; the chevron only says so. */}
      <ChevronRight
        aria-hidden
        className={cn(
          'text-text-subtle duration-fast ease-standard size-5 shrink-0 transition-transform',
          'group-hover:translate-x-0.5 motion-reduce:transform-none',
          canPrescribe && 'hidden sm:block',
        )}
      />
    </li>
  )
}

/** Same footprint as `PatientRow`, so the page does not jump when data lands. */
export function PatientRowSkeleton() {
  return (
    <li aria-hidden className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-3/5 sm:w-1/4" />
      </div>
      <div className="hidden w-36 shrink-0 flex-col gap-2 sm:flex">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="hidden h-8 w-10 shrink-0 sm:block" />
      <Skeleton className="sm:h-control h-11 w-24 shrink-0 rounded-md" />
    </li>
  )
}

import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import type { PrescriptionResponse } from '@/api/schema'
import { ageGender, clockParts, type DayLabel } from './range'

/**
 * Sticky so that in a hundred-row day the doctor always knows which day the row
 * under his thumb belongs to. It lives OUTSIDE the rounded card on purpose:
 * the card clips its hover fill with `overflow-hidden`, and a sticky element
 * inside an overflow-clipped ancestor sticks to that ancestor, i.e. never.
 */
export function DayHeader({ label, count, id }: { label: DayLabel; count: string; id: string }) {
  return (
    <h2
      id={id}
      className="z-sticky bg-bg/90 sticky top-0 flex items-baseline gap-x-2 py-2 backdrop-blur-sm"
    >
      <span className="text-label text-text font-semibold">{label.relative || label.date}</span>
      {label.relative && <span className="text-label text-text-muted">{label.date}</span>}
      {label.bn && (
        <span lang="bn" className="text-caption text-text-subtle">
          {label.bn}
        </span>
      )}
      <span className="text-caption text-text-subtle ml-auto" data-numeric>
        {count}
      </span>
    </h2>
  )
}

/**
 * One prescription. The whole row is the link — a stretched target is the
 * biggest thing a thumb can hit and needs no second control to explain.
 *
 * Phone: time on the left, then name / diagnosis / Rx stacked. From `sm`
 * the same five pieces sit on one line, so a screenful holds ~15 rows.
 * Placement is explicit (`col-start`/`row-start`) so the DOM order — which is
 * also the screen-reader order — stays time, patient, diagnosis, Rx.
 */
export function RxRow({ rx }: { rx: PrescriptionResponse }) {
  const clock = clockParts(rx.created_at)
  const meta = ageGender(rx.patient_age, rx.patient_gender)
  const voided = rx.status !== 'active'
  const lines = rx.diagnosis || rx.chief_complaint
  const meds = rx.items.length

  return (
    <li>
      <Link
        to={`/prescriptions/${rx.id}`}
        data-rx-row
        className="group min-h-tap duration-fast ease-standard hover:bg-surface-hover active:bg-surface-active focus-visible:bg-surface-hover grid grid-cols-[3rem_minmax(0,1fr)_1rem] items-start gap-x-3 gap-y-0.5 px-3 py-2.5 transition-colors scroll-mt-10 focus-visible:outline-offset-[-2px] sm:grid-cols-[4rem_minmax(0,1.2fr)_minmax(0,1.5fr)_9.5rem_1rem] sm:items-center sm:gap-x-4 sm:px-4 sm:py-2.5"
      >
        <span
          className="col-start-1 row-span-3 row-start-1 flex flex-col leading-tight sm:row-span-1"
          data-numeric
        >
          {clock ? (
            <>
              <span className="text-label text-text font-semibold">{clock.hm}</span>
              <span className="text-micro text-text-subtle">{clock.ap}</span>
            </>
          ) : (
            <span className="text-text-subtle">—</span>
          )}
        </span>

        <span className="col-start-2 row-start-1 flex min-w-0 flex-col">
          <span className="text-body text-text truncate font-medium">
            {rx.patient_name || 'Unnamed patient'}
          </span>
          {(meta || rx.patient_phone) && (
            <span className="text-label text-text-muted truncate" data-numeric>
              {[meta, rx.patient_phone].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>

        <span className="text-label col-start-2 row-start-2 min-w-0 text-pretty sm:col-start-3 sm:row-start-1">
          {lines ? (
            <span className="text-text line-clamp-2">{lines}</span>
          ) : (
            <span className="text-text-subtle">No diagnosis recorded</span>
          )}
        </span>

        <span className="col-start-2 row-start-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:col-start-4 sm:row-start-1 sm:flex-col sm:items-end sm:gap-0">
          <span className="text-label text-text-muted font-mono whitespace-nowrap">
            {rx.prescription_number}
          </span>
          {/* The badge rides on the second line so the Rx numbers stay one
              straight column down the page. */}
          <span className="text-caption text-text-subtle flex items-center gap-1.5" data-numeric>
            {meds} {meds === 1 ? 'medicine' : 'medicines'}
            {voided && <Badge tone="danger">Voided</Badge>}
          </span>
        </span>

        <ChevronRight
          aria-hidden
          className="text-text-subtle duration-fast ease-standard group-hover:text-text col-start-3 row-span-3 row-start-1 size-4 self-center transition-[color,translate] group-hover:translate-x-0.5 motion-reduce:transition-none sm:col-start-5 sm:row-span-1"
        />
      </Link>
    </li>
  )
}

/** Same grid as `RxRow`, so nothing jumps when the real rows arrive. */
export function RxListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="flex items-center gap-2 py-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="border-border bg-surface divide-border divide-y overflow-hidden rounded-xl border shadow-sm">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="min-h-tap grid grid-cols-[3rem_minmax(0,1fr)_1rem] items-center gap-x-3 px-3 py-3 sm:grid-cols-[4rem_minmax(0,1.2fr)_minmax(0,1.5fr)_9.5rem_1rem] sm:gap-x-4 sm:px-4 sm:py-2.5"
          >
            <Skeleton className="h-8 w-9" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5" style={{ width: `${48 + ((i * 17) % 38)}%` }} />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton
              className="hidden h-3 sm:block"
              style={{ width: `${40 + ((i * 23) % 50)}%` }}
            />
            <Skeleton className="ml-auto hidden h-3 w-20 sm:block" />
            <span />
          </div>
        ))}
      </div>
    </div>
  )
}

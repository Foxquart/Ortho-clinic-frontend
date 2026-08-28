import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import { PatientAvatar } from '@/features/patients/PatientAvatar'

/*
 * The pieces the dashboard is built from. They exist as their own file for one
 * reason: the screen is a COMPOSITION, and once the row and figure anatomies
 * are lifted out, the screen file reads as the layout decision it actually is.
 *
 * Two anatomies, used consistently:
 *
 *   StatFigure   tinted icon chip + quiet label on one line, a large tabular
 *                numeral below it, and a one-line scope hint under that. The
 *                chip is what stops a stat reading as a bare number in a box.
 *   PersonRow    initials disc + patient name (primary) + metadata on a second
 *                line (secondary) + one trailing mark. Two lines, because the
 *                whole complaint about the old rows was that the name and the
 *                timestamp sat at the same rank on the same line.
 *
 * Colour discipline: the accent tint is reserved for TODAY. Anything that is
 * lifetime context gets a neutral chip. That is the hierarchy, encoded in the
 * one channel the eye reads before it reads any text. Status hues
 * (info/success/warning/danger) are never used decoratively here — in this app
 * they mean clinical state, and a green "prescriptions" chip would be a lie
 * about what green means everywhere else.
 */

/** Appointment lifecycle → the app's status tones. Shape + text, never hue alone. */
export const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: 'info',
  confirmed: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

/**
 * One headline number.
 *
 * `hint` is a plain-language statement of what the number actually counts —
 * "upcoming" is meaningless until you know it means today and later. `zeroHint`
 * replaces it when the count is nought, so a quiet clinic reads as a quiet
 * clinic rather than as a screen that failed to load. A dashboard that renders
 * a grid of unexplained zeros is indistinguishable from a broken one.
 */
export function StatFigure({
  label,
  value,
  hint,
  zeroHint,
  icon,
  to,
  loading,
}: {
  label: string
  value: number | undefined
  hint: string
  zeroHint: string
  icon: React.ReactNode
  to: string
  loading: boolean
}) {
  const isZero = !loading && (value ?? 0) === 0

  return (
    <Link
      to={to}
      className={cn(
        /*
         * One anatomy, two arrangements, placed explicitly on a grid so the
         * DOM order never has to change:
         *
         *   phone   [chip · label]  [ 9 ]     two columns, the figure to the
         *           [hint       ]             right, ~72px tall
         *
         *   desk    [chip · label]            one column, three rows, the
         *           [ 9          ]            figure on its own line
         *           [hint        ]
         *
         * The phone case matters: stacked three-high, the desk arrangement made
         * the most important block on the screen 450px tall, and this doctor
         * should not have to scroll past his own day to reach it.
         */
        'group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-4',
        'sm:grid-cols-1 sm:items-stretch sm:gap-y-0 sm:px-6 sm:py-6',
        'transition-colors duration-fast ease-standard hover:bg-surface-hover',
        // The figures sit inside a clipped card, so the ring is drawn inward —
        // an outward one would be sliced off by the card's rounded edge.
        'focus-visible:outline-offset-[-2px]',
      )}
    >
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent [&_svg]:size-4"
        >
          {icon}
        </span>
        <span className="min-w-0 truncate text-caption font-medium text-text-muted">{label}</span>
        <ArrowUpRight
          aria-hidden
          className={cn(
            'ml-auto hidden size-4 shrink-0 text-text-subtle opacity-0 sm:block',
            'transition-opacity duration-base ease-standard',
            'group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        />
      </span>

      <span
        className={cn(
          'col-start-2 row-span-2 row-start-1 justify-self-end',
          'sm:col-start-1 sm:row-span-1 sm:row-start-2 sm:mt-4 sm:justify-self-start',
        )}
      >
        {loading ? (
          <Skeleton className="h-8 w-14" />
        ) : (
          <span
            data-numeric
            className={cn(
              // The type scale stops at 32px because it was cut for HEADINGS.
              // A dashboard figure is a different job — it is read at a glance
              // from a metre away, not word by word — so it takes one step past
              // the scale on a desk-sized viewport and stays at `display` on a
              // phone, where 40px would swamp the row.
              'block text-display leading-none font-semibold tracking-tight sm:text-[2.5rem]',
              // A zero is still a real answer, so it is never dimmed out of
              // legibility — `text-subtle` clears 8:1. It simply stops
              // shouting, because nothing happened.
              isZero ? 'text-text-subtle' : 'text-text',
            )}
          >
            {value ?? 0}
          </span>
        )}
      </span>

      <span className="col-start-1 row-start-2 sm:row-start-3 sm:mt-2">
        {loading ? (
          <Skeleton className="h-3 w-28" />
        ) : (
          <span className="block text-caption text-text-subtle">
            {isZero ? zeroHint : hint}
          </span>
        )}
      </span>
    </Link>
  )
}

/**
 * The neutral disc that gives a list its rhythm. `bg-sunken` is the only
 * neutral that reads as recessed in BOTH themes, and it stays visible when the
 * row hovers to `surface-hover`.
 */

/**
 * A list row. 56px tall, comfortably past the 44px touch minimum, with the
 * patient name at body weight and everything else demoted to a caption on the
 * line beneath it.
 */
export function PersonRow({
  to,
  name,
  meta,
  trailing,
}: {
  to: string
  name: string
  meta: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <li>
      <Link
        to={to}
        className={cn(
          'group flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5',
          'transition-colors duration-fast ease-standard hover:bg-surface-hover',
          'focus-visible:bg-surface-hover focus-visible:outline-offset-[-2px]',
        )}
      >
        <PatientAvatar name={name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-text">{name}</span>
          <span className="mt-0.5 block truncate text-caption text-text-muted">{meta}</span>
        </span>
        {trailing}
      </Link>
    </li>
  )
}

/** The status pill, sized so it reads across a desk rather than up close. */
export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot className="shrink-0 px-2.5 py-1">
      {label}
    </Badge>
  )
}

export function RowChevron() {
  return (
    <ChevronRight
      aria-hidden
      className="size-4 shrink-0 text-text-subtle transition-colors duration-fast group-hover:text-text-muted"
    />
  )
}

/**
 * A lifetime total. Deliberately the quietest thing on the screen: a neutral
 * chip instead of an accent one, a 24px value instead of a 32px one, and a
 * sunken well instead of a raised card. These are context, not headlines —
 * nobody opens a dashboard to find out how many medicines are in the
 * formulary.
 */
export function RecordLink({
  label,
  value,
  icon,
  to,
  loading,
}: {
  label: string
  value: number | undefined
  icon: React.ReactNode
  to: string
  loading: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group -mx-2 flex min-h-tap items-center gap-3 rounded-md px-2 py-1.5',
        'transition-colors duration-fast ease-standard hover:bg-surface-hover',
      )}
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text-subtle [&_svg]:size-4"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption text-text-muted">{label}</span>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-12" />
        ) : (
          <span
            data-numeric
            className="block text-title font-semibold leading-tight tracking-tight text-text"
          >
            {value ?? 0}
          </span>
        )}
      </span>
      <ArrowUpRight
        aria-hidden
        className={cn(
          'size-4 shrink-0 text-text-subtle opacity-0',
          'transition-opacity duration-base ease-standard',
          'group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
      />
    </Link>
  )
}

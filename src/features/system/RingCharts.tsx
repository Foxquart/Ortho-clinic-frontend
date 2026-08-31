import { cn } from '@/lib/cn'

/*
 * The two ring-shaped charts the superadmin screen uses, in plain SVG — same
 * reasoning as `Sparkline.tsx`: a charting library is a poor trade for two
 * figures on one screen.
 *
 * Both are `aria-hidden` glances, never the answer. Every number a ring encodes
 * is also printed as text right next to it (the centre label, the legend, the
 * table below), so the ring can afford to be purely visual: rounded segment
 * ends, a gap between slices, colour from the `--color-chart-*` tokens so the
 * light/dark palettes apply without a hex in this file.
 */

const SIZE = 100
const CX = SIZE / 2
const CY = SIZE / 2

function polar(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180 // 0° at 12 o'clock, clockwise
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}

function arcPath(radius: number, startDeg: number, endDeg: number): string {
  const a = polar(radius, startDeg)
  const b = polar(radius, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`
}

export interface DonutSegment {
  key: string
  value: number
  /** A `stroke-*` class carrying the series colour, e.g. `stroke-chart-1`. */
  strokeClass: string
}

/**
 * A segmented donut. Slices are stroked arcs with round caps and a small
 * angular gap, so each reads as its own pill — the shape channel that keeps
 * neighbours apart even where two hues sit close for a colour-blind reader.
 *
 * `children` land dead centre, on top of the hole.
 */
export function DonutChart({
  segments,
  thickness = 12,
  padAngle = 4,
  className,
  children,
}: {
  segments: readonly DonutSegment[]
  /** Ring thickness in viewBox units (the viewBox is 100 wide). */
  thickness?: number
  /** Angular gap between slices, degrees. */
  padAngle?: number
  className?: string
  children?: React.ReactNode
}) {
  const radius = (SIZE - thickness) / 2
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  /* Round caps extend half the stroke width past each arc end; pull both ends
     in by that much so the painted pill fills exactly the slice's share. */
  const capDeg = (thickness / 2 / radius) * (180 / Math.PI)

  let cursor = 0
  const slices = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = total > 0 ? (s.value / total) * 360 : 0
      const start = cursor
      cursor += sweep
      const from = start + padAngle / 2 + capDeg
      const to = start + sweep - padAngle / 2 - capDeg
      /* A sliver narrower than its own end-caps still deserves a dot — a 0.4%
         TOAST segment that silently vanished would misreport the breakdown. */
      const collapsed = to <= from
      const mid = start + sweep / 2
      return {
        key: s.key,
        strokeClass: s.strokeClass,
        d: collapsed ? arcPath(radius, mid, mid + 0.01) : arcPath(radius, from, to),
      }
    })

  return (
    <div className={cn('relative', className)}>
      <svg aria-hidden viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
        {slices.map((slice) => (
          <path
            key={slice.key}
            d={slice.d}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            className={slice.strokeClass}
          />
        ))}
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * A single value against its ceiling, as a ring: a full recessed track with
 * the used share drawn over it. `ratio` may exceed 1 (a database can be over
 * quota); the drawing clamps, the caller's text says the honest number.
 */
export function ProgressRing({
  ratio,
  thickness = 10,
  /** A `stroke-*` class for the filled arc. */
  strokeClass,
  className,
  children,
}: {
  ratio: number
  thickness?: number
  strokeClass: string
  className?: string
  children?: React.ReactNode
}) {
  const radius = (SIZE - thickness) / 2
  const capDeg = (thickness / 2 / radius) * (180 / Math.PI)
  const clamped = Math.min(1, Math.max(0, ratio))
  /* Leave room for the round caps; below that the arc becomes a dot at 12
     o'clock, which is the right picture for "nearly nothing". */
  const sweep = clamped * 360
  const drawable = sweep > capDeg * 2

  return (
    <div className={cn('relative', className)}>
      <svg aria-hidden viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
        <circle
          cx={CX}
          cy={CY}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-bg-sunken"
        />
        {clamped > 0 && (
          <path
            d={
              drawable
                ? arcPath(radius, capDeg, sweep - capDeg)
                : arcPath(radius, 0, 0.01)
            }
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            className={strokeClass}
          />
        )}
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  )
}

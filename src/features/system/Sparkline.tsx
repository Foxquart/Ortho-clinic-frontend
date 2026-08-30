import { useId } from 'react'
import { cn } from '@/lib/cn'
import { lastReading } from './systemFormat'

/*
 * A sparkline, in about a hundred lines of SVG.
 *
 * There is no charting library in this project and there is not going to be
 * one: a dependency that ships a layout engine, a scale system and an
 * accessibility model we would then have to fight is a poor trade for four
 * 40px-tall polylines on one superadmin screen.
 *
 * Three decisions worth stating:
 *
 *   1. `preserveAspectRatio="none"` — the viewBox is 100 units wide whatever
 *      the container is, so the path stretches to fill. That distorts stroke
 *      width too, which is what `vectorEffect="non-scaling-stroke"` undoes.
 *      Without it a wide sparkline draws a hairline and a narrow one draws a
 *      slab.
 *   2. Nulls are GAPS, not zeroes. A probe that did not report is not a probe
 *      that reported nothing, and joining across it draws an interpolated line
 *      through an outage. The path is therefore a set of segments.
 *   3. Colour comes from `currentColor` on a theme token class, so the line
 *      follows the light/dark palette without a single hex here.
 */

export type SparklineTone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASS: Record<SparklineTone, string> = {
  accent: 'text-accent',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text-subtle',
}

const VIEW_W = 100
const VIEW_H = 32
/** Half the stroke plus a little, so a peak at the top is not clipped in half. */
const PAD = 2

function scaleX(index: number, count: number): number {
  if (count <= 1) return VIEW_W / 2
  return (index / (count - 1)) * VIEW_W
}

function scaleY(value: number, lo: number, hi: number): number {
  const span = hi - lo
  if (span <= 0) return VIEW_H / 2
  const t = (value - lo) / span
  return VIEW_H - PAD - t * (VIEW_H - PAD * 2)
}

/** Runs of consecutive non-null readings, each drawn as its own polyline. */
function segments(values: readonly (number | null)[]): { index: number; value: number }[][] {
  const runs: { index: number; value: number }[][] = []
  let current: { index: number; value: number }[] = []
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      if (current.length > 0) runs.push(current)
      current = []
      return
    }
    current.push({ index, value })
  })
  if (current.length > 0) runs.push(current)
  return runs
}

export function Sparkline({
  label,
  values,
  formatValue,
  tone = 'accent',
  baseline = 'zero',
  className,
  emptyLabel = 'No samples in this window',
}: {
  /** Names the series. Read out loud by a screen reader; also drawn as the caption. */
  label: string
  values: readonly (number | null)[]
  /** Renders the text fallback — the latest value, in words, next to the squiggle. */
  formatValue: (value: number) => string
  tone?: SparklineTone
  /**
   * `zero` anchors the floor at 0 — right for counters, where half the
   * information is how far above nothing the line sits. `min` scales to the
   * data — right for latency, where everything interesting happens in a band
   * far from zero and a zero floor flattens it into a straight line.
   */
  baseline?: 'zero' | 'min'
  className?: string
  emptyLabel?: string
}) {
  const captionId = useId()
  const present = values.filter((v): v is number => v != null && Number.isFinite(v))
  const latest = lastReading(values)

  const hi = present.length > 0 ? Math.max(...present) : 0
  const rawLo = present.length > 0 ? Math.min(...present) : 0
  const lo = baseline === 'zero' ? Math.min(0, rawLo) : rawLo
  /* A perfectly flat series would give a zero span and divide by nothing. Open
     the range slightly so it draws as a line through the middle, which is the
     honest picture: nothing changed. */
  const top = hi > lo ? hi : lo + 1

  const runs = present.length > 0 ? segments(values) : []
  const count = values.length

  return (
    <figure className={cn('flex min-w-0 flex-col gap-1', className)}>
      {/* The text fallback is not a concession to screen readers — it is the
          part a person actually reads. An unlabelled squiggle with no number
          beside it is decoration. */}
      <figcaption
        id={captionId}
        className="text-caption text-text-muted flex items-baseline justify-between gap-2"
      >
        <span className="min-w-0 truncate">{label}</span>
        <span data-numeric className="text-text shrink-0 font-medium">
          {latest == null ? '—' : formatValue(latest)}
        </span>
      </figcaption>

      {present.length === 0 ? (
        <p className="text-caption text-text-subtle flex h-8 items-center">{emptyLabel}</p>
      ) : (
        <svg
          role="img"
          aria-labelledby={captionId}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className={cn('h-8 w-full', TONE_CLASS[tone])}
        >
          {runs.map((run) => {
            const points = run
              .map(
                (p) =>
                  `${scaleX(p.index, count).toFixed(2)},${scaleY(p.value, lo, top).toFixed(2)}`,
              )
              .join(' ')
            const key = `${run[0].index}-${run[run.length - 1].index}`

            /* A run of one has no line to draw, so it becomes a dot — a single
               surviving probe in a window of gaps is worth seeing. */
            if (run.length === 1) {
              return (
                <circle
                  key={key}
                  cx={scaleX(run[0].index, count)}
                  cy={scaleY(run[0].value, lo, top)}
                  r={1}
                  fill="currentColor"
                  vectorEffect="non-scaling-stroke"
                />
              )
            }

            return (
              <g key={key}>
                {/* The fill is what gives a 32px-tall line enough visual mass
                    to be read at a glance; at 10% it never competes with the
                    stroke for the eye. */}
                <polygon
                  points={`${points} ${scaleX(run[run.length - 1].index, count).toFixed(2)},${VIEW_H} ${scaleX(run[0].index, count).toFixed(2)},${VIEW_H}`}
                  fill="currentColor"
                  className="opacity-10"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}
        </svg>
      )}
    </figure>
  )
}

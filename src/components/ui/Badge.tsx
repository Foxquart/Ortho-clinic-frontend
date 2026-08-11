import { cn } from '@/lib/cn'

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

/*
 * Ink is the `-muted-fg` token, never the solid `-X`. The solid is tuned to
 * carry WHITE on top of it; putting it ON its own tint was landing at 4.6–5.1:1
 * where the ladder everywhere else in this app is 7:1+. The `-muted-fg` pair
 * exists for exactly this and lands at 7.1–10.6:1.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-sunken text-text-muted border-border',
  accent: 'bg-accent-muted text-accent-muted-fg border-accent/25',
  success: 'bg-success-muted text-success-muted-fg border-success/30',
  warning: 'bg-warning-muted text-warning-muted-fg border-warning/30',
  danger: 'bg-danger-muted text-danger-muted-fg border-danger/35',
  info: 'bg-info-muted text-info-muted-fg border-info/30',
}

/*
 * The dot is a SHAPE, not just a colour.
 *
 * A round dot that only changes hue encodes the entire status in the one
 * channel ~8% of men cannot read, and this is a medical tool. Each tone now
 * gets its own silhouette, so the badge survives deuteranopia, protanopia,
 * a greyscale print-out and a washed-out clinic monitor:
 *
 *   danger   diamond   — the hazard sign, and the only tilted shape here
 *   warning  triangle  — the caution sign
 *   success  disc      — closed, complete
 *   info     ring      — open, informational
 *   accent   square     neutral  hollow square
 *
 * These are 6px marks; anything more detailed would turn to mush, and anything
 * that relied on stroke weight alone would disappear at 1x.
 */
const DOT_SHAPE: Record<BadgeTone, string> = {
  neutral: 'rounded-[1px] border-[1.5px] border-current bg-transparent',
  accent: 'rounded-[1px] bg-current',
  success: 'rounded-full bg-current',
  warning: 'bg-current [clip-path:polygon(50%_0%,100%_100%,0%_100%)]',
  danger: 'rotate-45 rounded-[0.5px] bg-current',
  info: 'rounded-full border-[1.5px] border-current bg-transparent',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  dot,
}: {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
  /** Leading status dot — use for lifecycle states, not for counts. */
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-medium',
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 shrink-0', DOT_SHAPE[tone])} />}
      {children}
    </span>
  )
}

/** Monospaced keyboard hint, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        // `surface-raised` is pure white in light mode, so a key cap sitting on
        // a card had no fill at all. The sunken ground is the only neutral that
        // reads as recessed in both themes.
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg-sunken px-1.5',
        'font-mono text-[11px] font-medium text-text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

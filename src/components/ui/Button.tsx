import { forwardRef } from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant =
  | 'primary'
  | 'tonal'
  | 'secondary'
  | 'ghost'
  | 'subtle'
  | 'danger'
  | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

/*
 * Two rules were being broken here, both invisible in dark mode and both
 * obvious the moment you look at a light-mode card:
 *
 * 1. `surface-raised` is pure white in the light theme. `secondary`, `ghost`
 *    and `subtle` all used it as a FILL, so on a white card they had no fill
 *    and no hover feedback at all — the button only existed if it had a
 *    border. Neutral fills now come from `surface-hover` / `bg-sunken`, the
 *    two neutrals that are a real step away from the card in BOTH themes.
 *
 * 2. Solid fills hovered via alpha (`bg-accent/90`), which composites toward
 *    whatever is behind — on a light ground that LIGHTENS the button and drops
 *    the white label's contrast exactly when the pointer arrives. Solid fills
 *    now hover to a designed token that darkens in light and brightens in dark.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  // One primary per view. If two things look primary, neither is.
  primary: 'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover active:bg-accent-hover',
  // The rung between primary and secondary: an accent-tinted fill for the
  // important-but-not-THE-action (Add medicine, Continue previous). Loud
  // enough to be found at a glance, quiet enough not to compete with Save.
  tonal:
    'bg-accent-muted text-accent-muted-fg shadow-xs hover:bg-accent-muted-hover active:bg-accent-muted-hover',
  secondary:
    'bg-surface text-text border border-border-field shadow-sm hover:bg-surface-hover hover:border-border-strong active:bg-surface-active',
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text active:bg-surface-active',
  subtle: 'bg-bg-sunken text-text hover:bg-surface-active active:bg-surface-active',
  danger: 'bg-danger text-danger-fg shadow-sm hover:bg-danger-hover active:bg-danger-hover',
  link: 'text-accent underline-offset-4 hover:underline hover:text-accent-hover p-0 h-auto',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-2.5 text-caption gap-1.5 rounded-md',
  md: 'h-control px-3 text-label gap-2 rounded-md',
  lg: 'h-control-lg px-4 text-body gap-2 rounded-lg',
  icon: 'size-control rounded-md',
  'icon-sm': 'size-control-sm rounded-md',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Render as the child element (e.g. a router `<Link>`) instead of `<button>`. */
  asChild?: boolean
  /**
   * Shows a spinner and blocks interaction. The label stays in place so the
   * button never changes width mid-click.
   */
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    asChild = false,
    loading = false,
    iconLeft,
    iconRight,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  const isDisabled = disabled || loading

  return (
    <Comp
      ref={ref}
      // An unspecified <button> inside a form submits it. That has caused more
      // accidental submits than it has ever saved keystrokes.
      type={asChild ? undefined : (type ?? 'button')}
      disabled={asChild ? undefined : isDisabled}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        // Dimming is the ONLY thing in this design system allowed to signal
        // "switched off" — which is why nothing else (least of all a blank
        // provenance field) may ever be dimmed. Losing the shadow too stops a
        // disabled button from still looking liftable.
        'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
        // A press should feel physical, but a 2% squash is the whole budget.
        'active:scale-[0.98] motion-reduce:active:scale-100',
        // The label stays in place while loading so the button never changes
        // width mid-click; only the spinner is added on top.
        loading && '[&>*:not([data-slot=spinner])]:invisible',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span data-slot="spinner" className="absolute inset-0 grid place-items-center">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        </span>
      )}
      {iconLeft}
      {/*
        Slot accepts exactly one element child. `Slottable` marks which child is
        the one being slotted, so an `asChild` button can still carry icons —
        they end up inside the rendered child rather than beside it.
      */}
      <Slottable>{children}</Slottable>
      {iconRight}
    </Comp>
  )
})

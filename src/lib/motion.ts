/**
 * Shared motion primitives.
 *
 * Every animation in this app comes from here. Nothing is hand-rolled at the
 * call site — not because hand-rolling is hard, but because five slightly
 * different 200ms fades is what makes software feel cheap.
 *
 * The numbers mirror the CSS tokens in `src/styles/theme.css`. If you change
 * one, change the other.
 *
 * Three rules that decide everything below:
 *
 *  1. If the user triggered it, it must have started within 100ms. Use a snappy
 *     spring or a `fast` tween. No delay, ever.
 *  2. If it arrives on its own, it may take longer and should feel softer —
 *     the user was not waiting for it.
 *  3. If it happens hundreds of times a day (command palette, tab switch,
 *     keyboard nav), it does not animate at all. Reach for nothing here.
 *
 * Always-on or looping motion (skeleton shimmer, the live audio meter) belongs
 * in CSS, not here: CSS animations run off the main thread and keep their frame
 * rate while React is busy rendering a 400-row table.
 */

import { stagger, useReducedMotion } from 'motion/react'
import type { Easing, Transition, Variants } from 'motion/react'

/* ---------------------------------------------------------------------------
 * Durations — seconds, because that is what `motion` speaks.
 * ------------------------------------------------------------------------- */

export const duration = {
  /** 60ms — colour and opacity only. Hover, checkbox tick, row highlight. */
  instant: 0.06,
  /** 120ms — press feedback, tooltip, focus ring, inline validation. */
  fast: 0.12,
  /** 180ms — dropdown, popover, toast, tab indicator. The default. */
  base: 0.18,
  /** 260ms — dialog, sheet, side panel. The longest thing we ship. */
  slow: 0.26,
} as const

/* ---------------------------------------------------------------------------
 * Easings — the CSS curves, as bezier tuples.
 * Never `ease-in` on a UI element: it delays the first frame, which is exactly
 * the frame the user is watching.
 * ------------------------------------------------------------------------- */

/** Entering, exiting, or anything the user just triggered. The workhorse. */
export const easeOutQuint: Easing = [0.22, 1, 0.36, 1]
/** A longer tail than quint. Large surfaces travelling a long way. */
export const easeOutExpo: Easing = [0.16, 1, 0.3, 1]
/** Something already on screen moving from A to B. */
export const easeStandard: Easing = [0.45, 0, 0.15, 1]
/** Sheets and drawers — the iOS curve. Long tail, no bounce. */
export const easeSheet: Easing = [0.32, 0.72, 0, 1]

/* ---------------------------------------------------------------------------
 * Transition presets
 *
 * `visualDuration` is when the motion *looks* finished; the spring keeps
 * micro-settling after that. It is the honest number to reason about, and it
 * is what you should compare against the 100ms responsiveness budget.
 * ------------------------------------------------------------------------- */

/**
 * Anything the user directly triggered: a button press, a row selecting, a
 * panel they just opened, a value they just committed. No bounce — bounce on a
 * clinical control reads as unserious, and it delays the settle.
 */
export const springSnappy: Transition = {
  type: 'spring',
  visualDuration: 0.18,
  bounce: 0,
}

/**
 * Anything arriving on its own: a toast, a background save confirmation, a
 * transcript line landing, a result streaming in. Slower and slightly bouncy so
 * it reads as "something happened" without demanding attention.
 */
export const springSoft: Transition = {
  type: 'spring',
  visualDuration: 0.34,
  bounce: 0.16,
}

/**
 * Gesture release only — a swiped-away toast, a dragged sheet settling back.
 * Springs carry velocity through an interruption; tweens restart from zero.
 * That is the entire reason this one exists.
 */
export const springDrag: Transition = {
  type: 'spring',
  visualDuration: 0.42,
  bounce: 0.22,
}

/** Colour and opacity crossfades. Cheapest thing we do. */
export const tweenInstant: Transition = {
  duration: duration.instant,
  ease: easeOutQuint,
}

/** Press feedback, tooltips, focus affordances. */
export const tweenFast: Transition = { duration: duration.fast, ease: easeOutQuint }

/** The default tween: menus, popovers, tab indicators. */
export const tweenBase: Transition = { duration: duration.base, ease: easeOutQuint }

/** Dialogs and sheets when a spring would feel too loose. */
export const tweenSlow: Transition = { duration: duration.slow, ease: easeSheet }

/**
 * Exits are always faster than entrances. The user has already decided; making
 * them watch the decision play out is the single most common way to make an app
 * feel slow.
 */
export const tweenExit: Transition = { duration: duration.fast, ease: easeStandard }

/* ---------------------------------------------------------------------------
 * Variants
 *
 * All of them start from a visible shape — never `scale: 0`, never `y: 40`.
 * Nothing in the real world appears from nothing, and a 6px rise reads as
 * arrival just as clearly as a 40px one, in a third of the time.
 * ------------------------------------------------------------------------- */

/**
 * The default entrance. Cards, sections, inline detail, anything that appears
 * in place. 6px is deliberate: enough to register, not enough to notice.
 */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, y: 4, transition: tweenExit },
}

/**
 * Menus, popovers, comboboxes, the command palette shell.
 * Pair with `transform-origin: var(--radix-popover-content-transform-origin)`
 * (or the matching Radix var for the primitive you are using) so it grows out
 * of its trigger instead of out of its own middle. Dialogs are the exception —
 * they are not anchored to anything, so they stay centred.
 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: tweenBase },
  exit: { opacity: 0, scale: 0.98, transition: tweenExit },
}

/**
 * Modal dialogs. Centre origin, no travel — a dialog that slides has implied a
 * direction it does not have. Slightly softer spring than a popover because it
 * is a heavier object.
 */
export const dialogPop: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', visualDuration: 0.26, bounce: 0.08 } },
  exit: { opacity: 0, scale: 0.98, transition: tweenExit },
}

/** The scrim under a dialog or sheet. Fades only; never scales, never slides. */
export const overlayFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tweenBase },
  exit: { opacity: 0, transition: tweenExit },
}

/**
 * Right-hand side sheets (patient quick-view, prescription detail).
 * Travels its own width, so it works at any size, and uses the sheet curve —
 * fast off the line, long settle, no bounce.
 * For a bottom sheet, swap `x` for `y`.
 */
export const sheetSlide: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { duration: duration.slow, ease: easeSheet } },
  exit: { x: '100%', transition: { duration: duration.base, ease: easeSheet } },
}

/**
 * List container. Stagger is decorative — never block interaction on it, and
 * never apply it to a list that re-renders on every keystroke (search results,
 * the medicine autocomplete). Use it once, on first paint of a screen.
 *
 * `delayChildren: stagger(0.024)` caps out around 10 rows before the last one
 * feels late; above that, drop the stagger entirely.
 */
export const listStagger: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: stagger(0.024) } },
  exit: {},
}

/** The row inside `listStagger`. Same shape as `fadeSlideUp`, shorter travel. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, transition: tweenExit },
}

/**
 * The reduced-motion substitute for any of the above. Opacity survives because
 * it carries meaning (this is new / this is going away); distance does not.
 */
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tweenFast },
  exit: { opacity: 0, transition: tweenInstant },
}

/* ---------------------------------------------------------------------------
 * Interaction props
 * ------------------------------------------------------------------------- */

/**
 * Spread onto any pressable that is a `motion` component. A control that does
 * not move under the finger feels broken, and 0.97 is the smallest scale that
 * still reads. Do NOT add a hover scale — hover on a dense table is noise, and
 * touch devices fire hover on tap.
 */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: springSnappy,
} as const

/* ---------------------------------------------------------------------------
 * Reduced motion
 * ------------------------------------------------------------------------- */

/**
 * `useReducedMotion` returns `null` before it has read the media query, which
 * is falsy but not `false` and will happily poison a ternary. This narrows it.
 *
 * Most of the time you do not need this: `<MotionConfig reducedMotion="user">`
 * at the app root already strips transform and layout animations while keeping
 * opacity. Reach for this hook when the *decision* changes rather than the
 * values — disabling a drag gesture, skipping a stagger, choosing `fadeOnly`
 * over `sheetSlide`.
 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false
}

/** Swap any variant set for `fadeOnly` when the user has asked for less motion. */
export function motionSafeVariants(reduced: boolean, variants: Variants): Variants {
  return reduced ? fadeOnly : variants
}

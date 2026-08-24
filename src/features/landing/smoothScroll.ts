/**
 * A tiny module-level handle to the page's single Lenis instance so that
 * anchor links anywhere in the tree can ask for a smooth scroll without
 * threading the instance through React context.
 *
 * The instance is registered by `LandingPage` only inside the reduced-motion
 * "no-preference" branch, and cleared on teardown. When it is absent — reduced
 * motion, or JavaScript failed — `scrollToAnchor` falls back to a native jump,
 * so in-page navigation always works.
 */
import type Lenis from 'lenis'

let active: Lenis | null = null

/**
 * Where an anchor should land, in pixels.
 *
 * Read from `--lp-anchor-offset` on `.landing-root` rather than hardcoded, so
 * this and every `scroll-mt-*` on the page are the same number by construction.
 * The previous constant was 72px — exactly the nav pill's occupied height —
 * which put a heading flush against the pill with no clearance, and it disagreed
 * with the 96px `#book` was using in CSS.
 */
const FALLBACK_OFFSET = 96

function anchorOffset(): number {
  const root = document.querySelector('.landing-root')
  if (!root) return FALLBACK_OFFSET
  const raw = getComputedStyle(root).getPropertyValue('--lp-anchor-offset')
  const px = Number.parseFloat(raw)
  return Number.isFinite(px) && px > 0 ? px : FALLBACK_OFFSET
}

export function setActiveLenis(instance: Lenis | null): void {
  active = instance
}

/**
 * The live Lenis instance, or `null`.
 *
 * Read it, do not cache it: it is `null` under reduced motion, and it is also
 * `null` for the first few frames of a mount, because `LandingPage` registers
 * it in its own layout effect and React runs a child's effects before its
 * parent's. A caller that wants the instance at mount time has to retry.
 */
export function getActiveLenis(): Lenis | null {
  return active
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Smooth-scroll to an element by id, honouring reduced motion and the nav offset. */
export function scrollToAnchor(id: string): void {
  const el = document.getElementById(id)
  if (!el) return

  const offset = anchorOffset()

  if (active && !prefersReducedMotion()) {
    active.scrollTo(el, { offset: -offset })
    return
  }

  const top = el.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

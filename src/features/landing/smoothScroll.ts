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

/** Height the sticky nav reserves, mirrored from `--nav-h` (4rem = 64px). */
const NAV_OFFSET = 72

export function setActiveLenis(instance: Lenis | null): void {
  active = instance
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

  if (active && !prefersReducedMotion()) {
    active.scrollTo(el, { offset: -NAV_OFFSET })
    return
  }

  const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

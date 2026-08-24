/**
 * Sticky mobile booking bar.
 *
 * The booking form is the fifth thing down the page, and the majority of the
 * traffic this page will ever see is somebody on a phone who searched
 * "orthopedic doctor agartala". Asking them to scroll four full sections to
 * find the one control that matters is the single most expensive thing about
 * the mobile layout — so once the hero is behind them, the control comes to
 * them instead.
 *
 * Three rules govern when it shows:
 *   1. Not over the hero. The hero already has its own primary CTA; a second
 *      one 40px below it is noise, and it would cover the portrait.
 *   2. Not while `#book` is on screen. The real form is right there — a
 *      floating shortcut to a thing you are already looking at is clutter, and
 *      it would sit on top of the date picker.
 *   3. Never above `lg`. On desktop the nav pill's Book CTA is always visible.
 *
 * MOTION CONTRACT NOTE: this is a UI affordance, not a scroll reveal, so it is
 * driven by React state rather than by the page's GSAP matchMedia block. The
 * show/hide is a transform-only CSS transition and the bar is never
 * `opacity: 0` at rest — hidden means translated off the bottom edge and
 * `pointer-events-none`. Without JavaScript it simply never appears, which is
 * correct: the page's own in-page Book buttons and the `#book` anchor all
 * still work, so nothing is lost, only an accelerator.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { BookCta, CtaArrow } from './primitives'

export function StickyBookCta() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const book = document.getElementById('book')
    /* Tracked separately so the two conditions can update independently —
       IntersectionObserver fires on its own schedule, scroll on its own. */
    let bookInView = false
    let pastHero = false

    const sync = () => setVisible(pastHero && !bookInView)

    const onScroll = () => {
      pastHero = window.scrollY > window.innerHeight * 0.8
      sync()
    }

    const observer = book
      ? new IntersectionObserver(
          ([entry]) => {
            bookInView = entry.isIntersecting
            sync()
          },
          /* A sliver of the form counts as "in view": by the time its top edge
             is a fifth of the way up the screen the bar is redundant. */
          { rootMargin: '0px 0px -20% 0px' },
        )
      : null
    if (book && observer) observer.observe(book)

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      observer?.disconnect()
    }
  }, [])

  return (
    <div
      /* Below the header's `--z-index-sticky`, so the open mobile menu — which
         is a `fixed inset-0` child of that header — always covers it. */
      className={cn(
        'fixed inset-x-0 bottom-0 z-[calc(var(--z-index-sticky)_-_1)] lg:hidden',
        'border-t border-border bg-bg/95 backdrop-blur-xl backdrop-saturate-150',
        'px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]',
        'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        visible ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
      /* Hidden from the accessibility tree while parked off-screen: the same
         action is reachable in the nav and in the hero, and a keyboard user
         should not tab into a control they cannot see. */
      aria-hidden={!visible}
    >
      <BookCta
        labelBase="Book an appointment"
        tone="primary"
        size="lg"
        /* `min-h-12`, not `h-12`: `ScrollButton` already carries `h-control-lg`,
           and tailwind-merge does not treat a custom spacing token as the same
           group as `h-12`, so both survive and the 40px one wins. A min-height
           does not collide, and 48px is the target this bar exists to hit. */
        className="min-h-12 w-full"
        tabIndex={visible ? undefined : -1}
      >
        Book an appointment
        <CtaArrow />
      </BookCta>
    </div>
  )
}

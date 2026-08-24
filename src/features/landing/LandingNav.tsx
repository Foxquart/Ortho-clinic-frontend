/**
 * Floating pill navigation. Detached from the top edge as a rounded glass
 * island; once the page scrolls it picks up a border and a shadow. The links
 * are the same smooth-scroll targets used across the page.
 *
 * The menu button morphs to an X and opens a full-screen warm overlay whose
 * links stagger up from a masked position. Behaviour is identical with GSAP
 * and Lenis absent or under reduced motion: every state is a plain CSS
 * transition, so nothing is left half-run.
 *
 * The pill also retracts on scroll-down and returns on scroll-up, so a phone
 * reading the page at full height is not permanently down 56px of viewport.
 * That is transform-only (`.lp-nav-hide`), it never engages while the mobile
 * menu is open, and `landing.css` zeroes the transform under reduced motion —
 * which is why there is no matchMedia check in this file.
 *
 * Nothing here carries the `lp-link-draw` underline: every control in the pill
 * is a pill, and its own fill *is* the hover affordance. An underline drawn
 * inside a rounded chip reads as a mistake, and under the wordmark it would
 * have to skip the monogram to look right. Deliberate omission, not an
 * oversight.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useAuth } from '@/app/AuthProvider'
import { CtaArrow, useMagnetic } from './primitives'
import { useBookingTarget } from './bookingTarget'
import { scrollToAnchor } from './smoothScroll'

const LINKS = [
  { id: 'record', label: 'The record' },
  { id: 'life', label: 'Life' },
  { id: 'reviews', label: 'Reviews' },
] as const

export function LandingNav({ wordmark }: { wordmark: string }) {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [retracted, setRetracted] = useState(false)
  const [open, setOpen] = useState(false)
  const bookRef = useRef<HTMLAnchorElement>(null)
  /* WhatsApp / call on a phone, the in-page form on a laptop. */
  const booking = useBookingTarget()

  useMagnetic(bookRef)

  useEffect(() => {
    /* One listener owns both the surface state and the retraction so they can
       never disagree about the current scroll position. */
    let last = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 16)

      const delta = y - last
      /* Under ~6px is momentum jitter and rubber-banding, not intent — acting
         on it makes the pill flicker on every trackpad twitch. */
      if (Math.abs(delta) < 6) return
      last = y
      /* The first 80px belong to the hero: the pill must not vanish while the
         reader is still at the top of the page. */
      setRetracted(y > 80 && delta > 0)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the menu on escape and keep the page from scrolling behind it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
    }
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    scrollToAnchor(id)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-[var(--z-index-sticky)] px-4 pt-4 sm:px-6">
      <nav
        aria-label="Primary"
        className={cn(
          'lp-nav-pill mx-auto flex h-14 w-max max-w-full items-center gap-1 rounded-full border px-2.5',
          scrolled || open
            ? 'border-border bg-surface/85 shadow-sm backdrop-blur-xl backdrop-saturate-150'
            : 'border-transparent bg-surface/40 backdrop-blur-md',
          /* An open menu pins the pill in place — its close button lives in
             it, so it can never be allowed to scroll away. */
          retracted && !open && 'lp-nav-hide',
        )}
      >
        {/* Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            setOpen(false)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          aria-label={`${wordmark} — back to top`}
          className="mr-2 flex min-h-11 items-center gap-2 rounded-full pr-1 font-semibold tracking-tight lg:mr-2"
        >
          <Monogram />
          {/* Mark only below `lg`. Stacked on a phone the pill sits directly
              above the hero H1, which states the same full name — two identical
              lines about 50px apart read as a rendering fault, not as branding.
              The split layout at `lg` separates them into different zones, so
              the wordmark comes back. The name is never lost to assistive tech:
              it is the anchor's `aria-label` at every width. */}
          <span className="lp-serif hidden text-[1.3rem] leading-none text-text lg:inline">
            {wordmark}
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => go(l.id)}
              className="text-label text-text-muted hover:text-text hover:bg-surface-hover inline-flex min-h-11 items-center rounded-full px-3.5 font-medium transition-colors duration-fast"
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-1 flex items-center gap-1.5">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="text-label text-text-muted hover:text-text hidden min-h-11 items-center rounded-full px-3 font-medium transition-colors duration-fast sm:inline-flex"
            >
              Enter dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-label text-text-muted hover:text-text hidden min-h-11 items-center rounded-full px-3 font-medium transition-colors duration-fast sm:inline-flex"
            >
              Staff sign in
            </Link>
          )}

          <a
            ref={bookRef}
            href={booking.href}
            {...(booking.channel === 'whatsapp' ? { target: '_blank', rel: 'noreferrer' } : {})}
            {...(booking.labelSuffix ? { 'aria-label': `Book${booking.labelSuffix}` } : {})}
            onClick={(e) => {
              if (booking.external) return
              e.preventDefault()
              go('book')
            }}
            className="group bg-[color:var(--lp-accent)] text-[color:var(--lp-accent-fg)] hover:bg-[color:var(--lp-accent-strong)] text-label hidden h-11 items-center gap-1.5 rounded-full px-4 font-semibold shadow-sm transition-[background-color,box-shadow] duration-fast sm:inline-flex"
          >
            Book
            <CtaArrow />
          </a>

          {/* Mobile toggle — hamburger morphs to X */}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="relative grid size-11 place-items-center rounded-full text-text transition-colors duration-fast hover:bg-surface-hover lg:hidden"
          >
            <span
              aria-hidden
              className={cn(
                'absolute h-[1.5px] w-4.5 bg-current transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                open ? 'rotate-45' : '-translate-y-[3px]',
              )}
            />
            <span
              aria-hidden
              className={cn(
                'absolute h-[1.5px] w-4.5 bg-current transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                open ? '-rotate-45' : 'translate-y-[3px]',
              )}
            />
          </button>
        </div>
      </nav>

      {/* Mobile overlay menu */}
      <div
        id="landing-mobile-menu"
        hidden={!open}
        className="fixed inset-0 -z-10 bg-bg/95 backdrop-blur-2xl lg:hidden"
      >
        <div className="flex h-full flex-col justify-center gap-1 px-8 pt-16">
          {LINKS.map((l, i) => (
            <div key={l.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => go(l.id)}
                style={open ? { transitionDelay: `${90 + i * 60}ms` } : undefined}
                className={cn(
                  'lp-serif text-text flex min-h-11 w-full items-center text-left text-4xl leading-tight tracking-tight transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                  open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
                )}
              >
                {l.label}
              </button>
            </div>
          ))}
          <div
            className={cn(
              'mt-8 flex flex-col gap-3 transition-[transform,opacity] delay-300 duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
            )}
          >
            <a
              href={booking.href}
              {...(booking.channel === 'whatsapp' ? { target: '_blank', rel: 'noreferrer' } : {})}
              {...(booking.labelSuffix ? { 'aria-label': `Book${booking.labelSuffix}` } : {})}
              onClick={(e) => {
                setOpen(false)
                if (booking.external) return
                e.preventDefault()
                go('book')
              }}
              className="group bg-[color:var(--lp-accent)] text-[color:var(--lp-accent-fg)] text-label inline-flex h-12 items-center justify-center gap-2 rounded-full font-semibold"
            >
              Book
              <CtaArrow />
            </a>
            <Link
              to={isAuthenticated ? '/app' : '/login'}
              onClick={() => setOpen(false)}
              className="text-label text-text-muted inline-flex h-12 items-center justify-center rounded-full border border-border font-medium"
            >
              {isAuthenticated ? 'Enter dashboard' : 'Staff sign in'}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

/**
 * A tiny authored brand mark: two shafts meeting at a joint, in a ring.
 * Abstract on purpose — a literal bone reads as a warning sign at 16px, and
 * the joint is the thing an orthopaedic surgeon actually treats.
 */
export function Monogram() {
  return (
    <span
      aria-hidden
      className="grid size-8 place-items-center rounded-full border-[1.5px] border-[color:var(--lp-accent-line)] text-[color:var(--lp-accent)]"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M12 4v4.4M12 15.6V20" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    </span>
  )
}

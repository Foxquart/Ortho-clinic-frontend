/**
 * Floating pill navigation. Detached from the top edge as a rounded glass
 * island; once the page scrolls it picks up a border and a shadow. The links
 * are the same smooth-scroll targets used across the page.
 *
 * The menu button morphs to an X and opens a full-screen warm overlay whose
 * links stagger up from a masked position. Behaviour is identical with GSAP
 * and Lenis absent or under reduced motion: every state is a plain CSS
 * transition, so nothing is left half-run.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/app/AuthProvider'
import { scrollToAnchor } from './smoothScroll'

const LINKS = [
  { id: 'events', label: 'Events' },
  { id: 'life', label: 'Life' },
  { id: 'about', label: 'About' },
  { id: 'visit', label: 'Visit' },
] as const

export function LandingNav({ wordmark }: { wordmark: string }) {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
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
          className="mr-2 flex items-center gap-2 rounded-full pr-1 font-semibold tracking-tight"
        >
          <Monogram />
          <span className="lp-serif text-[1.3rem] leading-none text-text">{wordmark}</span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => go(l.id)}
              className="text-label text-text-muted hover:text-text hover:bg-surface-hover rounded-full px-3.5 py-2 font-medium transition-colors duration-fast"
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
              className="text-label text-text-muted hover:text-text hidden rounded-full px-3 py-2 font-medium transition-colors duration-fast sm:inline-flex"
            >
              Enter dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-label text-text-muted hover:text-text hidden rounded-full px-3 py-2 font-medium transition-colors duration-fast sm:inline-flex"
            >
              Staff sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => go('book')}
            className="bg-[color:var(--lp-accent)] text-[color:var(--lp-accent-fg)] hover:bg-[color:var(--lp-accent-strong)] text-label hidden h-10 items-center gap-1.5 rounded-full px-4 font-semibold shadow-sm transition-[background-color,box-shadow] duration-fast sm:inline-flex"
          >
            Book time
            <ArrowRight aria-hidden className="size-4" />
          </button>

          {/* Mobile toggle — hamburger morphs to X */}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="relative grid size-10 place-items-center rounded-full text-text transition-colors duration-fast hover:bg-surface-hover lg:hidden"
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
                  'lp-serif text-text w-full text-left text-4xl leading-tight tracking-tight transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
                )}
              >
                {l.label}
              </button>
            </div>
          ))}
          <div
            className={cn(
              'mt-8 flex flex-col gap-3 transition-all delay-300 duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
              open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
            )}
          >
            <button
              type="button"
              onClick={() => go('book')}
              className="bg-[color:var(--lp-accent)] text-[color:var(--lp-accent-fg)] text-label inline-flex h-control-lg items-center justify-center gap-2 rounded-full font-semibold"
            >
              Book time
              <ArrowRight aria-hidden className="size-4" />
            </button>
            <Link
              to={isAuthenticated ? '/app' : '/login'}
              onClick={() => setOpen(false)}
              className="text-label text-text-muted inline-flex h-control-lg items-center justify-center rounded-full border border-border font-medium"
            >
              {isAuthenticated ? 'Enter dashboard' : 'Staff sign in'}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

/** A tiny authored brand mark: a smile arc in a ring. Not an illustration. */
function Monogram() {
  return (
    <span
      aria-hidden
      className="grid size-8 place-items-center rounded-full border-[1.5px] border-[color:var(--lp-accent-line)] text-[color:var(--lp-accent)]"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 13c1.4 2.6 3 4 5 4s3.6-1.4 5-4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

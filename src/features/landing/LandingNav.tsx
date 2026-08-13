/**
 * Sticky top navigation. Transparent over the hero, then materialises into a
 * translucent bar once the page scrolls — driven by a plain scroll listener so
 * it behaves identically with GSAP/Lenis absent or under reduced motion.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/app/AuthProvider'
import { scrollToAnchor } from './smoothScroll'

const LINKS = [
  { id: 'services', label: 'Services' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'stories', label: 'Patient stories' },
  { id: 'visit', label: 'Visit' },
  { id: 'book', label: 'Book' },
] as const

export function LandingNav({ wordmark }: { wordmark: string }) {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile sheet on escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    scrollToAnchor(id)
  }

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-[var(--z-index-sticky)] transition-[background-color,border-color,box-shadow,backdrop-filter] duration-base ease-out-quint',
        scrolled
          ? 'border-b border-border bg-surface/80 shadow-sm backdrop-blur-xl backdrop-saturate-150'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-[var(--nav-h)] max-w-content items-center justify-between gap-4 px-5 sm:px-8"
      >
        {/* Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="flex items-center gap-2.5 rounded-sm font-semibold tracking-tight"
        >
          <Monogram />
          <span className="text-heading text-text">{wordmark}</span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => go(l.id)}
              className="text-label text-text-muted hover:text-text hover:bg-surface-hover rounded-sm px-3 py-2 font-medium transition-colors duration-fast"
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="text-label text-text-muted hover:text-text hidden rounded-sm px-3 py-2 font-medium transition-colors duration-fast sm:inline-flex"
            >
              Enter dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-label text-text-muted hover:text-text hidden rounded-sm px-3 py-2 font-medium transition-colors duration-fast sm:inline-flex"
            >
              Staff sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => go('book')}
            className="bg-accent text-accent-fg hover:bg-accent-hover text-label hidden h-control items-center gap-1.5 rounded-sm px-4 font-semibold shadow-sm transition-[background-color,box-shadow] duration-fast sm:inline-flex"
          >
            Book appointment
            <ArrowRight aria-hidden className="size-4" />
          </button>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="border-border text-text hover:bg-surface-hover grid size-control place-items-center rounded-sm border bg-surface/60 transition-colors duration-fast lg:hidden"
          >
            {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      <div
        id="landing-mobile-menu"
        hidden={!open}
        className="border-b border-border bg-surface/95 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-content flex-col gap-1 px-5 py-4 sm:px-8">
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => go(l.id)}
              className="text-body text-text hover:bg-surface-hover rounded-sm px-3 py-3 text-left font-medium transition-colors duration-fast"
            >
              {l.label}
            </button>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => go('book')}
              className="bg-accent text-accent-fg hover:bg-accent-hover text-label inline-flex h-control-lg items-center justify-center gap-2 rounded-sm font-semibold"
            >
              Book appointment
              <ArrowRight aria-hidden className="size-4" />
            </button>
            <Link
              to={isAuthenticated ? '/app' : '/login'}
              onClick={() => setOpen(false)}
              className="border-border text-text hover:bg-surface-hover text-label inline-flex h-control-lg items-center justify-center rounded-sm border font-medium"
            >
              {isAuthenticated ? 'Enter dashboard' : 'Staff sign in'}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

/** A tiny authored brand mark: a cross set in a ring. Not an illustration. */
function Monogram() {
  return (
    <span
      aria-hidden
      className="border-accent text-accent grid size-8 place-items-center rounded-md border-[1.5px]"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    </span>
  )
}

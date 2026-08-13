/**
 * Footer — the dark base of the landing page.
 *
 * A serif wordmark with a teal cross monogram, the clinic tagline, in-page
 * navigation (the same smooth-scroll targets used across the page), a contact
 * column, and the one quiet door back to the product: a real router `Link` to
 * the staff sign-in. Everything reads from the public clinic settings with
 * calm fallbacks, so the footer is never blank.
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ScrollButton } from '@/features/landing/primitives'
import { usePublicClinic } from '@/features/public/usePublicData'

const NAV_LINKS: { target: string; label: string }[] = [
  { target: 'services', label: 'Services' },
  { target: 'doctor', label: 'Doctor' },
  { target: 'visit', label: 'Visit' },
  { target: 'book', label: 'Book' },
]

export function LandingFooter() {
  const clinic = usePublicClinic()
  const clinicName = clinic.data?.clinic_name ?? 'OrthoClinic'
  const tagline =
    clinic.data?.tagline ?? 'Precise orthopaedic care that gives you back your range of movement.'
  const address = [clinic.data?.address, clinic.data?.city].filter(Boolean).join(', ')

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-5 py-14 sm:px-8 md:flex-row md:items-start md:justify-between">
        {/* Wordmark + tagline */}
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-md border-[1.5px] border-[color:var(--lp-accent-line)] text-[color:var(--lp-accent)]"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
            <span className="lp-serif text-2xl leading-none text-text">{clinicName}</span>
          </div>
          <p className="mt-4 text-body leading-relaxed text-text-muted">{tagline}</p>
        </div>

        {/* In-page navigation */}
        <nav aria-label="Footer" className="flex flex-col items-start gap-1">
          {NAV_LINKS.map((link) => (
            <ScrollButton
              key={link.target}
              target={link.target}
              tone="ghost"
              size="md"
              className="h-auto justify-start px-0 font-medium text-text-muted hover:bg-transparent hover:text-text"
            >
              {link.label}
            </ScrollButton>
          ))}
        </nav>

        {/* Contact + the one door back to the product */}
        <div className="flex flex-col gap-2 text-body text-text-muted">
          {clinic.data?.phone && (
            <a
              href={`tel:${clinic.data.phone.replace(/\s+/g, '')}`}
              className="transition-colors duration-fast hover:text-text"
            >
              {clinic.data.phone}
            </a>
          )}
          {clinic.data?.email && (
            <a
              href={`mailto:${clinic.data.email}`}
              className="transition-colors duration-fast hover:text-text"
            >
              {clinic.data.email}
            </a>
          )}
          {address && <span>{address}</span>}
          <Link
            to="/login"
            className="mt-2 inline-flex w-fit items-center gap-1.5 text-label font-medium text-text-subtle transition-colors duration-fast hover:text-text"
          >
            Staff sign in
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <p className="mx-auto max-w-content px-5 py-5 text-caption text-text-subtle sm:px-8">
          © {clinicName}. For emergencies, call your nearest hospital.
        </p>
      </div>
    </footer>
  )
}

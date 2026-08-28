import { useEffect, useId, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Mail, MapPin, Menu, Phone, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ClinicSettingsResponse, DoctorProfileResponse } from '@/api/schema'
import { ButtonLink, Container, Eyebrow } from './Parts'
import { text } from './content'
import { BOOK_PATH, SITE_NAV, SITE_ROOT } from './routes'

function brandMark(name: string): string {
  const first = name.trim()[0]
  return first ? first.toUpperCase() : 'C'
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                    */
/* -------------------------------------------------------------------------- */

export function SiteHeader({ clinic }: { clinic: ClinicSettingsResponse | undefined }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const menuId = useId()

  // A tap on a nav link must always dismiss the panel, including when it links
  // to the page we are already on.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const name = clinic?.clinic_name ?? ''

  return (
    <header className="border-border bg-bg/85 sticky top-0 z-[var(--z-sticky)] border-b backdrop-blur-lg backdrop-saturate-150">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            to={SITE_ROOT}
            className="group focus-visible:outline-focus flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <span
              aria-hidden
              className="bg-accent text-body text-accent-fg grid size-9 shrink-0 place-items-center rounded-lg font-bold shadow-sm"
            >
              {name ? brandMark(name) : ''}
            </span>
            <span className="min-w-0">
              <span className="text-body text-text block truncate font-semibold tracking-tight">
                {name || ' '}
              </span>
              {text(clinic?.tagline) && (
                <span className="text-caption text-text-muted hidden truncate font-normal sm:block">
                  {clinic?.tagline}
                </span>
              )}
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {SITE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'text-label duration-fast ease-standard rounded-md px-3 py-2 font-medium transition-colors',
                    isActive
                      ? 'bg-surface-hover text-text'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Booking is the point of the site, so the call to action stays
                on screen at every width — only its label shortens. */}
            <ButtonLink to={BOOK_PATH} tone="primary" size="md">
              <span className="sm:hidden">Book</span>
              <span className="hidden sm:inline">Book an appointment</span>
            </ButtonLink>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={menuId}
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((value) => !value)}
              className="text-text-muted duration-fast hover:bg-surface-hover hover:text-text grid size-10 place-items-center rounded-md transition-colors lg:hidden"
            >
              {open ? (
                <X aria-hidden className="size-5" />
              ) : (
                <Menu aria-hidden className="size-5" />
              )}
            </button>
          </div>
        </div>
      </Container>

      <div id={menuId} hidden={!open} className="border-border bg-surface border-t lg:hidden">
        <Container className="py-3">
          <nav aria-label="Primary, mobile" className="flex flex-col">
            {SITE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'text-body duration-fast rounded-md px-3 py-3 font-medium transition-colors',
                    isActive ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </Container>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*  Footer                                                                    */
/* -------------------------------------------------------------------------- */

export function SiteFooter({
  clinic,
  doctor,
}: {
  clinic: ClinicSettingsResponse | undefined
  doctor: DoctorProfileResponse | undefined
}) {
  const addressLine = [text(clinic?.address), text(clinic?.city), text(clinic?.postal_code)]
    .filter(Boolean)
    .join(', ')
  const phone = text(clinic?.phone)
  const altPhone = text(clinic?.alternate_phone)
  const email = text(clinic?.email)
  const footerText = text(clinic?.footer_text)
  const registration = text(clinic?.registration_number)

  return (
    <footer className="border-border bg-surface mt-auto border-t">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="flex flex-col gap-3">
            <Eyebrow>{clinic?.clinic_name ?? ''}</Eyebrow>
            {text(clinic?.tagline) && (
              <p className="text-body text-text-muted max-w-xs">{clinic?.tagline}</p>
            )}
            {doctor?.full_name && (
              <p className="text-body text-text-muted">
                Consultations with <span className="text-text font-medium">{doctor.full_name}</span>
                {text(doctor.specialization) ? `, ${doctor.specialization}` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-label text-text font-semibold">Visit or call</h2>
            {addressLine && (
              <p className="text-body text-text-muted flex items-start gap-2">
                <MapPin aria-hidden className="text-text-subtle mt-0.5 size-4 shrink-0" />
                <span>{addressLine}</span>
              </p>
            )}
            {phone && (
              <p className="text-body flex items-center gap-2">
                <Phone aria-hidden className="text-text-subtle size-4 shrink-0" />
                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  className="text-text-muted hover:text-accent rounded-sm underline-offset-4 hover:underline"
                >
                  {phone}
                </a>
                {altPhone && (
                  <>
                    <span aria-hidden className="text-text-subtle">
                      ·
                    </span>
                    <a
                      href={`tel:${altPhone.replace(/\s+/g, '')}`}
                      className="text-text-muted hover:text-accent rounded-sm underline-offset-4 hover:underline"
                    >
                      {altPhone}
                    </a>
                  </>
                )}
              </p>
            )}
            {email && (
              <p className="text-body flex items-center gap-2">
                <Mail aria-hidden className="text-text-subtle size-4 shrink-0" />
                <a
                  href={`mailto:${email}`}
                  className="text-text-muted hover:text-accent rounded-sm break-all underline-offset-4 hover:underline"
                >
                  {email}
                </a>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-label text-text font-semibold">Explore</h2>
            <ul className="flex flex-col gap-2">
              {SITE_NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="text-body text-text-muted hover:text-accent rounded-sm underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to={BOOK_PATH}
                  className="text-body text-accent rounded-sm font-medium underline-offset-4 hover:underline"
                >
                  Book an appointment
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {footerText && (
          <p className="text-caption text-text-subtle mt-10 max-w-prose">{footerText}</p>
        )}

        <div className="border-border text-caption text-text-subtle mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {clinic?.clinic_name ?? ''}
            {registration ? ` · Reg. ${registration}` : ''}
          </p>
        </div>
      </Container>
    </footer>
  )
}

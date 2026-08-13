/**
 * Visit — where the clinic is, and when it is open.
 *
 * Two columns: contact details on the left (address, phone, email straight from
 * the public clinic settings, each behind a real `tel:` / `mailto:` / maps
 * link), and a full seven-day opening-hours card on the right built from the
 * public availability rows. Closed days are shown, not hidden, so "Sunday:
 * Closed" is real information. Every fact comes from the CMS; nothing is
 * invented, and empty data degrades to a sensible fallback line.
 *
 * MOTION CONTRACT (see landing.css): nothing here carries an `opacity: 0`
 * baseline. Each column's `data-reveal` is animated by the PAGE-level GSAP,
 * only inside the `(prefers-reduced-motion: no-preference)` branch — so with
 * reduced motion, or if JS never runs, both columns paint in their final state.
 */
import { Clock, Mail, MapPin, Phone, type LucideIcon } from 'lucide-react'
import { DAYS_OF_WEEK } from '@/api/schema'
import type { ClinicSettingsResponse, DayOfWeek, WeeklyAvailabilityResponse } from '@/api/schema'
import { DAY_LABEL } from '@/features/public/content'
import { usePublicAvailability, usePublicClinic } from '@/features/public/usePublicData'

export function VisitSection() {
  const clinic = usePublicClinic()
  const availability = usePublicAvailability()

  const hours = groupHours(availability.data ?? [])
  const rows = contactRows(clinic.data)

  return (
    <section id="visit" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
      <div className="mx-auto grid max-w-content gap-10 px-5 sm:px-8 lg:grid-cols-2">
        {/* Contact ------------------------------------------------------ */}
        <div data-reveal>
          <h2 className="lp-h2 max-w-[14ch]">Come and see us.</h2>
          <ul className="mt-9 space-y-4">
            {rows.map((row) => (
              <li key={row.label} className="flex items-start gap-3.5">
                <row.icon
                  aria-hidden
                  strokeWidth={1.5}
                  className="mt-0.5 size-5 shrink-0 text-[color:var(--lp-accent)]"
                />
                <div>
                  <div className="text-caption text-text-subtle">{row.label}</div>
                  {row.href ? (
                    <a
                      href={row.href}
                      {...(row.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="text-body text-text underline-offset-4 transition-colors duration-fast hover:text-[color:var(--lp-accent)] hover:underline"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <div className="text-body text-text">{row.value}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Opening hours ----------------------------------------------- */}
        <div data-reveal className="rounded-2xl border border-border bg-surface/60 p-6 sm:p-8">
          <h3 className="mb-4 flex items-center gap-2 text-label font-semibold text-text-muted">
            <Clock aria-hidden strokeWidth={1.5} className="size-4 text-[color:var(--lp-accent)]" />
            Opening hours
          </h3>
          <dl className="divide-y divide-border">
            {DAYS_OF_WEEK.map((day) => {
              const value = hours[day]
              return (
                <div key={day} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-body text-text">{DAY_LABEL[day]}</dt>
                  <dd
                    className={
                      'text-body tabular-nums ' + (value ? 'text-text' : 'text-text-subtle')
                    }
                  >
                    {value ?? 'Closed'}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface ContactRow {
  icon: LucideIcon
  label: string
  value: string
  href?: string
  external?: boolean
}

function contactRows(clinic: ClinicSettingsResponse | undefined): ContactRow[] {
  const rows: ContactRow[] = []

  const address = [clinic?.address, clinic?.city, clinic?.postal_code].filter(Boolean).join(', ')
  if (address) {
    rows.push({
      icon: MapPin,
      label: 'Address',
      value: address,
      href: clinic?.google_maps_url ?? undefined,
      external: Boolean(clinic?.google_maps_url),
    })
  }
  if (clinic?.phone) {
    rows.push({
      icon: Phone,
      label: 'Phone',
      value: clinic.phone,
      href: `tel:${clinic.phone.replace(/\s+/g, '')}`,
    })
  }
  if (clinic?.email) {
    rows.push({ icon: Mail, label: 'Email', value: clinic.email, href: `mailto:${clinic.email}` })
  }
  if (rows.length === 0) {
    rows.push({
      icon: Phone,
      label: 'Contact',
      value: 'Call the clinic to book or to ask a question.',
    })
  }
  return rows
}

/** Group active availability rows into one label per day, e.g. `9:00 am - 5:00 pm`. */
function groupHours(rows: WeeklyAvailabilityResponse[]): Partial<Record<DayOfWeek, string>> {
  const out: Partial<Record<DayOfWeek, string>> = {}
  for (const row of rows) {
    if (!row.is_active) continue
    const span = `${formatClock(row.start_time)} - ${formatClock(row.end_time)}`
    out[row.day_of_week] = out[row.day_of_week] ? `${out[row.day_of_week]}, ${span}` : span
  }
  return out
}

/** `09:00:00` -> `9:00 am`. Tolerates a missing seconds field. */
function formatClock(value: string): string {
  const [rawHour, minute] = value.split(':')
  const hour = Number(rawHour)
  if (Number.isNaN(hour)) return value
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${minute ?? '00'} ${suffix}`
}

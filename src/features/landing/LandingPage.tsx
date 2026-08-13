/**
 * OrthoClinic — public landing page (the front door at `/`).
 *
 * Design language: clinical petrol accent locked page-wide, editorial system
 * type, an anatomical knee/range-of-motion motif, restrained motion. Real
 * clinic content comes from the public CMS hooks; nothing here needs a session.
 *
 * MOTION CONTRACT (see landing.css): no element carries an `opacity: 0`
 * baseline. Reveals are applied by GSAP at runtime and ONLY inside the
 * `(prefers-reduced-motion: no-preference)` branch — so with reduced motion, or
 * if JS never runs, the whole page paints in its final, legible state.
 */
import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { ArrowRight, Clock, Mail, MapPin, Phone, Quote } from 'lucide-react'
import { resolveApiUrl } from '@/api/http'
import { DAY_LABEL, sortedServices, sortedTestimonials } from '@/features/public/content'
import {
  usePublicClinic,
  usePublicDoctor,
  usePublicPortfolio,
  usePublicAvailability,
} from '@/features/public/usePublicData'
import type { DayOfWeek, WeeklyAvailabilityResponse } from '@/api/schema'
import { LandingNav } from './LandingNav'
import { HeroBackdrop } from './HeroBackdrop'
import { ScrollButton, ServiceIcon, StarRating } from './primitives'
import { setActiveLenis } from './smoothScroll'
import { BookingSection } from './BookingSection'
import './landing.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const DAY_ORDER: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

/** The three things an orthopaedic practice actually does, in the doctor's terms. */
const PILLARS = [
  { term: 'Diagnose', detail: 'Precise assessment: imaging, examination, a clear picture before anything else.' },
  { term: 'Treat', detail: 'From conservative care to surgery, matched to the joint and the person.' },
  { term: 'Restore', detail: 'Rehabilitation that returns real, lasting range of movement.' },
]

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null)

  const clinic = usePublicClinic()
  const doctor = usePublicDoctor()
  const portfolio = usePublicPortfolio()
  const availability = usePublicAvailability()

  const clinicName = clinic.data?.clinic_name ?? 'OrthoClinic'
  const tagline =
    clinic.data?.tagline ?? 'Precise orthopaedic care that gives you back your range of movement.'
  const services = sortedServices(portfolio.data?.services)
  const testimonials = sortedTestimonials(portfolio.data?.testimonials)
  const gallery = (portfolio.data?.gallery ?? []).filter((g) => g.is_published)
  const hours = groupHours(availability.data)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
        setActiveLenis(lenis)
        lenis.on('scroll', ScrollTrigger.update)
        const raf = (time: number) => lenis.raf(time * 1000)
        gsap.ticker.add(raf)
        gsap.ticker.lagSmoothing(0)

        gsap.from('[data-hero-word]', {
          yPercent: 120,
          duration: 1,
          ease: 'expo.out',
          stagger: 0.09,
          delay: 0.1,
        })
        gsap.from('[data-hero-fade]', {
          y: 18,
          autoAlpha: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.1,
          delay: 0.45,
        })

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: 32,
            autoAlpha: 0,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          })
        })

        gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
          gsap.from(group.querySelectorAll('[data-reveal-item]'), {
            y: 26,
            autoAlpha: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.09,
            scrollTrigger: { trigger: group, start: 'top 82%', once: true },
          })
        })

        gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
          const target = Number(el.dataset.count ?? '0')
          const suffix = el.dataset.suffix ?? ''
          const proxy = { v: 0 }
          gsap.to(proxy, {
            v: target,
            duration: 1.5,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
            onUpdate: () => {
              el.textContent = `${Math.round(proxy.v)}${suffix}`
            },
          })
        })

        return () => {
          gsap.ticker.remove(raf)
          lenis.destroy()
          setActiveLenis(null)
          ScrollTrigger.getAll().forEach((t) => t.kill())
        }
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <div ref={root} className="landing-root min-h-dvh" id="top">
      <LandingNav wordmark={clinicName} />

      <main>
        {/* ---- Hero (asymmetric split, anatomical motif) --------------- */}
        <section
          className="relative isolate flex min-h-dvh items-center overflow-hidden pt-[var(--nav-h)]"
          aria-label="Introduction"
        >
          <div aria-hidden className="hero-backdrop">
            <div className="hero-grid" />
            <HeroBackdrop />
          </div>

          <div className="mx-auto grid w-full max-w-content items-center gap-8 px-5 pt-16 pb-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p data-hero-fade className="lp-kicker mb-6">
                {doctor.data?.specialization ?? 'Orthopaedic surgery'}
              </p>
              <h1 className="lp-display max-w-[15ch]">
                <HeroHeadline text="Move without limits." />
              </h1>
              <p data-hero-fade className="lp-lead mt-6 max-w-[46ch]">
                {tagline}
              </p>
              <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-3">
                <ScrollButton target="book" tone="primary" size="lg" magnetic>
                  Book an appointment
                  <ArrowRight aria-hidden className="size-4" />
                </ScrollButton>
                <ScrollButton target="services" tone="secondary" size="lg">
                  See what we treat
                </ScrollButton>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Trust stats (hairline tick strip, count-up) ------------- */}
        <section className="border-y border-border" aria-label="At a glance">
          <div
            data-reveal-group
            className="lp-ticks mx-auto grid max-w-content grid-cols-2 max-[400px]:grid-cols-1 lg:grid-cols-4"
          >
            <Stat value={doctor.data?.experience_years ?? 15} suffix="+" label="Years in practice" />
            <Stat value={services.length || 8} suffix="" label="Procedures offered" />
            <Stat value={testimonials.length || 20} suffix="+" label="Patients cared for" />
            <Stat value={96} suffix="%" label="Would recommend" />
          </div>
        </section>

        {/* ---- Services (bento: featured + grid) ----------------------- */}
        <section id="services" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <h2 data-reveal className="lp-h2 mb-12 max-w-[18ch]">
              Care for every joint, at every stage.
            </h2>

            {services.length === 0 ? (
              <p className="border-border text-body text-text-muted rounded-2xl border border-dashed px-6 py-12 text-center">
                Treatment details are being added. Call the clinic and we will guide you.
              </p>
            ) : (
              <div
                data-reveal-group
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {services.map((s, i) => (
                  <article
                    key={s.id}
                    data-reveal-item
                    className={
                      'group border-border bg-surface/60 hover:bg-surface hover:border-border-strong flex flex-col rounded-2xl border p-6 transition-colors duration-base sm:p-7 ' +
                      (i === 0 ? 'lg:col-span-2 lg:flex-row lg:items-center lg:gap-8' : '')
                    }
                  >
                    <span className="mb-5 grid size-12 shrink-0 place-items-center rounded-xl bg-[color:var(--lp-accent-tint)] text-[color:var(--lp-accent)] lg:mb-0">
                      <ServiceIcon name={s.icon_name} className="size-6" />
                    </span>
                    <div>
                      <h3 className="text-heading text-text font-semibold tracking-tight">
                        {s.title}
                      </h3>
                      {s.description && (
                        <p className="text-body text-text-muted mt-2 leading-relaxed">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---- Movement band (full-width, tinted, non-card pillars) ---- */}
        <section
          aria-label="Our approach"
          className="border-y border-[color:var(--lp-accent-line)] bg-[color:var(--lp-accent-tint)]"
        >
          <div className="mx-auto max-w-content px-5 py-[var(--section-pad)] sm:px-8">
            <div data-reveal className="max-w-[28ch]">
              <p className="lp-kicker mb-5">How movement is restored</p>
              <h2 className="lp-h2">Every joint tells a story. We read it carefully.</h2>
            </div>
            <div
              data-reveal-group
              className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-3"
            >
              {PILLARS.map((p) => (
                <div
                  key={p.term}
                  data-reveal-item
                  className="border-t-2 border-[color:var(--lp-accent)] pt-5"
                >
                  <h3 className="text-title text-text font-semibold tracking-tight">{p.term}</h3>
                  <p className="text-body text-text-muted mt-3 max-w-[34ch] leading-relaxed">
                    {p.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Doctor (split) ----------------------------------------- */}
        <section id="doctor" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
          <div className="mx-auto grid max-w-content items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div data-reveal className="order-2 lg:order-1">
              <h2 className="lp-h2">
                {doctor.data?.full_name ?? 'Consultant Orthopaedic Surgeon'}
              </h2>
              {doctor.data?.qualifications && (
                <p className="text-body text-[color:var(--lp-accent)] mt-3 font-medium">
                  {doctor.data.qualifications}
                </p>
              )}
              <p className="lp-lead mt-6 max-w-[52ch]">
                {doctor.data?.bio ??
                  'A registered orthopaedic surgeon focused on restoring movement, from sports injuries and fractures to joint replacement and long-term joint care.'}
              </p>

              <dl className="mt-9 grid grid-cols-2 gap-x-8 gap-y-6 sm:max-w-md">
                {doctor.data?.experience_years != null && (
                  <Fact term="Experience" detail={`${doctor.data.experience_years}+ years`} />
                )}
                {doctor.data?.registration_number && (
                  <Fact term="Registration" detail={doctor.data.registration_number} />
                )}
                {doctor.data?.specialization && (
                  <Fact term="Focus" detail={doctor.data.specialization} />
                )}
              </dl>

              <div className="mt-9">
                <ScrollButton target="book" tone="primary" size="lg" magnetic>
                  Consult {shortName(doctor.data?.full_name)}
                  <ArrowRight aria-hidden className="size-4" />
                </ScrollButton>
              </div>
            </div>

            <div data-reveal className="order-1 lg:order-2">
              <DoctorPortrait
                name={doctor.data?.full_name ?? clinicName}
                photoUrl={doctor.data?.photo_url ?? null}
              />
            </div>
          </div>
        </section>

        {/* ---- Patient stories (quote grid) --------------------------- */}
        {testimonials.length > 0 && (
          <section id="stories" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
            <div className="mx-auto max-w-content px-5 sm:px-8">
              <h2 data-reveal className="lp-h2 mb-12 max-w-[16ch]">
                Movement, given back.
              </h2>
              <div
                data-reveal-group
                className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
              >
                {testimonials.slice(0, 6).map((t) => (
                  <figure
                    key={t.id}
                    data-reveal-item
                    className="border-border bg-surface/60 flex flex-col rounded-2xl border p-6"
                  >
                    <Quote aria-hidden className="size-7 text-[color:var(--lp-accent)] opacity-50" />
                    <blockquote className="text-body text-text mt-3 line-clamp-4 flex-1 leading-relaxed text-pretty">
                      {t.content}
                    </blockquote>
                    <figcaption className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                      <div>
                        <div className="text-label text-text font-semibold">{t.author_name}</div>
                        {t.author_role && (
                          <div className="text-caption text-text-subtle">{t.author_role}</div>
                        )}
                      </div>
                      <StarRating rating={t.rating} />
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---- Gallery ------------------------------------------------- */}
        {gallery.length > 0 && (
          <section id="gallery" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
            <div className="mx-auto max-w-content px-5 sm:px-8">
              <h2 data-reveal className="lp-h2 mb-10 max-w-[16ch]">
                Inside the clinic.
              </h2>
              <div
                data-reveal-group
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                {gallery.slice(0, 8).map((img, i) => (
                  <figure
                    key={img.id}
                    data-reveal-item
                    className={
                      'lp-plate overflow-hidden rounded-xl ' +
                      (i === 0 ? 'col-span-2 row-span-2' : 'aspect-square')
                    }
                  >
                    <img
                      src={resolveApiUrl(img.image_url)}
                      alt={img.alt_text ?? img.caption ?? 'Clinic photograph'}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---- Visit (2-col: contact + hours) ------------------------- */}
        <section id="visit" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
          <div className="mx-auto grid max-w-content gap-10 px-5 sm:px-8 lg:grid-cols-2">
            <div data-reveal>
              <h2 className="lp-h2 max-w-[14ch]">Come and see us.</h2>
              <ul className="mt-9 space-y-4">
                {contactRows(clinic.data).map((row) => (
                  <li key={row.label} className="flex items-start gap-3.5">
                    <row.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-[color:var(--lp-accent)]" />
                    <div>
                      <div className="text-caption text-text-subtle">{row.label}</div>
                      <div className="text-body text-text">{row.value}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div data-reveal className="border-border bg-surface/60 rounded-2xl border p-6 sm:p-8">
              <h3 className="text-label text-text-muted mb-4 flex items-center gap-2 font-semibold">
                <Clock aria-hidden className="size-4 text-[color:var(--lp-accent)]" /> Opening hours
              </h3>
              <dl className="divide-border divide-y">
                {DAY_ORDER.map((day) => (
                  <div key={day} className="flex items-center justify-between py-2.5">
                    <dt className="text-body text-text">{DAY_LABEL[day]}</dt>
                    <dd
                      className={
                        'text-body tabular-nums ' + (hours[day] ? 'text-text' : 'text-text-subtle')
                      }
                    >
                      {hours[day] ?? 'Closed'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ---- Booking (owned by the booking module) ------------------ */}
        <div data-reveal className="scroll-mt-[var(--nav-h)]">
          <BookingSection />
        </div>
      </main>

      {/* ---- Footer --------------------------------------------------- */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="text-heading text-text flex items-center gap-2.5 font-semibold">
              <span className="grid size-8 place-items-center rounded-md border-[1.5px] border-[color:var(--lp-accent-line)] text-[color:var(--lp-accent)]">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </span>
              {clinicName}
            </div>
            <p className="text-body text-text-muted mt-3 leading-relaxed">{tagline}</p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-2">
            <FooterLink target="services">Services</FooterLink>
            <FooterLink target="doctor">Doctor</FooterLink>
            <FooterLink target="visit">Visit us</FooterLink>
            <FooterLink target="book">Book an appointment</FooterLink>
          </nav>

          <div className="text-body text-text-muted flex flex-col gap-2">
            {clinic.data?.phone && <span>{clinic.data.phone}</span>}
            {clinic.data?.email && <span>{clinic.data.email}</span>}
            <Link
              to="/login"
              className="text-label text-text-subtle hover:text-text mt-2 inline-flex w-fit items-center gap-1.5 font-medium transition-colors duration-fast"
            >
              Staff sign in <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="text-caption text-text-subtle mx-auto max-w-content px-5 py-5 sm:px-8">
            © {clinicName}. For emergencies, call your nearest hospital.
          </p>
        </div>
      </footer>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Hero headline — words in clips for the slide-up reveal                    */
/* -------------------------------------------------------------------------- */

function HeroHeadline({ text }: { text: string }) {
  const words = useMemo(() => text.split(' '), [text])
  return (
    <>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="hero-line">
          <span data-hero-word className="hero-word">
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  return (
    <div data-reveal-item className="px-5 py-9 text-center sm:py-11">
      <div
        data-count={value}
        data-suffix={suffix}
        data-numeric
        className="lp-numeral text-display text-text font-semibold"
      >
        {value}
        {suffix}
      </div>
      <div className="text-caption text-text-subtle mt-1.5">{label}</div>
    </div>
  )
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-caption text-text-subtle">{term}</dt>
      <dd className="text-body text-text mt-0.5 font-medium">{detail}</dd>
    </div>
  )
}

function FooterLink({ target, children }: { target: string; children: React.ReactNode }) {
  return (
    <ScrollButton
      target={target}
      tone="ghost"
      size="md"
      className="text-text-muted hover:text-text h-auto justify-start px-0 font-medium hover:bg-transparent"
    >
      {children}
    </ScrollButton>
  )
}

function DoctorPortrait({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="border-border bg-surface relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl border">
      {photoUrl ? (
        <img
          src={resolveApiUrl(photoUrl)}
          alt={name}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="lp-plate grid size-full place-items-center">
          <span className="lp-numeral text-display font-semibold text-[color:var(--lp-accent)] opacity-80">
            {initials || 'Rx'}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-3 rounded-2xl border border-[color:var(--lp-accent-line)]" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Data shaping                                                              */
/* -------------------------------------------------------------------------- */

function groupHours(
  rows: WeeklyAvailabilityResponse[] | undefined,
): Partial<Record<DayOfWeek, string>> {
  const out: Partial<Record<DayOfWeek, string>> = {}
  for (const row of rows ?? []) {
    if (!row.is_active) continue
    const span = `${formatTime(row.start_time)} - ${formatTime(row.end_time)}`
    out[row.day_of_week] = out[row.day_of_week] ? `${out[row.day_of_week]}, ${span}` : span
  }
  return out
}

function formatTime(value: string): string {
  const [h, m] = value.split(':')
  const hour = Number(h)
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${m ?? '00'} ${suffix}`
}

function contactRows(
  clinic: ReturnType<typeof usePublicClinic>['data'] | undefined,
): { icon: typeof MapPin; label: string; value: string }[] {
  const rows: { icon: typeof MapPin; label: string; value: string }[] = []
  const address = [clinic?.address, clinic?.city, clinic?.postal_code].filter(Boolean).join(', ')
  if (address) rows.push({ icon: MapPin, label: 'Address', value: address })
  if (clinic?.phone) rows.push({ icon: Phone, label: 'Phone', value: clinic.phone })
  if (clinic?.email) rows.push({ icon: Mail, label: 'Email', value: clinic.email })
  if (rows.length === 0) {
    rows.push({ icon: Phone, label: 'Contact', value: 'Call the clinic to book or ask a question.' })
  }
  return rows
}

function shortName(name: string | null | undefined): string {
  if (!name) return 'the doctor'
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name.split(/\s+/).slice(-1)[0]}`
}

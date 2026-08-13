/**
 * OrthoClinic — public landing page (the front door at `/`).
 *
 * One page, top to bottom: nav → hero → trust stats → services → doctor →
 * patient stories → gallery → visit → booking → footer. Real clinic content
 * comes from the public CMS hooks; nothing here needs a session.
 *
 * MOTION CONTRACT (see landing.css): no element carries an `opacity: 0`
 * baseline. Every reveal is applied by GSAP at runtime and ONLY inside the
 * `(prefers-reduced-motion: no-preference)` branch — so with reduced motion, or
 * if JS never runs, the whole page is painted in its final, legible state.
 */
import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import {
  ArrowRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Quote,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import { cn } from '@/lib/cn'
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

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null)

  const clinic = usePublicClinic()
  const doctor = usePublicDoctor()
  const portfolio = usePublicPortfolio()
  const availability = usePublicAvailability()

  const clinicName = clinic.data?.clinic_name ?? 'OrthoClinic'
  const tagline = clinic.data?.tagline ?? 'Expert orthopaedic care, for every stage of life.'
  const services = sortedServices(portfolio.data?.services)
  const testimonials = sortedTestimonials(portfolio.data?.testimonials)
  const gallery = (portfolio.data?.gallery ?? []).filter((g) => g.is_published)
  const hours = groupHours(availability.data)

  /* ---- Motion. Everything lives inside the no-preference branch. --------- */
  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Lenis drives GSAP's ticker so ScrollTrigger and smooth scroll agree.
        const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
        setActiveLenis(lenis)
        lenis.on('scroll', ScrollTrigger.update)
        const raf = (time: number) => lenis.raf(time * 1000)
        gsap.ticker.add(raf)
        gsap.ticker.lagSmoothing(0)

        // Hero headline — words slide up out of their clip.
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
          delay: 0.5,
        })

        // Generic scroll reveals.
        const reveals = gsap.utils.toArray<HTMLElement>('[data-reveal]')
        reveals.forEach((el) => {
          gsap.from(el, {
            y: 30,
            autoAlpha: 0,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          })
        })

        // Staggered groups (cards).
        const groups = gsap.utils.toArray<HTMLElement>('[data-reveal-group]')
        groups.forEach((group) => {
          gsap.from(group.querySelectorAll('[data-reveal-item]'), {
            y: 26,
            autoAlpha: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.08,
            scrollTrigger: { trigger: group, start: 'top 82%', once: true },
          })
        })

        // Count-up on the stat figures.
        const stats = gsap.utils.toArray<HTMLElement>('[data-count]')
        stats.forEach((el) => {
          const target = Number(el.dataset.count ?? '0')
          const suffix = el.dataset.suffix ?? ''
          const proxy = { v: 0 }
          gsap.to(proxy, {
            v: target,
            duration: 1.4,
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
        {/* ---- Hero ---------------------------------------------------- */}
        <section
          className="relative isolate flex min-h-dvh items-center overflow-hidden pt-[var(--nav-h)]"
          aria-label="Introduction"
        >
          <div aria-hidden className="hero-backdrop">
            <div className="hero-grid" />
            <HeroBackdrop />
          </div>

          <div className="mx-auto w-full max-w-content px-5 py-20 sm:px-8">
            <p
              data-hero-fade
              className="text-label text-accent mb-6 inline-flex items-center gap-2 font-semibold tracking-wide uppercase"
            >
              <Sparkles aria-hidden className="size-4" />
              {doctor.data?.specialization ?? 'Orthopaedic surgery'}
            </p>

            <h1 className="text-display max-w-4xl font-semibold tracking-tight text-balance">
              <HeroHeadline text={`Move without limits at ${clinicName}.`} />
            </h1>

            <p
              data-hero-fade
              className="text-title text-text-muted mt-6 max-w-2xl text-pretty"
            >
              {tagline}
            </p>

            <div data-hero-fade className="mt-10 flex flex-wrap items-center gap-3">
              <ScrollButton target="book" tone="primary" size="lg" magnetic>
                Book an appointment
                <ArrowRight aria-hidden className="size-4" />
              </ScrollButton>
              <ScrollButton target="services" tone="secondary" size="lg">
                Explore treatments
              </ScrollButton>
            </div>

            <p
              data-hero-fade
              className="text-caption text-text-subtle mt-8 inline-flex items-center gap-2"
            >
              <ShieldCheck aria-hidden className="text-success size-4" />
              Trusted care from a registered specialist
            </p>
          </div>
        </section>

        {/* ---- Trust stats -------------------------------------------- */}
        <section className="border-y border-border bg-surface/40" aria-label="At a glance">
          <div
            data-reveal-group
            className="mx-auto grid max-w-content grid-cols-2 gap-px px-5 sm:px-8 lg:grid-cols-4"
          >
            <Stat value={doctor.data?.experience_years ?? 15} suffix="+" label="Years of practice" />
            <Stat value={services.length || 8} suffix="" label="Treatments offered" />
            <Stat value={testimonials.length || 20} suffix="+" label="Patient stories" />
            <Stat value={98} suffix="%" label="Would recommend" />
          </div>
        </section>

        {/* ---- Services ----------------------------------------------- */}
        <Section id="services" eyebrow="What we treat" title="Care for every joint and stage">
          {services.length === 0 ? (
            <EmptyNote>Treatment details are being added. Call us and we will guide you.</EmptyNote>
          ) : (
            <div
              data-reveal-group
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {services.map((s) => (
                <article
                  key={s.id}
                  data-reveal-item
                  className="group border-border bg-surface hover:border-border-strong rounded-xl border p-6 transition-colors duration-base"
                >
                  <span className="bg-accent-muted text-accent mb-5 grid size-12 place-items-center rounded-lg">
                    <ServiceIcon name={s.icon_name} className="size-6" />
                  </span>
                  <h3 className="text-heading text-text font-semibold">{s.title}</h3>
                  {s.description && (
                    <p className="text-body text-text-muted mt-2 leading-relaxed">
                      {s.description}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </Section>

        {/* ---- Doctor -------------------------------------------------- */}
        <section id="doctor" className="scroll-mt-[var(--nav-h)] bg-surface/40 py-[var(--section-pad)]">
          <div className="mx-auto grid max-w-content items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div data-reveal className="order-2 lg:order-1">
              <p className="text-label text-accent mb-3 font-semibold tracking-wide uppercase">
                Your specialist
              </p>
              <h2 className="text-title text-text font-semibold tracking-tight">
                {doctor.data?.full_name ?? 'Consultant Orthopaedic Surgeon'}
              </h2>
              {doctor.data?.qualifications && (
                <p className="text-body text-text-muted mt-2 font-medium">
                  {doctor.data.qualifications}
                </p>
              )}
              <p className="text-body text-text-muted mt-5 max-w-xl leading-relaxed text-pretty">
                {doctor.data?.bio ??
                  'A registered orthopaedic surgeon focused on restoring movement — from sports injuries and fractures to joint replacement and long-term joint care.'}
              </p>

              <dl className="mt-8 grid grid-cols-2 gap-6 sm:max-w-md">
                {doctor.data?.experience_years != null && (
                  <Fact term="Experience" detail={`${doctor.data.experience_years}+ years`} />
                )}
                {doctor.data?.registration_number && (
                  <Fact term="Reg. no." detail={doctor.data.registration_number} />
                )}
                {doctor.data?.specialization && (
                  <Fact term="Focus" detail={doctor.data.specialization} />
                )}
              </dl>

              <div className="mt-8">
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

        {/* ---- Patient stories ---------------------------------------- */}
        {testimonials.length > 0 && (
          <Section id="stories" eyebrow="Patient stories" title="Movement, given back">
            <div
              data-reveal-group
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              {testimonials.slice(0, 6).map((t) => (
                <figure
                  key={t.id}
                  data-reveal-item
                  className="border-border bg-surface flex flex-col rounded-xl border p-6"
                >
                  <Quote aria-hidden className="text-accent/40 size-7" />
                  <blockquote className="text-body text-text mt-3 flex-1 leading-relaxed text-pretty">
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
          </Section>
        )}

        {/* ---- Gallery ------------------------------------------------- */}
        {gallery.length > 0 && (
          <Section id="gallery" eyebrow="Inside the clinic" title="Where you'll be cared for">
            <div
              data-reveal-group
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {gallery.slice(0, 8).map((img, i) => (
                <figure
                  key={img.id}
                  data-reveal-item
                  className={cn(
                    'gallery-plate aspect-square overflow-hidden rounded-lg',
                    i === 0 && 'col-span-2 row-span-2 aspect-square sm:aspect-auto',
                  )}
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
          </Section>
        )}

        {/* ---- Visit -------------------------------------------------- */}
        <section id="visit" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
          <div className="mx-auto grid max-w-content gap-10 px-5 sm:px-8 lg:grid-cols-2">
            <div data-reveal>
              <p className="text-label text-accent mb-3 font-semibold tracking-wide uppercase">
                Visit us
              </p>
              <h2 className="text-title text-text font-semibold tracking-tight">
                Opening hours &amp; contact
              </h2>
              <ul className="mt-8 space-y-3">
                {contactRows(clinic.data).map((row) => (
                  <li key={row.label} className="flex items-start gap-3">
                    <row.icon aria-hidden className="text-accent mt-0.5 size-5 shrink-0" />
                    <div>
                      <div className="text-caption text-text-subtle">{row.label}</div>
                      <div className="text-body text-text">{row.value}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div
              data-reveal
              className="border-border bg-surface rounded-xl border p-6 sm:p-8"
            >
              <h3 className="text-label text-text-muted mb-4 flex items-center gap-2 font-semibold tracking-wide uppercase">
                <Clock aria-hidden className="size-4" /> Weekly hours
              </h3>
              <dl className="divide-border divide-y">
                {DAY_ORDER.map((day) => (
                  <div key={day} className="flex items-center justify-between py-2.5">
                    <dt className="text-body text-text">{DAY_LABEL[day]}</dt>
                    <dd
                      className={cn(
                        'text-body tabular-nums',
                        hours[day] ? 'text-text' : 'text-text-subtle',
                      )}
                    >
                      {hours[day] ?? 'Closed'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ---- Booking (owned by the booking agent) ------------------- */}
        <div data-reveal className="scroll-mt-[var(--nav-h)]">
          <BookingSection />
        </div>
      </main>

      {/* ---- Footer --------------------------------------------------- */}
      <footer className="border-t border-border bg-surface/40">
        <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="text-heading text-text flex items-center gap-2.5 font-semibold">
              <span className="border-accent text-accent grid size-8 place-items-center rounded-md border-[1.5px]">
                <Stethoscope aria-hidden className="size-4" />
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
/*  Section shell                                                             */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <header data-reveal className="mb-10 max-w-2xl">
          <p className="text-label text-accent mb-3 font-semibold tracking-wide uppercase">
            {eyebrow}
          </p>
          <h2 className="text-title text-text font-semibold tracking-tight text-balance">
            {title}
          </h2>
        </header>
        {children}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Hero headline — words wrapped in clips for the slide-up reveal            */
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
    <div data-reveal-item className="bg-surface/40 px-5 py-8 text-center sm:py-10">
      <div
        data-count={value}
        data-suffix={suffix}
        data-numeric
        className="text-display text-text font-semibold tracking-tight"
      >
        {value}
        {suffix}
      </div>
      <div className="text-caption text-text-subtle mt-1">{label}</div>
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

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-border text-body text-text-muted rounded-xl border border-dashed px-6 py-10 text-center">
      {children}
    </p>
  )
}

function FooterLink({ target, children }: { target: string; children: React.ReactNode }) {
  return (
    <ScrollButton
      target={target}
      tone="ghost"
      size="md"
      className="h-auto justify-start px-0 font-medium text-text-muted hover:bg-transparent hover:text-text"
    >
      {children}
    </ScrollButton>
  )
}

/**
 * The doctor's portrait: the uploaded photo when there is one, otherwise a
 * composed monogram frame — never a broken image or an empty box.
 */
function DoctorPortrait({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="border-border bg-surface relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border">
      {photoUrl ? (
        <img
          src={resolveApiUrl(photoUrl)}
          alt={name}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="gallery-plate grid size-full place-items-center">
          <span className="text-display text-accent/70 font-semibold tracking-tight">
            {initials || 'Rx'}
          </span>
        </div>
      )}
      <div className="border-accent/30 pointer-events-none absolute inset-3 rounded-xl border" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Data shaping                                                              */
/* -------------------------------------------------------------------------- */

/** Collapse the weekly availability rows into one "9:00 am – 5:00 pm" per day. */
function groupHours(
  rows: WeeklyAvailabilityResponse[] | undefined,
): Partial<Record<DayOfWeek, string>> {
  const out: Partial<Record<DayOfWeek, string>> = {}
  for (const row of rows ?? []) {
    if (!row.is_active) continue
    const span = `${formatTime(row.start_time)} – ${formatTime(row.end_time)}`
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

import { ArrowRight } from 'lucide-react'
import { resolveApiUrl } from '@/api/http'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import {
  ButtonLink,
  Container,
  Eyebrow,
  HERO_TYPE,
  LEDE_TYPE,
  LoadingBlock,
  Panel,
  PROSE_TYPE,
  Prose,
  Section,
  SectionHead,
} from './Parts'
import {
  BookingCta,
  DoctorCredentials,
  HoursList,
  ServicesGrid,
  TestimonialGrid,
} from './Collections'
import { pageSections, paragraphs, sortedServices, sortedTestimonials, text } from './content'
import {
  usePublicAvailability,
  usePublicClinic,
  usePublicDoctor,
  usePublicPage,
  usePublicPortfolio,
} from './usePublicData'
import { siteTitle, usePageTitle } from './usePageTitle'
import { BOOK_PATH, SITE_ROOT } from './routes'

export function HomePage() {
  const clinicQuery = usePublicClinic()
  const doctorQuery = usePublicDoctor()
  const portfolioQuery = usePublicPortfolio()
  const availabilityQuery = usePublicAvailability()
  const pageQuery = usePublicPage('home')

  const clinic = clinicQuery.data
  const doctor = doctorQuery.data
  const page = pageQuery.data

  usePageTitle(
    clinic
      ? siteTitle(text(clinic.tagline) ?? text(doctor?.specialization), clinic.clinic_name)
      : null,
  )

  const services = sortedServices(portfolioQuery.data?.services)
  const testimonials = sortedTestimonials(portfolioQuery.data?.testimonials)
  const availability = availabilityQuery.data ?? []

  // The CMS seeds section bodies as literal "..."; `pageSections` drops those,
  // so a half-written page collapses instead of showing empty headings.
  const sections = pageSections(page).filter((section) => section.body)

  const heroTitle = text(page?.title) ?? clinic?.clinic_name ?? ''
  const heroLede = text(page?.subtitle) ?? firstParagraph(doctor?.bio)
  const doctorBioFirst = firstParagraph(doctor?.bio)

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-border bg-surface relative overflow-hidden border-b">
        <div
          aria-hidden
          className="bg-accent-muted pointer-events-none absolute inset-x-0 -top-40 h-80 opacity-70 blur-3xl"
        />
        <Container className="relative py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
            <div className="flex flex-col items-start gap-6">
              {text(doctor?.specialization) && <Eyebrow>{doctor?.specialization}</Eyebrow>}

              {pageQuery.isPending && !heroTitle ? (
                <LoadingBlock lines={2} className="w-full max-w-lg" />
              ) : (
                <h1 className={cn(HERO_TYPE, 'text-text')}>{heroTitle}</h1>
              )}

              {heroLede && (
                <p className={cn(LEDE_TYPE, 'text-text-muted max-w-prose')}>{heroLede}</p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink to={BOOK_PATH} tone="primary" size="lg">
                  Book an appointment
                </ButtonLink>
                <ButtonLink to={`${SITE_ROOT}/services`} tone="secondary" size="lg">
                  See what we treat
                </ButtonLink>
              </div>

              <HeroFacts
                experienceYears={doctor?.experience_years ?? null}
                serviceCount={services.length}
                storyCount={testimonials.length}
              />
            </div>

            <DoctorPortrait
              name={doctor?.full_name ?? null}
              specialization={text(doctor?.specialization)}
              qualifications={text(doctor?.qualifications)}
              photoUrl={text(doctor?.photo_url)}
              loading={doctorQuery.isPending}
            />
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Services                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Section tone="sunken">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead
            eyebrow="Treatments"
            title="What we treat"
            description="Orthopaedic care from first consultation through to recovery."
          />
          {services.length > 3 && (
            <ButtonLink
              to={`${SITE_ROOT}/services`}
              tone="ghost"
              size="md"
              iconRight={<ArrowRight aria-hidden className="size-4" />}
            >
              All services
            </ButtonLink>
          )}
        </div>
        <div className="mt-8">
          <ServicesGrid services={services.slice(0, 3)} loading={portfolioQuery.isPending} />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* The doctor                                                          */}
      {/* ------------------------------------------------------------------ */}
      {(doctorBioFirst || doctor) && (
        <Section>
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col gap-5">
              <SectionHead eyebrow="About" title={doctor?.full_name ?? 'About the doctor'} />
              {doctorBioFirst && (
                <p className={cn(PROSE_TYPE, 'text-text-muted max-w-prose')}>{doctorBioFirst}</p>
              )}
              <ButtonLink
                to={`${SITE_ROOT}/about`}
                tone="ghost"
                size="md"
                className="self-start"
                iconRight={<ArrowRight aria-hidden className="size-4" />}
              >
                Read the full profile
              </ButtonLink>
            </div>
            {doctor && (
              <Panel>
                <h3 className="text-heading text-text mb-2">Credentials</h3>
                <DoctorCredentials doctor={doctor} />
              </Panel>
            )}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CMS narrative sections, when the doctor has written them            */}
      {/* ------------------------------------------------------------------ */}
      {sections.length > 0 && (
        <Section tone="sunken">
          <div className="grid gap-10 md:grid-cols-2">
            {sections.map((section, index) => (
              <div key={index} className="flex flex-col gap-3">
                {section.heading && <h2 className="text-heading text-text">{section.heading}</h2>}
                {section.body && <Prose body={section.body} />}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Patient stories                                                     */}
      {/* ------------------------------------------------------------------ */}
      {(portfolioQuery.isPending || testimonials.length > 0) && (
        <Section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHead
              eyebrow="Patient stories"
              title="In their words"
              description="Published with each patient's permission."
            />
            {testimonials.length > 2 && (
              <ButtonLink
                to={`${SITE_ROOT}/testimonials`}
                tone="ghost"
                size="md"
                iconRight={<ArrowRight aria-hidden className="size-4" />}
              >
                All stories
              </ButtonLink>
            )}
          </div>
          <div className="mt-8">
            <TestimonialGrid
              testimonials={testimonials.slice(0, 2)}
              loading={portfolioQuery.isPending}
            />
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Book                                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section tone="sunken">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
          <BookingCta phone={text(clinic?.phone)} doctorName={doctor?.full_name ?? null} />
          <Panel className="flex flex-col gap-4">
            <h2 className="text-heading text-text">Consulting hours</h2>
            <HoursList availability={availability} loading={availabilityQuery.isPending} />
          </Panel>
        </div>
      </Section>
    </>
  )
}

/* -------------------------------------------------------------------------- */

/** `Dr. John Carter` → `JC`. An honorific is not part of a person's initials. */
function monogram(name: string): string {
  return initials(name.replace(/^\s*(dr|doctor|prof|professor|mr|mrs|ms)\.?\s+/i, ''))
}

function firstParagraph(bio: string | null | undefined): string | null {
  const body = text(bio)
  if (!body) return null
  return paragraphs(body)[0] ?? body
}

/**
 * Only facts the API actually returned. A stat with no value is not rendered
 * at all — an invented "500+ happy patients" is the fastest way to lose the
 * trust this page exists to build.
 */
function HeroFacts({
  experienceYears,
  serviceCount,
  storyCount,
}: {
  experienceYears: number | null
  serviceCount: number
  storyCount: number
}) {
  const facts: { value: string; label: string }[] = []
  if (typeof experienceYears === 'number' && experienceYears > 0) {
    facts.push({
      value: String(experienceYears),
      label: experienceYears === 1 ? 'Year in practice' : 'Years in practice',
    })
  }
  if (serviceCount > 0) {
    facts.push({
      value: String(serviceCount),
      label: serviceCount === 1 ? 'Treatment offered' : 'Treatments offered',
    })
  }
  if (storyCount > 0) {
    facts.push({
      value: String(storyCount),
      label: storyCount === 1 ? 'Patient story' : 'Patient stories',
    })
  }
  if (facts.length === 0) return null

  return (
    <dl className="mt-2 flex flex-wrap gap-x-10 gap-y-5">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5">
          <dt className="text-caption text-text-muted order-2">{fact.label}</dt>
          <dd
            data-numeric
            className="text-text order-1 text-[1.75rem] leading-none font-semibold tracking-tighter"
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * `photo_url` is usually null on a fresh clinic. Rather than a stock headshot
 * (which would be a lie) we fall back to a typographic plate built from the
 * doctor's own initials.
 */
function DoctorPortrait({
  name,
  specialization,
  qualifications,
  photoUrl,
  loading,
}: {
  name: string | null
  specialization: string | null
  qualifications: string | null
  photoUrl: string | null
  loading: boolean
}) {
  if (loading && !name) {
    return (
      <div
        aria-hidden
        className="bg-border/50 aspect-[4/5] w-full max-w-xs animate-pulse rounded-xl motion-reduce:animate-none lg:ml-auto"
      />
    )
  }
  if (!name) return null

  return (
    <figure className="border-border bg-bg-sunken w-full max-w-xs overflow-hidden rounded-xl border shadow-md lg:ml-auto">
      {photoUrl ? (
        <img
          src={resolveApiUrl(photoUrl)}
          alt={name}
          loading="lazy"
          decoding="async"
          className="aspect-[4/5] w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="bg-accent-muted text-accent grid aspect-[4/5] w-full place-items-center text-[clamp(3rem,9vw,5rem)] font-semibold tracking-tighter"
        >
          {monogram(name)}
        </div>
      )}
      <figcaption className="border-border bg-surface flex flex-col gap-1 border-t px-5 py-4">
        <span className="text-body text-text font-semibold">{name}</span>
        {specialization && <span className="text-caption text-text-muted">{specialization}</span>}
        {qualifications && <span className="text-caption text-text-subtle">{qualifications}</span>}
      </figcaption>
    </figure>
  )
}

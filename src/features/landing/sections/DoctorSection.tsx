/**
 * Doctor — a two-column split: a large, filmically graded portrait on one side,
 * the surgeon's name, qualifications, bio, a compact facts list and the primary
 * booking CTA on the other.
 *
 * The portrait defaults to curated stock so the section always reads as a real
 * clinician; an uploaded CMS `photo_url` is used in preference when present.
 * Text falls back to sensible copy while the profile query is in flight (a
 * same-column skeleton) or when a field is empty. `data-reveal` is on each
 * column for the page's GSAP.
 */
import { ArrowRight } from 'lucide-react'
import { resolveApiUrl } from '@/api/http'
import { img } from '@/features/landing/imagery'
import { ScrollButton } from '@/features/landing/primitives'
import { usePublicDoctor } from '@/features/public/usePublicData'

const FALLBACK_BIO =
  'A registered orthopaedic surgeon focused on restoring movement, from sports injuries and fractures to joint replacement and long-term joint care.'

export function DoctorSection() {
  const doctor = usePublicDoctor()
  const data = doctor.data

  const fullName = data?.full_name ?? 'Consultant Orthopaedic Surgeon'
  const photoSrc = data?.photo_url
    ? resolveApiUrl(data.photo_url)
    : img('doctor', { w: 1000, h: 1250 })

  const facts = [
    data?.experience_years != null
      ? { term: 'Experience', detail: `${data.experience_years}+ years` }
      : null,
    data?.registration_number
      ? { term: 'Registration', detail: data.registration_number }
      : null,
    data?.specialization ? { term: 'Focus', detail: data.specialization } : null,
  ].filter((fact): fact is { term: string; detail: string } => fact !== null)

  return (
    <section id="doctor" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto grid max-w-content items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div data-reveal>
          <figure className="lp-media lp-scrim relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl lg:max-w-none">
            <img
              src={photoSrc}
              alt={`Portrait of ${fullName}`}
              loading="lazy"
              className="size-full object-cover"
            />
            <div className="pointer-events-none absolute inset-3 z-10 rounded-2xl border border-[color:var(--lp-accent-line)]" />
          </figure>
        </div>

        <div data-reveal>
          {doctor.isPending ? (
            <DoctorTextSkeleton />
          ) : (
            <>
              <h2 className="lp-h2 text-balance">{fullName}</h2>
              {data?.qualifications && (
                <p className="text-body mt-3 font-medium text-[color:var(--lp-accent)]">
                  {data.qualifications}
                </p>
              )}
              <p className="lp-lead mt-6 max-w-[52ch]">{data?.bio ?? FALLBACK_BIO}</p>

              {facts.length > 0 && (
                <dl className="mt-9 grid grid-cols-2 gap-x-8 gap-y-6 sm:max-w-md">
                  {facts.map((fact) => (
                    <div key={fact.term}>
                      <dt className="text-caption text-text-subtle">{fact.term}</dt>
                      <dd className="text-body text-text mt-0.5 font-medium">{fact.detail}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-9">
                <ScrollButton target="book" tone="primary" size="lg" magnetic>
                  Consult the doctor
                  <ArrowRight aria-hidden className="size-4" />
                </ScrollButton>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Loading — keeps the text column's rhythm so the portrait never jumps       */
/* -------------------------------------------------------------------------- */

function DoctorTextSkeleton() {
  return (
    <div aria-hidden className="animate-pulse motion-reduce:animate-none">
      <div className="bg-surface h-10 w-2/3 rounded-lg" />
      <div className="bg-surface-hover mt-4 h-4 w-1/2 rounded" />
      <div className="mt-7 space-y-2.5">
        <div className="bg-surface h-3.5 w-full rounded" />
        <div className="bg-surface h-3.5 w-11/12 rounded" />
        <div className="bg-surface h-3.5 w-4/5 rounded" />
      </div>
      <div className="mt-9 grid grid-cols-2 gap-x-8 gap-y-6 sm:max-w-md">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="bg-surface-hover h-2.5 w-16 rounded" />
            <div className="bg-surface h-3.5 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-surface mt-9 h-12 w-52 rounded-sm" />
    </div>
  )
}

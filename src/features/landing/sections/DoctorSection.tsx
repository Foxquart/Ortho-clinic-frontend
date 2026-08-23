/**
 * About — the person behind the practice, told briefly and warmly.
 *
 * A two-column split: a filmic portrait on one side, a short biography and a
 * few honest facts on the other. Clinic credentials appear once, in a single
 * quiet facts row, because this page is about the person first. Text falls
 * back to sensible copy while the profile query is in flight.
 *
 * MOTION CONTRACT (see landing.css): `data-reveal` on each column is animated
 * by the PAGE-level GSAP, only inside the reduced-motion "no-preference"
 * branch.
 */
import { ArrowRight } from 'lucide-react'
import { resolveApiUrl } from '@/api/http'
import { img } from '@/features/landing/imagery'
import { ScrollButton } from '@/features/landing/primitives'
import { usePublicDoctor } from '@/features/public/usePublicData'

const FALLBACK_BIO =
  'An orthodontist who believes a good consultation starts with a good conversation. Trained in Mumbai, practising in Kolkata, and happiest when the appointment runs five minutes long because we got talking.'

export function DoctorSection() {
  const doctor = usePublicDoctor()
  const data = doctor.data

  const fullName = data?.full_name ?? 'Dr. Arjun Mehta'
  const photoSrc = data?.photo_url
    ? resolveApiUrl(data.photo_url)
    : img('clinicPortrait', { w: 1000, h: 1250 })

  const facts = [
    data?.experience_years != null
      ? { term: 'In practice', detail: `${data.experience_years}+ years` }
      : null,
    data?.registration_number
      ? { term: 'Registration', detail: data.registration_number }
      : null,
    data?.specialization ? { term: 'Speciality', detail: data.specialization } : null,
    { term: 'First language', detail: 'Conversation' },
  ].filter((fact): fact is { term: string; detail: string } => fact !== null)

  return (
    <section id="about" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto grid max-w-content items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div data-reveal>
          <figure className="lp-media relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl lg:max-w-none">
            <img
              src={photoSrc}
              alt={`Portrait of ${fullName}`}
              loading="lazy"
              decoding="async"
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
                  Say hello
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
      <div className="bg-surface mt-9 h-12 w-40 rounded-full" />
    </div>
  )
}

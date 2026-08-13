/**
 * Approach — a full-width band set apart from the near-black page by a petrol
 * tint and hairline rules. A single graded photograph anchors the heading;
 * three rule-topped columns (Diagnose / Treat / Restore) state the method as
 * plain type, not cards.
 *
 * This is the ONE section on the landing that uses `.lp-kicker`. The copy is
 * fixed, so there is no data hook and no loading state. `data-reveal` /
 * `data-reveal-group` / `data-reveal-item` are read by the page's GSAP.
 */
import { img } from '@/features/landing/imagery'

const PILLARS = [
  {
    term: 'Diagnose',
    detail: 'Precise assessment: imaging, examination, a clear picture before anything else.',
  },
  {
    term: 'Treat',
    detail: 'From conservative care to surgery, matched to the joint and the person.',
  },
  {
    term: 'Restore',
    detail: 'Rehabilitation that returns real, lasting range of movement.',
  },
]

export function ApproachSection() {
  return (
    <section
      aria-label="Our approach"
      className="border-y border-[color:var(--lp-accent-line)] bg-[color:var(--lp-accent-tint)]"
    >
      <div className="mx-auto max-w-content px-5 py-[var(--section-pad)] sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:gap-16">
          <div data-reveal className="max-w-[24ch]">
            <p className="lp-kicker mb-5">How movement is restored</p>
            <h2 className="lp-h2">Every joint tells a story. We read it carefully.</h2>
          </div>
          <div
            data-reveal
            className="lp-media lp-scrim lp-tint aspect-[5/4] overflow-hidden rounded-3xl sm:aspect-[16/10] lg:aspect-[5/4]"
          >
            <img
              src={img('physio', { w: 1000, h: 800 })}
              alt="A therapist guiding a patient through a range-of-motion exercise."
              loading="lazy"
              className="size-full object-cover"
            />
          </div>
        </div>

        <div data-reveal-group className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-3 lg:mt-20">
          {PILLARS.map((pillar, i) => (
            <div
              key={pillar.term}
              data-reveal-item
              className="border-t-2 border-[color:var(--lp-accent)] pt-5"
            >
              <span className="lp-numeral text-caption font-semibold text-[color:var(--lp-accent)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-title text-text mt-2 font-semibold tracking-tight">
                {pillar.term}
              </h3>
              <p className="text-body text-text-muted mt-3 max-w-[34ch] leading-relaxed">
                {pillar.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

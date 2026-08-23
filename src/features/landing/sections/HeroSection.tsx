/**
 * Hero — the whole opening argument, on one screen and one scroll after it.
 *
 * This absorbed what used to be three separate sections: the hero, the
 * manifesto, and the About block. They were saying the same thing three times
 * at three different scroll depths, and a reader deciding whether to call a
 * surgeon should not have to travel to assemble the answer.
 *
 * The layout carries that consolidation without getting loud. The split holds
 * only what earns a first screen — who he is, what he does, where, and the
 * four facts a patient in Agartala actually weighs — with the portrait beside
 * it. The statement of approach sits below the fold at display size, where it
 * reads as a considered aside rather than a claim competing with the headline.
 *
 * ## Identity comes from `profile.ts`, not the CMS
 *
 * Deliberate, and a change from how this page used to work. The name, the
 * qualifications and the biography are the entity anchor: they are what Google
 * and every AI assistant resolve "Dr. Sankar Deb Roy" against, and they are
 * already fragmented across five spellings on five sites. They belong in a
 * reviewed, version-controlled file, not behind an API call that can serve
 * seed data, time out, or quietly drift. The CMS keeps what it is good at —
 * hours, contact details, testimonials, anything that changes without a deploy.
 *
 * MOTION CONTRACT (see landing.css): nothing here carries an `opacity: 0`
 * baseline. `[data-hero-word]` and `[data-hero-fade]` are revealed by the
 * PAGE-level GSAP; this component only owns the portrait drift. Both live
 * exclusively inside the `(prefers-reduced-motion: no-preference)` branch.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { PORTRAIT } from '@/features/landing/imagery'
import { DraftChip, ScrollButton } from '@/features/landing/primitives'
import { ABOUT, DOCTOR, HERO, MANIFESTO, SHOW_DRAFTS, TRAINING } from '@/features/landing/profile'

gsap.registerPlugin(ScrollTrigger)

const FACTS = [
  { term: 'In practice', detail: `${DOCTOR.experienceYears}+ years` },
  { term: 'Trained at', detail: `RIMS Imphal, ${TRAINING.postgraduateYear}` },
  { term: 'Attached to', detail: TRAINING.institutionShort },
  { term: 'Consults in', detail: ABOUT.languages.join(', ') },
]

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const figureRef = useRef<HTMLElement>(null)

  /* Parallax we own: the portrait drifts up a little slower than the page.
     Small on purpose — a face sliding about is distracting in a way a
     landscape is not, and it is off entirely below `lg`, where the portrait
     stacks under the text and any drift would just fight the scroll. */
  useGSAP(
    () => {
      const figure = figureRef.current
      const section = sectionRef.current
      if (!figure || !section) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1024px)', () => {
        gsap.to(figure, {
          yPercent: -6,
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true },
        })
      })

      return () => mm.revert()
    },
    { scope: sectionRef },
  )

  return (
    <section
      ref={sectionRef}
      id="top"
      className="relative isolate overflow-hidden pt-[calc(var(--nav-h)+2.5rem)]"
      aria-label="Introduction"
    >
      {/* The first screen ---------------------------------------------- */}
      <div className="mx-auto grid w-full max-w-content items-center gap-12 px-5 sm:px-8 lg:min-h-[calc(100dvh-var(--nav-h))] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Text first in the document, and first on mobile. */}
        <div className="min-w-0">
          <p data-hero-fade className="lp-kicker">
            {HERO.kicker}
          </p>

          {/* One sentence, split for the stagger. Concatenated it must still
              read cleanly — that is what a crawler and a screen reader get. */}
          <h1 className="lp-display lp-display-split mt-5 sm:mt-6">
            {HERO.headline.map((line) => (
              <span key={line.text} className="hero-line">
                <span data-hero-word className="hero-word">
                  {'emphasis' in line && line.emphasis ? (
                    <span className="lp-em">{line.text}</span>
                  ) : (
                    line.text
                  )}{' '}
                </span>
              </span>
            ))}
          </h1>

          <p
            data-hero-fade
            className="text-body mt-5 font-medium text-[color:var(--lp-accent)]"
          >
            {DOCTOR.qualifications}
          </p>

          <p data-hero-fade className="lp-lead mt-5 max-w-[48ch]">
            {HERO.lead}
          </p>

          <dl
            data-hero-fade
            className="border-border mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-8 sm:max-w-lg"
          >
            {FACTS.map((fact) => (
              <div key={fact.term}>
                <dt className="text-caption text-text-subtle">{fact.term}</dt>
                <dd className="text-body text-text mt-0.5 font-medium">{fact.detail}</dd>
              </div>
            ))}
          </dl>

          <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-3">
            <ScrollButton target="book" tone="primary" size="lg" magnetic>
              Book an appointment
              <ArrowRight aria-hidden className="size-4" />
            </ScrollButton>
            <ScrollButton target="record" tone="secondary" size="lg">
              The record
            </ScrollButton>
          </div>
        </div>

        {/* Him. The only genuinely his image on the page, so it gets the frame. */}
        <figure
          ref={figureRef}
          data-hero-fade
          className="lp-media relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl lg:max-w-none"
        >
          <img
            src={PORTRAIT.src}
            srcSet={PORTRAIT.srcSet}
            sizes="(min-width: 1024px) 40vw, min(24rem, 90vw)"
            width={PORTRAIT.width}
            height={PORTRAIT.height}
            alt={PORTRAIT.alt}
            decoding="async"
            fetchPriority="high"
            className="aspect-[3/4] size-full object-cover"
          />
          <div className="pointer-events-none absolute inset-3 z-10 rounded-2xl border border-[color:var(--lp-accent-line)]" />
          {/* The caption sits over whatever the photograph happens to be doing
              there, so it carries its own ground rather than trusting a
              gradient over an unknown background. */}
          <figcaption className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 pb-5 pt-12">
            <span className="text-caption font-medium text-white/90">
              {TRAINING.department}, {TRAINING.institutionShort}
            </span>
          </figcaption>
        </figure>
      </div>

      {/* The statement of approach ------------------------------------- */}
      {(!MANIFESTO.draft || SHOW_DRAFTS) && (
        <div className="mx-auto max-w-content px-5 py-[var(--section-pad)] sm:px-8">
          <div className="mx-auto max-w-3xl">
            {MANIFESTO.draft && <DraftChip className="mb-6" />}
            <p
              data-reveal
              className="lp-serif text-text text-[clamp(1.9rem,4.2vw,3.2rem)] leading-[1.15] tracking-[-0.005em] text-balance"
            >
              {MANIFESTO.statement} <span className="lp-em">{MANIFESTO.emphasis}</span>
            </p>
            <p data-reveal className="lp-lead mt-8 max-w-[54ch]">
              {MANIFESTO.body}
            </p>
            <p data-reveal className="lp-lead mt-6 max-w-[54ch]">
              {ABOUT.bio}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

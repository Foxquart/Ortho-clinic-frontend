/**
 * Hero — a life-first portrait opening for Dr. Arjun Mehta.
 *
 * A warm, editorial photograph fills the viewport under a soft paper wash,
 * with an Instrument Serif headline stacked word-by-word. The emphasis is on
 * the person, not the clinic: the copy introduces a doctor who happens to be
 * a speaker, cyclist, reader, and host.
 *
 * MOTION CONTRACT (see landing.css): nothing here carries an `opacity: 0`
 * baseline. The headline words (`[data-hero-word]`) and the fade group
 * (`[data-hero-fade]`) are revealed by the PAGE-level GSAP; this component only
 * owns the background parallax below. Both live exclusively inside the
 * `(prefers-reduced-motion: no-preference)` branch.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { img } from '@/features/landing/imagery'
import { ScrollButton } from '@/features/landing/primitives'
import { usePublicDoctor } from '@/features/public/usePublicData'

gsap.registerPlugin(ScrollTrigger)

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const doctor = usePublicDoctor()
  const fullName = doctor.data?.full_name ?? 'Dr. Arjun Mehta'

  /* Parallax we own: the photo drifts down and grows a touch as the hero
     scrolls out, scrubbed to the scroll position. Gated behind matchMedia. */
  useGSAP(
    () => {
      const image = imgRef.current
      const section = sectionRef.current
      if (!image || !section) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(image, {
          yPercent: 14,
          scale: 1.06,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
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
      className="relative isolate flex min-h-dvh items-center overflow-hidden"
      aria-label="Introduction"
    >
      {/* Editorial portrait + guaranteed-legible wash, filling the section. */}
      <div className="lp-media lp-scrim-hero absolute inset-0">
        <img
          ref={imgRef}
          src={img('heroPortrait', { w: 2200, h: 1400, q: 72 })}
          alt="Dr. Arjun Mehta smiling in natural light."
          decoding="async"
          fetchPriority="high"
          className="scale-105 will-change-transform"
        />
      </div>

      {/* Content: kicker, stacked headline, lead, dual CTAs. Left-aligned. */}
        <div className="relative z-10 mx-auto w-full max-w-content px-5 sm:px-8">
        <p data-hero-fade className="lp-kicker">
          Orthodontist · Speaker · Weekend cyclist
        </p>

        <h1 className="lp-display mt-5 sm:mt-6">
          <span className="hero-line">
            <span data-hero-word className="hero-word">
              A doctor{' '}
            </span>
          </span>
          <span className="hero-line">
            <span data-hero-word className="hero-word">
              who smiles{' '}
            </span>
          </span>
          <span className="hero-line">
            <span data-hero-word className="hero-word">
              <span className="lp-em">widely</span>.
            </span>
          </span>
        </h1>

        <p data-hero-fade className="lp-lead mt-6 max-w-[44ch]">
          {fullName} builds confident smiles by day and explores cities, ideas, and long
          bicycle routes the rest of the time. Here, the person comes first.
        </p>

        <div data-hero-fade className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
          <ScrollButton target="book" tone="primary" size="lg" magnetic>
            Book a conversation
            <ArrowRight aria-hidden className="size-4" />
          </ScrollButton>
          <ScrollButton target="events" tone="secondary" size="lg">
            See where I am
          </ScrollButton>
        </div>
      </div>
    </section>
  )
}

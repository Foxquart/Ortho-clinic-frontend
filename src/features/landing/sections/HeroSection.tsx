/**
 * Hero — the full-bleed, dark cinematic opening of the landing page.
 *
 * A single filmic photograph of an athlete in motion fills the viewport under
 * the shared `.lp-scrim-hero` wash, with an Instrument Serif headline stacked
 * word-by-word over it. This is the loudest moment on the page, so the type is
 * large and confident and the image drifts on scroll.
 *
 * MOTION CONTRACT (see landing.css): nothing here carries an `opacity: 0`
 * baseline. The headline words (`[data-hero-word]`) and the fade group
 * (`[data-hero-fade]`) are revealed by the PAGE-level GSAP; this component only
 * owns the background parallax below. Both live exclusively inside the
 * `(prefers-reduced-motion: no-preference)` branch, so with reduced motion — or
 * if JS never runs — the photo and every line paint in their final, legible
 * state.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { img } from '@/features/landing/imagery'
import { ScrollButton } from '@/features/landing/primitives'
import { usePublicClinic, usePublicDoctor } from '@/features/public/usePublicData'

gsap.registerPlugin(ScrollTrigger)

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const clinic = usePublicClinic()
  const doctor = usePublicDoctor()

  const specialization = doctor.data?.specialization ?? 'Orthopaedic surgery'
  const tagline =
    clinic.data?.tagline ??
    'Precise orthopaedic care that gives you back your range of movement.'

  /* Parallax we own: the photo drifts down and grows a touch as the hero
     scrolls out, scrubbed to the scroll position. Gated behind matchMedia so
     reduced motion leaves the image perfectly static, and reverted on cleanup. */
  useGSAP(
    () => {
      const image = imgRef.current
      const section = sectionRef.current
      if (!image || !section) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(image, {
          yPercent: 18,
          scale: 1.08,
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
      {/* Filmic photograph + guaranteed-legible scrim, filling the section. */}
      <div className="lp-media lp-scrim-hero absolute inset-0">
        <img
          ref={imgRef}
          src={img('heroMovement', { w: 2200, h: 1400, q: 72 })}
          alt="A runner climbing stadium steps."
          decoding="async"
          fetchPriority="high"
          className="scale-105 will-change-transform"
        />
      </div>

      {/* Content: kicker, stacked headline, lead, dual CTAs. Left-aligned. */}
      <div className="relative z-10 mx-auto w-full max-w-content px-5 sm:px-8">
        <p data-hero-fade className="lp-kicker">
          {specialization}
        </p>

        <h1 className="lp-display mt-5 sm:mt-6">
          <span className="hero-line">
            <span data-hero-word className="hero-word">
              Move{' '}
            </span>
          </span>
          <span className="hero-line">
            <span data-hero-word className="hero-word">
              without{' '}
            </span>
          </span>
          <span className="hero-line">
            <span data-hero-word className="hero-word">
              <span className="lp-em">limits</span>.
            </span>
          </span>
        </h1>

        <p data-hero-fade className="lp-lead mt-6 max-w-[42ch]">
          {tagline}
        </p>

        <div data-hero-fade className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
          <ScrollButton target="book" tone="primary" size="lg" magnetic>
            Book an appointment
            <ArrowRight aria-hidden className="size-4" />
          </ScrollButton>
          <ScrollButton target="services" tone="secondary" size="lg">
            See what we treat
          </ScrollButton>
        </div>
      </div>
    </section>
  )
}

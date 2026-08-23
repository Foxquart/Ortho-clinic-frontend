/**
 * Dr. Sankar Deb Roy — personal landing page (the front door at `/`).
 *
 * Editorial, person-first: warm paper grounds, deep teal accent, Instrument
 * Serif display over Inter, photography under a soft filmic grade, paper
 * grain, GSAP-driven motion over a single Lenis engine.
 *
 * ## Why the clinic is at the bottom
 *
 * The order is the argument. Somebody searching "orthopedic doctor in
 * agartala" gets a page of directory listings that all say the same four
 * things — degree, years, fee, phone — about every surgeon in the city. None
 * of it distinguishes anyone. What distinguishes him is checkable and personal:
 * where he trained, the hospital department he is attached to, an hour of
 * state television on arthritis, a peer-reviewed paper, and the fact that the
 * consultation happens in Bengali.
 *
 * So the page runs person → record → life → what people said, and then the
 * booking form. There is no clinic band and no separate About block: the
 * address lives in the footer, where a NAP block belongs, and everything about
 * him is consolidated into the hero rather than restated three times down the
 * page. The seven-day hours table and the fuller practice pages still exist,
 * on `/site`, for the reader who came looking for exactly that.
 *
 * The page owns the Lenis smooth-scroll engine and the shared reveal
 * choreography; each section is an isolated component that only tags elements
 * with `data-reveal` / `data-hero-*` and lets this file animate them.
 *
 * MOTION CONTRACT: no element carries an `opacity: 0` baseline. Reveals run
 * only inside `(prefers-reduced-motion: no-preference)`; with reduced motion
 * or no JS, every section paints in its final, legible state.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { DOCTOR } from './profile'
import { LandingNav } from './LandingNav'
import { SeoHead } from './SeoHead'
import { setActiveLenis } from './smoothScroll'
import { HeroSection } from './sections/HeroSection'
import { RecordSection } from './sections/RecordSection'
import { LifeGridSection } from './sections/LifeGridSection'
import { ReviewsSection } from './sections/ReviewsSection'
import { LandingFooter } from './sections/LandingFooter'
import { BookingSection } from './BookingSection'
import './landing.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null)

  /* Not from the CMS. The wordmark is the doctor's name, and the name is the
     entity every search engine resolves this site against — it must not be
     able to change to whatever a half-configured clinic-settings record
     happens to hold. */
  const wordmark = DOCTOR.shortName

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
          duration: 1.1,
          ease: 'expo.out',
          stagger: 0.09,
          delay: 0.15,
        })
        gsap.from('[data-hero-fade]', {
          y: 20,
          autoAlpha: 0,
          duration: 1,
          ease: 'power3.out',
          stagger: 0.12,
          delay: 0.55,
        })

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: 34,
            autoAlpha: 0,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          })
        })
        gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
          gsap.from(group.querySelectorAll('[data-reveal-item]'), {
            y: 28,
            autoAlpha: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.09,
            scrollTrigger: { trigger: group, start: 'top 84%', once: true },
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
    <div ref={root} className="landing-root min-h-dvh">
      <SeoHead />
      <div aria-hidden className="lp-grain" />
      <LandingNav wordmark={wordmark} />

      <main>
        <HeroSection />
        <RecordSection />
        <LifeGridSection />
        <ReviewsSection />

        <div data-reveal className="scroll-mt-[var(--nav-h)]">
          <BookingSection />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}

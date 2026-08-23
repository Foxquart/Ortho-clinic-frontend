/**
 * Dr. Arjun Mehta — personal brand landing page (the front door at `/`).
 *
 * Editorial luxury, life-first: warm paper grounds, deep teal accent,
 * Instrument Serif display over Inter, real lifestyle photography under a soft
 * filmic grade, paper grain, GSAP-driven motion over a single Lenis engine.
 * The page is ordered around the person — manifesto, events, life — with the
 * clinic and the booking flow as the quiet, always-reachable layer beneath.
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
import { usePublicClinic, usePublicDoctor } from '@/features/public/usePublicData'
import { LandingNav } from './LandingNav'
import { setActiveLenis } from './smoothScroll'
import { HeroSection } from './sections/HeroSection'
import { ManifestoSection } from './sections/ManifestoSection'
import { EventsSection } from './sections/EventsSection'
import { LifeGridSection } from './sections/LifeGridSection'
import { DoctorSection } from './sections/DoctorSection'
import { StoriesSection } from './sections/StoriesSection'
import { VisitSection } from './sections/VisitSection'
import { LandingFooter } from './sections/LandingFooter'
import { BookingSection } from './BookingSection'
import './landing.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null)
  const clinic = usePublicClinic()
  const doctor = usePublicDoctor()

  const wordmark = doctor.data?.full_name ?? clinic.data?.clinic_name ?? 'Dr. Arjun Mehta'

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
      <div aria-hidden className="lp-grain" />
      <LandingNav wordmark={wordmark} />

      <main>
        <HeroSection />
        <ManifestoSection />
        <EventsSection />
        <LifeGridSection />
        <DoctorSection />
        <StoriesSection />
        <VisitSection />

        <div data-reveal className="scroll-mt-[var(--nav-h)]">
          <BookingSection />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}

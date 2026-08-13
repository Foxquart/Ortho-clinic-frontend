/**
 * OrthoClinic — public landing page (the front door at `/`).
 *
 * Dark cinematic: Instrument Serif display over Inter, luminous petrol accent,
 * real photography under a filmic grade, film grain, GSAP-driven motion. The
 * page owns the Lenis smooth-scroll engine and the shared reveal choreography;
 * each section is an isolated component that only tags elements with
 * `data-reveal` / `data-hero-*` and lets this file animate them.
 *
 * MOTION CONTRACT: no element carries an `opacity: 0` baseline. Reveals run only
 * inside `(prefers-reduced-motion: no-preference)`; with reduced motion or no
 * JS, every section paints in its final, legible state.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import {
  usePublicClinic,
  usePublicDoctor,
  usePublicPortfolio,
} from '@/features/public/usePublicData'
import { LandingNav } from './LandingNav'
import { setActiveLenis } from './smoothScroll'
import { HeroSection } from './sections/HeroSection'
import { ServicesSection } from './sections/ServicesSection'
import { ApproachSection } from './sections/ApproachSection'
import { DoctorSection } from './sections/DoctorSection'
import { StoriesSection } from './sections/StoriesSection'
import { GallerySection } from './sections/GallerySection'
import { VisitSection } from './sections/VisitSection'
import { LandingFooter } from './sections/LandingFooter'
import { BookingSection } from './BookingSection'
import './landing.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null)
  const clinic = usePublicClinic()
  const doctor = usePublicDoctor()
  const portfolio = usePublicPortfolio()

  const stats = [
    { value: doctor.data?.experience_years ?? 15, suffix: '+', label: 'Years in practice' },
    { value: portfolio.data?.services?.length || 8, suffix: '', label: 'Procedures offered' },
    { value: portfolio.data?.testimonials?.length || 20, suffix: '+', label: 'Patients cared for' },
    { value: 96, suffix: '%', label: 'Would recommend' },
  ]

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
        gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
          const target = Number(el.dataset.count ?? '0')
          const suffix = el.dataset.suffix ?? ''
          const proxy = { v: 0 }
          gsap.to(proxy, {
            v: target,
            duration: 1.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
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
    <div ref={root} className="landing-root min-h-dvh">
      <div aria-hidden className="lp-grain" />
      <LandingNav wordmark={clinic.data?.clinic_name ?? 'OrthoClinic'} />

      <main>
        <HeroSection />

        {/* Trust stats — slim cinematic band with count-up */}
        <section className="border-y border-border" aria-label="At a glance">
          <div
            data-reveal-group
            className="mx-auto grid max-w-content grid-cols-2 divide-x divide-border lg:grid-cols-4"
          >
            {stats.map((s) => (
              <div key={s.label} data-reveal-item className="px-5 py-10 text-center sm:py-12">
                <div
                  data-count={s.value}
                  data-suffix={s.suffix}
                  data-numeric
                  className="lp-numeral lp-serif text-text text-[clamp(2.4rem,4vw,3.4rem)] leading-none"
                >
                  {s.value}
                  {s.suffix}
                </div>
                <div className="text-caption text-text-subtle mt-2">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        <ServicesSection />
        <ApproachSection />
        <DoctorSection />
        <StoriesSection />
        <GallerySection />
        <VisitSection />

        <div data-reveal className="scroll-mt-[var(--nav-h)]">
          <BookingSection />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}

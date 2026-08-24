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
import { StickyBookCta } from './StickyBookCta'
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
     happens to hold.

     The FULL name, not `shortName`: the wordmark and the hero headline are the
     two places the entity is stated, and they have to agree. "Dr. Deb Roy" in
     the nav over "Dr. Sankar Deb Roy" in the H1 reads as two different people
     to a crawler reconciling this practice across listings. */
  const wordmark = DOCTOR.name

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      /* Restores the original textContent of every `[data-countup]` element
         when the matchMedia context tears down — so a reduced-motion switch
         mid-scroll leaves the true figures on screen, never a frozen partial. */
      const countupRestores: Array<() => void> = []
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

        /* Image reveal — the photo wipes up from its own bottom edge rather
           than fading in. `clip-path` is the one non-transform property we
           animate: it is compositor-driven, it does not touch layout, and a
           fade on a large photograph reads as a loading state rather than a
           deliberate entrance.

           `gsap.from` matters here: the resting DOM state is an unclipped
           image, so with reduced motion or no JS the photo is simply visible. */
        gsap.utils.toArray<HTMLElement>('[data-reveal-clip]').forEach((el) => {
          gsap.from(el, {
            clipPath: 'inset(0 0 100% 0)',
            duration: 1.0,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          })
        })

        /* Count-up numerals. The final number is the element's own text, so
           this is progressive enhancement in the strictest sense: we read it,
           animate a scratch object up to it, and put the exact original
           string back on cleanup. Reduced motion and no-JS never run it and
           the correct figure was in the markup the whole time.

           The prefix/suffix capture is what lets `22+`, `4.0` and `2004` all
           work off one hook — only the digits move. */
        gsap.utils.toArray<HTMLElement>('[data-countup]').forEach((el) => {
          const source = el.textContent ?? ''
          const match = /^(\D*)(\d+(?:\.\d+)?)(\D*)$/.exec(source)
          if (!match) return

          const [, prefix, digits, suffix] = match
          const target = Number(digits)
          const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
          const counter = { value: 0 }

          gsap.to(counter, {
            value: target,
            duration: 0.9,
            ease: 'power3.out',
            snap: { value: decimals === 0 ? 1 : 10 ** -decimals },
            onUpdate: () => {
              el.textContent = prefix + counter.value.toFixed(decimals) + suffix
            },
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          })

          countupRestores.push(() => {
            el.textContent = source
          })
        })

        return () => {
          gsap.ticker.remove(raf)
          lenis.destroy()
          setActiveLenis(null)
          ScrollTrigger.getAll().forEach((t) => t.kill())
          countupRestores.forEach((restore) => restore())
          countupRestores.length = 0
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

        {/* No `scroll-mt` here: `#book` is on the <section> inside, so this
            wrapper is never an anchor target and an offset on it was dead. */}
        <div data-reveal>
          <BookingSection />
        </div>
      </main>

      <LandingFooter />
      <StickyBookCta />
    </div>
  )
}

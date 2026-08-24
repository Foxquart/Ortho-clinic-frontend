/**
 * What patients have said — the Google reviews, running horizontally.
 *
 * A marquee rather than a grid, for a reason that is about the content and not
 * the effect: most of these reviews have no written text. Nine cards in a
 * static grid, six of them holding only a name and a date, reads as a page
 * that ran out of material. The same nine drifting past reads as a queue of
 * people, which is what it is — and the whole point of including the silent
 * ones is the six-year span they cover.
 *
 * ## Where the data comes from
 *
 * `LIVE_REVIEWS`, not the raw `REVIEWS`: live Google data when the build-time
 * fetch has run (real per-review stars, real relative dates, real profile
 * photos), falling back to the hand-transcribed entries when it has not. Only
 * the fallback entries carry the assumed star counts described in
 * `profile.ts` — anything live is observed. `published()` still gates drafts.
 *
 * Avatars and `profileUrl` are optional and are absent until the fetch runs
 * with a key, so the no-photo path is the one that renders today: an initial
 * in Instrument Serif on an accent tint, used identically in the cards and in
 * the header stack, so the section reads as designed rather than as missing
 * its images.
 *
 * ## How it moves
 *
 * The track holds the list twice and is translated -50%, so the seam lands
 * where the duplicate begins and the loop is invisible. The duplicate is
 * `aria-hidden` — a screen reader hears each review once — and it also drops
 * the author links, because a focusable control inside `aria-hidden` is a
 * keyboard trap in everything but name.
 *
 * It pauses on hover and on keyboard focus — a moving block of text that
 * cannot be stopped is a WCAG 2.2.2 failure, not a flourish. Under reduced
 * motion the animation never starts and `.lp-marquee` becomes an ordinary
 * horizontal scroll region (see landing.css), which is also exactly what
 * happens if JavaScript never runs.
 *
 * The drift also leans into the page's scroll velocity (see the `useGSAP`
 * below): the wall speeds up as you scroll down, eases backwards as you scroll
 * up, and settles to its base speed at rest. That is the one piece of
 * spectacle on the page and it is still transform-only, still reduced-motion
 * gated, and still subordinate to the pause.
 *
 * ## How a card is built
 *
 * One object in two sizes, not two designs. Every card is three bands:
 *
 *   1. a **source rail** — the Google mark immediately followed by the stars,
 *      reading left to right as "Google: five". The mark used to float in the
 *      top-right corner with nothing to do; placed at the head of the rating it
 *      is the thing that certifies the rating, which is its only real job here.
 *   2. a **display line** in Instrument Serif — the card's most valuable datum.
 *      On a written review that is the sentence, in quotation marks, at a size
 *      that lets a patient's voice be the loudest thing in the band. On a
 *      silent review the reviewer's name takes that slot: what the card holds
 *      is a person and a score, so the person is set as the headline rather
 *      than demoted to a caption under an empty box.
 *   3. **attribution**, pinned to the bottom with `mt-auto`. Name at label
 *      weight, date as a tracked micro-caps stamp — two different registers
 *      instead of two near-identical lines. Where a reviewer has a public Maps
 *      profile the whole block is the link, which is also how it clears 44px.
 *
 * The cards share a height (the flex track stretches them, and a `min-h` keeps
 * the band from collapsing on short quotes). That is deliberate: in a
 * horizontal band the top and bottom edges are read as two continuous rules, so
 * ragged cards read as untidy rather than as variety. Equal heights plus a
 * bottom-pinned footer give the band two alignment lines — every source rail on
 * one, every name on the other — which is what makes it a wall rather than a
 * row of boxes.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { Star } from 'lucide-react'
import { CtaArrowUpRight } from '@/features/landing/primitives'
import {
  GOOGLE_PROFILE_URL,
  GOOGLE_RATING,
  LIVE_REVIEWS,
  published,
  type Review,
} from '@/features/landing/profile'
import { getActiveLenis } from '@/features/landing/smoothScroll'

gsap.registerPlugin(ScrollTrigger)

/** Seconds per full cycle, per card. Slow enough to read a card in passing. */
const SECONDS_PER_CARD = 6

/**
 * How many star icons take part in the entrance stagger. Only the first copy
 * of the list is tagged, and only the cards that can plausibly be on screen
 * when the section arrives — four cards at 60ms an icon is a beat, forty would
 * be a wait. Untagged stars are simply already in their final state, which is
 * the resting DOM state anyway.
 */
const STAGGERED_STARS = 20

/** Frames to keep looking for the Lenis instance before giving up (~1s). */
const LENIS_LOOKUP_FRAMES = 60

export function ReviewsSection() {
  const reviews = published(LIVE_REVIEWS)
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tween = useRef<gsap.core.Tween | null>(null)
  /* The delayed "return to base speed" call, held here so the pause handler
     can stop it reaching a marquee the reader has deliberately stopped. */
  const settle = useRef<gsap.core.Tween | null>(null)
  /* Mirrors the marquee's paused state for the velocity handler. A ref, not
     state: it is read inside a Lenis callback that must never re-render. */
  const paused = useRef(false)

  useGSAP(
    () => {
      const track = trackRef.current
      if (!track || reviews.length === 0) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const drift = gsap.to(track, {
          xPercent: -50,
          ease: 'none',
          duration: reviews.length * SECONDS_PER_CARD,
          repeat: -1,
        })
        tween.current = drift

        /* Entrance: the stars fill in as the section arrives. `gsap.from`, so
           the DOM's resting state is the finished row — nothing here relies on
           a CSS opacity baseline. */
        const stars = gsap.utils
          .toArray<HTMLElement>('[data-star]', track)
          .slice(0, STAGGERED_STARS)
        if (stars.length > 0) {
          gsap.from(stars, {
            autoAlpha: 0,
            scale: 0.6,
            transformOrigin: '50% 50%',
            duration: 0.5,
            ease: 'power3.out',
            stagger: 0.06,
            scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', once: true },
          })
        }

        /* --- scroll-velocity coupling ------------------------------------
           Lenis reports a per-frame velocity; it drives the drift's own
           timeScale rather than any second transform, so there is exactly one
           thing animating the track and the loop seam stays exact.

           Three things keep this from fighting the pause: while paused we do
           not tween at all, resuming resets the rate to base, and the settle
           call guarantees a return to 1 even if the last scroll frame reported
           a non-zero velocity. */
        const settleCall = gsap.delayedCall(0.5, () => {
          gsap.to(drift, { timeScale: 1, duration: 0.6, ease: 'power3.out', overwrite: true })
        })
        settleCall.pause()
        settle.current = settleCall

        const onScroll = ({ velocity }: Lenis) => {
          if (paused.current) return
          gsap.to(drift, {
            timeScale: 1 + gsap.utils.clamp(-3, 3, velocity / 8),
            overwrite: true,
            duration: 0.4,
            ease: 'power3.out',
          })
          settleCall.restart(true)
        }

        /* LandingPage registers the instance in its own layout effect, and
           React runs a child's effects first — so at this point it is normally
           still null. Look again each frame until it appears; under reduced
           motion this branch never runs, and if the engine never registers we
           simply stop asking and the marquee keeps its constant rate. */
        let unsubscribe: (() => void) | null = null
        let frame = 0
        let attempts = 0
        const attach = () => {
          const lenis: Lenis | null = getActiveLenis()
          if (lenis) {
            unsubscribe = lenis.on('scroll', onScroll)
            return
          }
          if (attempts++ < LENIS_LOOKUP_FRAMES) frame = requestAnimationFrame(attach)
        }
        attach()

        return () => {
          cancelAnimationFrame(frame)
          unsubscribe?.()
          settleCall.kill()
          settle.current = null
          gsap.killTweensOf(drift)
          drift.kill()
          tween.current = null
        }
      })
      return () => mm.revert()
    },
    { scope: sectionRef, dependencies: [reviews.length] },
  )

  if (reviews.length === 0) return null

  const pause = () => {
    paused.current = true
    const drift = tween.current
    if (!drift) return
    /* Kill any in-flight rate tween first: it would keep writing timeScale to
       a stopped tween, and the value it left behind would be whatever the last
       scroll frame happened to say. */
    settle.current?.pause()
    gsap.killTweensOf(drift)
    drift.pause()
  }

  const resume = () => {
    paused.current = false
    const drift = tween.current
    if (!drift) return
    drift.timeScale(1)
    drift.resume()
  }

  const rating = GOOGLE_RATING.rating.toFixed(1)
  const stackFaces = reviews.slice(0, 5)

  return (
    <section
      ref={sectionRef}
      id="reviews"
      className="scroll-mt-[var(--lp-anchor-offset)] py-[var(--section-pad)]"
    >
      <div className="max-w-content mx-auto mb-12 px-5 sm:px-8 md:mb-14">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between md:gap-12">
          <h2 data-reveal className="lp-h2 max-w-[14ch]">
            What people have said.
          </h2>

          {/* The aggregate, as one object and one link. §2.8: the curated
              selection is only honest because the true average and the count
              are stated here and the profile — negative review included — is
              one tap away. This block never comes out. */}
          <a
            data-reveal
            href={GOOGLE_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            className="group mt-8 flex shrink-0 flex-col gap-3 md:mt-0 md:items-end md:text-right"
          >
            <AvatarStack reviews={stackFaces} />

            <div className="flex items-center gap-4 md:justify-end">
              <span
                data-countup
                className="lp-serif lp-numeral text-text block text-[clamp(3rem,6vw,5rem)] leading-[0.85]"
              >
                {rating}
              </span>
              <Stars count={Math.round(GOOGLE_RATING.rating)} size="lg" />
            </div>

            <p className="text-body text-text-muted max-w-[24ch] md:max-w-none">
              from{' '}
              <span data-countup className="lp-numeral text-text font-medium">
                {GOOGLE_RATING.count}
              </span>{' '}
              verified Google reviews
            </p>

            <span className="text-label text-text inline-flex items-center gap-1.5 font-medium">
              <span className="lp-link-draw">Read them on Google</span>
              <CtaArrowUpRight />
            </span>
          </a>
        </div>
      </div>

      {/* Full-bleed: the track should run past the content measure on both
          sides, otherwise the loop reads as a carousel with edges. */}
      <div
        className="lp-marquee"
        onPointerEnter={pause}
        onPointerLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={resume}
      >
        {/* `items-stretch`: the track is a flex row, so this is what makes
            every card share the tallest card's height. See the header — the
            band's top and bottom edges are load-bearing. */}
        <div ref={trackRef} className="lp-marquee-track items-stretch px-5 sm:px-8">
          {reviews.map((review) => (
            <ReviewCard key={review.author} review={review} />
          ))}
          {reviews.map((review) => (
            <ReviewCard key={`echo-${review.author}`} review={review} echo />
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * The overlapping faces above the numeral.
 *
 * One code path for photos and monograms rather than two, and no "is anyone
 * photographed?" branch: a stack of initials is a deliberate-looking object,
 * five empty rings are a bug, and a half-and-half stack — which is what the
 * live data will actually produce, since Google returns a photo for some
 * reviewers and not others — has to look right regardless. So the fallback is
 * not a fallback here; it is the same component in its no-photo state.
 *
 * `aria-hidden`, because it says nothing the numeral and the count beneath it
 * do not already say.
 */
function AvatarStack({ reviews }: { reviews: readonly Review[] }) {
  if (reviews.length === 0) return null
  return (
    <div aria-hidden className="flex -space-x-3 md:justify-end">
      {reviews.map((review) => (
        <ReviewAvatar key={review.author} review={review} ring="ring-2 ring-bg" />
      ))}
    </div>
  )
}

/**
 * A photo when one downloaded, otherwise the author's initial in Instrument
 * Serif on the accent tint. Fixed `width`/`height` matching the rendered box so
 * the row never reflows when the image lands (§7.1).
 *
 * Three sizes, one object: 40px in the header stack, 36px in a written card's
 * attribution, 44px where it leads a silent card. The monogram is not a
 * fallback — with no photos in the data it is what actually renders — so it
 * gets real drawing: an inset accent hairline rather than the neutral border
 * used elsewhere, and the letter nudged a hair below centre. A serif capital's
 * optical centre sits above its geometric one, so a letter centred by the box
 * reads as floating high in the circle.
 *
 * `alt=""`: the author's name is already adjacent text, so the photo is
 * decorative and announcing it twice helps nobody.
 */
const AVATAR_SIZES = {
  36: { box: 'size-9', px: 36, type: 'text-[1.05rem]' },
  40: { box: 'size-10', px: 40, type: 'text-[1.15rem]' },
  44: { box: 'size-11', px: 44, type: 'text-[1.3rem]' },
} as const

function ReviewAvatar({
  review,
  ring,
  size = 40,
}: {
  review: Review
  ring: string
  size?: keyof typeof AVATAR_SIZES
}) {
  const initial = review.author.trim().charAt(0).toUpperCase()
  const { box, px, type } = AVATAR_SIZES[size]

  if (review.avatar) {
    return (
      <img
        src={review.avatar}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={`${box} shrink-0 rounded-full object-cover ${ring}`}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`grid bg-[color:var(--lp-accent-tint)] ${box} shrink-0 place-items-center rounded-full ${ring}`}
    >
      <span
        className={`lp-serif text-[color:var(--lp-accent)] ${type} translate-y-px leading-none`}
      >
        {initial}
      </span>
    </span>
  )
}

/**
 * The Google "G". Reproduced in its official four brand colours because it is
 * a trademark and a recoloured one is a misrepresentation — this is the single
 * exception to the token-only colour rule, and it exists to tell the reader
 * these are Google reviews rather than testimonials we wrote.
 *
 * It sits at the head of the star rail, sized to the stars, so the row reads as
 * one statement: *Google, five stars*. Pinned in a corner at 14px it was a
 * sticker on the card; in front of the rating it is the attribution for it.
 */
function GoogleGlyph() {
  return (
    <svg
      role="img"
      aria-label="Google review"
      viewBox="0 0 48 48"
      width="16"
      height="16"
      focusable="false"
      className="shrink-0"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}

/**
 * The date, as a tracked micro-caps stamp rather than a second sentence.
 *
 * Name and date used to be two stacked lines a pixel apart in size and a shade
 * apart in colour, which made them compete. Dropping the date to 11px small
 * caps in the subtle ink separates them by register, not just by weight, and
 * the result reads as a filing stamp under a signature — which is what a review
 * date is.
 */
function ReviewDate({ when }: { when: string }) {
  return (
    <div className="text-text-subtle mt-1 text-[0.6875rem] leading-none font-medium tracking-[0.14em] uppercase">
      {when}
    </div>
  )
}

/**
 * Face, name and date as one block — and, where the reviewer has a public Maps
 * profile, as one link.
 *
 * Linking the whole block rather than the name alone is both the better target
 * (the block clears 44px on its own, where a 13px line of text does not) and
 * the better object: the thing you are following is the person, not the string.
 *
 * `nameClass` is what makes the two card shapes one family. On a written card
 * the name is a caption under someone else's sentence, so it is set at label
 * weight; on a silent card there is no sentence and the person is the content,
 * so the same field takes the serif display slot. Same block, same order, same
 * spacing — one line of type promoted.
 */
function ReviewAttribution({
  review,
  echo,
  size,
  nameClass,
}: {
  review: Review
  echo?: boolean
  size: 36 | 44
  nameClass: string
}) {
  const stacked = size === 44
  /* The echo copy is `aria-hidden`; a link inside it would still take focus,
     which is the one thing an aria-hidden subtree must never contain. */
  const linked = Boolean(review.profileUrl) && !echo

  const body = (
    <>
      <ReviewAvatar
        review={review}
        ring="ring-1 ring-inset ring-[color:var(--lp-accent-line)]"
        size={size}
      />
      <div className={stacked ? 'mt-4 min-w-0' : 'min-w-0'}>
        <div className={nameClass}>
          {/* The draw rule is on an inline span, not the block: `lp-link-draw`
              spans its own inline box, and on a block it would underline the
              column rather than the name. */}
          <span className={linked ? 'lp-link-draw' : undefined}>{review.author}</span>
        </div>
        <ReviewDate when={review.when} />
      </div>
    </>
  )

  const layout = stacked ? 'flex flex-col items-start' : 'flex items-center gap-3'

  if (!linked) return <div className={layout}>{body}</div>

  return (
    <a href={review.profileUrl} target="_blank" rel="noreferrer" className={`group ${layout}`}>
      {body}
    </a>
  )
}

/**
 * Google mark, then the stars. The card's provenance and its score on one line,
 * in that order, because the second is only worth anything given the first.
 */
function SourceRail({ review, echo }: { review: Review; echo?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <GoogleGlyph />
      <Stars count={review.stars} size="sm" reveal={!echo} />
    </div>
  )
}

/**
 * Chrome shared by both shapes: the hairline border the lift animates, the
 * paper surface, the shared minimum height, and the column that pins
 * attribution to the floor of the card.
 *
 * The border is not decoration — `.lp-card-lift` only tweens `border-color`, so
 * a card without one has nothing to light up on hover.
 */
const CARD_CHROME =
  'lp-card-lift border-border bg-surface flex shrink-0 flex-col rounded-3xl border p-6 sm:p-7 min-h-[13.5rem] sm:min-h-[14.5rem]'

/**
 * Two sizes of one object. See the header for the three-band anatomy; what
 * differs between them is only which field is promoted into the serif slot.
 *
 * Only the first copy's stars are tagged `data-star`; the echo's are not, so
 * the entrance stagger touches each review once.
 */
function ReviewCard({ review, echo }: { review: Review; echo?: boolean }) {
  const hidden = echo ? true : undefined

  /* A silent review. The reviewer left a face, a score and a date, so those are
     what the card is made of — the name takes the serif slot the quote holds on
     the wide card. Nothing is missing from it; it is simply a smaller card
     about a person rather than a sentence, which is why it keeps the same rail,
     the same monogram and the same floor line as its larger sibling. */
  if (!review.text) {
    return (
      <figure aria-hidden={hidden} className={`${CARD_CHROME} w-[14rem] sm:w-[16rem]`}>
        <SourceRail review={review} echo={echo} />
        <figcaption className="mt-auto pt-8">
          <ReviewAttribution
            review={review}
            echo={echo}
            size={44}
            nameClass="lp-serif text-text text-[1.25rem] leading-[1.15]"
          />
        </figcaption>
      </figure>
    )
  }

  /* A written review. The sentence is the most valuable thing in the section
     and the one place on the page where a voice other than the practice's
     speaks, so it takes the display face at display scale — set in real
     quotation marks, which is both correct typography for a quotation and the
     cheapest possible signal that these are someone else's words. */
  return (
    <figure aria-hidden={hidden} className={`${CARD_CHROME} w-[19rem] sm:w-[22rem]`}>
      <SourceRail review={review} echo={echo} />
      <blockquote className="lp-serif text-text mt-5 text-[1.15rem] leading-[1.45] text-pretty sm:text-[1.4rem] sm:leading-[1.36]">
        {`“${review.text}”`}
      </blockquote>
      <figcaption className="mt-auto pt-7">
        <ReviewAttribution
          review={review}
          echo={echo}
          size={36}
          nameClass="text-label text-text font-semibold"
        />
      </figcaption>
    </figure>
  )
}

/** Five stars, the earned ones filled. Announced as text, not as five icons. */
function Stars({ count, size, reveal }: { count: number; size: 'sm' | 'lg'; reveal?: boolean }) {
  const dimension = size === 'lg' ? 'size-6' : 'size-4'
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          data-star={reveal ? '' : undefined}
          strokeWidth={1.5}
          className={
            dimension +
            (i < count ? ' fill-current text-[color:var(--lp-accent)]' : ' text-border-strong')
          }
        />
      ))}
    </div>
  )
}

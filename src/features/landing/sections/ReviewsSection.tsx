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
 * ## How it moves
 *
 * The track holds the list twice and is translated -50%, so the seam lands
 * where the duplicate begins and the loop is invisible. The duplicate is
 * `aria-hidden`, so a screen reader hears each review once.
 *
 * It pauses on hover and on keyboard focus — a moving block of text that
 * cannot be stopped is a WCAG 2.2.2 failure, not a flourish. Under reduced
 * motion the animation never starts and `.lp-marquee` becomes an ordinary
 * horizontal scroll region (see landing.css), which is also exactly what
 * happens if JavaScript never runs.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ArrowUpRight, Quote, Star } from 'lucide-react'
import { GOOGLE_RATING, PRESENCE, REVIEWS, published, type Review } from '@/features/landing/profile'

/** Seconds per full cycle, per card. Slow enough to read a card in passing. */
const SECONDS_PER_CARD = 6

export function ReviewsSection() {
  const reviews = published(REVIEWS)
  const trackRef = useRef<HTMLDivElement>(null)
  const tween = useRef<gsap.core.Tween | null>(null)

  useGSAP(
    () => {
      const track = trackRef.current
      if (!track || reviews.length === 0) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        tween.current = gsap.to(track, {
          xPercent: -50,
          ease: 'none',
          duration: reviews.length * SECONDS_PER_CARD,
          repeat: -1,
        })
        return () => {
          tween.current?.kill()
          tween.current = null
        }
      })
      return () => mm.revert()
    },
    { scope: trackRef, dependencies: [reviews.length] },
  )

  if (reviews.length === 0) return null

  const pause = () => tween.current?.pause()
  const resume = () => tween.current?.resume()

  return (
    <section id="reviews" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto mb-12 max-w-content px-5 sm:px-8 md:mb-14">
        <h2 data-reveal className="lp-h2 max-w-[18ch]">
          What people have said.
        </h2>
        <a
          data-reveal
          href={PRESENCE.googleBusinessProfile.url}
          target="_blank"
          rel="noreferrer"
          className="text-body text-text-muted group mt-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 underline-offset-4 transition-colors duration-fast hover:text-text"
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-text">
            <Star aria-hidden className="size-4 fill-current text-[color:var(--lp-accent)]" />
            {GOOGLE_RATING.rating.toFixed(1)}
          </span>
          <span>from {GOOGLE_RATING.count} Google reviews</span>
          <ArrowUpRight
            aria-hidden
            className="size-4 transition-transform duration-fast group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </a>
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
        <div ref={trackRef} className="lp-marquee-track px-5 sm:px-8">
          {reviews.map((review) => (
            <ReviewCard key={review.author} review={review} />
          ))}
          {reviews.map((review) => (
            <ReviewCard key={`echo-${review.author}`} review={review} aria-hidden />
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Two shapes, because the source data has two shapes.
 *
 * A written review gets the quote mark and the words. A rating with no text
 * gets its stars in the space the words would have occupied — that is what the
 * reviewer actually left, so it is what the card should show, and a row of
 * stars carries across a moving marquee far better than a sentence explaining
 * an absence.
 *
 * The star counts themselves are assumed rather than observed; see the `stars`
 * field in `profile.ts` for why that matters and what to do about it.
 */
function ReviewCard({ review, ...rest }: { review: Review } & { 'aria-hidden'?: boolean }) {
  if (!review.text) {
    return (
      <figure
        {...rest}
        className="border-border bg-surface/50 flex w-[13rem] shrink-0 flex-col justify-between rounded-3xl border p-6 sm:w-[15rem]"
      >
        <Stars count={review.stars} size="lg" />
        <figcaption className="border-border mt-6 border-t pt-4">
          <div className="text-label text-text font-semibold">{review.author}</div>
          <div className="text-caption text-text-subtle mt-0.5">{review.when}</div>
        </figcaption>
      </figure>
    )
  }

  return (
    <figure
      {...rest}
      className="border-border bg-surface flex w-[19rem] shrink-0 flex-col justify-between rounded-3xl border p-6 sm:w-[22rem]"
    >
      <div>
        <Quote aria-hidden strokeWidth={1.5} className="size-6 text-[color:var(--lp-accent)]" />
        <blockquote className="text-body text-text mt-3 leading-relaxed text-pretty">
          {review.text}
        </blockquote>
      </div>

      <figcaption className="border-border mt-6 border-t pt-4">
        <Stars count={review.stars} size="sm" />
        <div className="text-label text-text mt-2.5 font-semibold">{review.author}</div>
        <div className="text-caption text-text-subtle mt-0.5">{review.when}</div>
      </figcaption>
    </figure>
  )
}

/** Five stars, the earned ones filled. Announced as text, not as five icons. */
function Stars({ count, size }: { count: number; size: 'sm' | 'lg' }) {
  const dimension = size === 'lg' ? 'size-6' : 'size-4'
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          strokeWidth={1.5}
          className={
            dimension +
            (i < count
              ? ' fill-current text-[color:var(--lp-accent)]'
              : ' text-border-strong')
          }
        />
      ))}
    </div>
  )
}

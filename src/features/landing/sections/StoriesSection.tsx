/**
 * Patient stories — a quiet grid of published testimonials.
 *
 * Reads straight from the public portfolio CMS. `sortedTestimonials` already
 * drops unpublished rows and honours `sort_order`, so a half-filled CMS
 * degrades cleanly; with nothing published the section renders nothing at all
 * rather than an empty heading.
 *
 * MOTION CONTRACT (see landing.css): nothing here carries an `opacity: 0`
 * baseline. The `data-reveal` heading and the `data-reveal-group` /
 * `data-reveal-item` grid are revealed by the PAGE-level GSAP, only inside the
 * `(prefers-reduced-motion: no-preference)` branch — so with reduced motion, or
 * if JS never runs, every card paints in its final, legible state.
 */
import { Quote } from 'lucide-react'
import { StarRating } from '@/features/landing/primitives'
import { sortedTestimonials } from '@/features/public/content'
import { usePublicPortfolio } from '@/features/public/usePublicData'

/**
 * Prototype-only placeholder stories, used to top the grid up to six while the
 * CMS holds only a couple of real ones. CMS testimonials always render first;
 * each real one added later displaces a placeholder. Remove for production.
 */
const PLACEHOLDER_STORIES = [
  {
    id: 'ph-1',
    author_name: 'Sharmila Banerjee',
    author_role: 'School teacher, Kolkata',
    content:
      'Both knees replaced in one winter. By March I was back on my feet for a full school day without sitting down once.',
    rating: 5,
  },
  {
    id: 'ph-2',
    author_name: 'Vikram Deshpande',
    author_role: 'Marathon runner',
    content:
      'ACL reconstruction and eight months of honest rehab. Ran my first half marathon since the injury this January.',
    rating: 5,
  },
  {
    id: 'ph-3',
    author_name: 'Farida Ansari',
    author_role: 'Retired banker',
    content:
      'Years of shoulder pain, gone after one small procedure. I only wish I had come in sooner instead of managing it.',
    rating: 4,
  },
  {
    id: 'ph-4',
    author_name: 'Joydeep Sen',
    author_role: 'Businessman',
    content:
      'A badly set wrist fracture from years ago, corrected properly this time. Clear explanations at every step.',
    rating: 5,
  },
] as const

export function StoriesSection() {
  const portfolio = usePublicPortfolio()
  const fromCms = sortedTestimonials(portfolio.data?.testimonials)
  const testimonials = [...fromCms, ...PLACEHOLDER_STORIES.slice(0, Math.max(0, 6 - fromCms.length))].slice(0, 6)

  if (testimonials.length === 0) return null

  return (
    <section id="stories" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <h2 data-reveal className="lp-h2 mb-12 max-w-[16ch]">
          Movement, given back.
        </h2>

        <div data-reveal-group className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.id}
              data-reveal-item
              className="flex flex-col rounded-2xl border border-border bg-surface/60 p-6"
            >
              <Quote
                aria-hidden
                strokeWidth={1.5}
                className="size-7 text-[color:var(--lp-accent)]"
              />
              <blockquote className="mt-3 line-clamp-4 flex-1 text-pretty text-body leading-relaxed text-text">
                {t.content}
              </blockquote>
              <figcaption className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                <div>
                  <div className="text-label font-semibold text-text">{t.author_name}</div>
                  {t.author_role && (
                    <div className="text-caption text-text-subtle">{t.author_role}</div>
                  )}
                </div>
                <StarRating rating={t.rating} />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Life — the asymmetric bento of everything that is not the clinic.
 *
 * Six tiles, each a photograph with a short caption and a quiet label. The grid
 * mixes one oversized tile, two medium and three small so the rhythm never
 * settles into repetition. On mobile it collapses to a single column.
 *
 * Every tile is currently a draft: we know nothing about what Dr. Deb Roy does
 * outside the clinic, and inventing it on a real person's site is not an option
 * we have. So the section renders in development, where it is useful for
 * judging the layout, and disappears entirely from a production build until the
 * tiles in `profile.ts` are replaced with six real things and six real
 * photographs. This is the section that most needs an afternoon with him.
 *
 * MOTION CONTRACT (see landing.css): `data-reveal` and `data-reveal-clip` are
 * the hooks the page's GSAP reads. The tiles take the clip reveal rather than
 * the group fade — six photographs fading up together read as six images
 * still loading, where a wipe from the bottom edge reads as a deliberate
 * entrance, and the tiles enter at different scroll depths anyway so the
 * cascade comes free. It is a `gsap.from`, so the resting DOM state is an
 * unclipped tile. Hover zoom is a plain CSS transform, disabled under reduced
 * motion.
 */
import { img } from '@/features/landing/imagery'
import { DraftChip } from '@/features/landing/primitives'
import { LIFE, published, type LifeTile } from '@/features/landing/profile'

const SPAN_CLASS: Record<LifeTile['span'], string> = {
  large: 'aspect-[4/5] sm:col-span-2 sm:row-span-2 sm:aspect-auto',
  medium: 'aspect-[4/3] sm:aspect-auto sm:min-h-[16rem]',
  small: 'aspect-square sm:aspect-auto sm:min-h-[16rem]',
}

export function LifeGridSection() {
  const tiles = published(LIFE)
  if (tiles.length === 0) return null

  return (
    <section id="life" className="scroll-mt-[var(--lp-anchor-offset)] py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="mb-12 md:mb-16">
          <h2 data-reveal className="lp-h2 max-w-[20ch]">
            Away from the hospital, the days fill up anyway.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:grid-rows-[repeat(2,minmax(16rem,auto))] lg:gap-5">
          {tiles.map((tile) => (
            <figure
              key={tile.key}
              data-reveal-clip
              className={
                'lp-media group relative overflow-hidden rounded-3xl ' + SPAN_CLASS[tile.span]
              }
            >
              <img
                src={img(tile.key, { w: tile.span === 'large' ? 1200 : 800 })}
                alt={tile.alt}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div className="lp-scrim pointer-events-none absolute inset-0" />
              {tile.draft && <DraftChip className="absolute right-4 top-4 z-10" />}
              <figcaption className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 p-5 sm:p-6">
                <span className="text-caption font-semibold uppercase tracking-[0.16em] text-[color:var(--lp-accent-strong)]">
                  {tile.label}
                </span>
                <span className="text-body font-medium text-[color:var(--lp-accent-fg)] text-balance">
                  {tile.caption}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

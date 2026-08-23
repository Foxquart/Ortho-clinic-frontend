/**
 * Life — the asymmetric bento of everything that is not the clinic.
 *
 * Six tiles, each a real photograph with a short caption and a quiet label.
 * The grid mixes one oversized tile, two medium, and three small so the rhythm
 * never settles into repetition. On mobile it collapses to a single column
 * with generous gaps.
 *
 * MOTION CONTRACT (see landing.css): `data-reveal` and `data-reveal-group` /
 * `data-reveal-item` are the hooks the page's GSAP reads. Hover zoom is a
 * plain CSS transform, disabled under reduced motion.
 */
import { img } from '@/features/landing/imagery'
import type { PhotoKey } from '@/features/landing/imagery'

interface LifeTile {
  key: PhotoKey
  label: string
  caption: string
  alt: string
  span: 'large' | 'medium' | 'small'
}

const TILES: LifeTile[] = [
  {
    key: 'cycling',
    label: 'Two wheels',
    caption: 'Sunday centuries along the old highway, coffee stop included.',
    alt: 'A road bicycle leaning against a wall in morning light.',
    span: 'large',
  },
  {
    key: 'photography',
    label: 'Through the lens',
    caption: 'Street frames and slow architecture walks.',
    alt: 'A camera held up against a city street.',
    span: 'medium',
  },
  {
    key: 'travel',
    label: 'Elsewhere',
    caption: 'New cities, new food, the same running shoes.',
    alt: 'A window view over rooftops in a hillside town.',
    span: 'medium',
  },
  {
    key: 'coffee',
    label: 'Slow mornings',
    caption: 'A pour-over ritual before the first patient.',
    alt: 'Coffee being poured slowly into a ceramic cup.',
    span: 'small',
  },
  {
    key: 'reading',
    label: 'On the shelf',
    caption: 'Mostly essays, some poetry, one thriller a year.',
    alt: 'An open book resting on a linen cloth.',
    span: 'small',
  },
  {
    key: 'family',
    label: 'Home crowd',
    caption: 'The people who hear about every conference twice.',
    alt: 'A family walking together in a park.',
    span: 'small',
  },
]

const SPAN_CLASS: Record<LifeTile['span'], string> = {
  large: 'aspect-[4/5] sm:col-span-2 sm:row-span-2 sm:aspect-auto',
  medium: 'aspect-[4/3] sm:aspect-auto sm:min-h-[16rem]',
  small: 'aspect-square sm:aspect-auto sm:min-h-[16rem]',
}

export function LifeGridSection() {
  return (
    <section id="life" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="mb-12 md:mb-16">
          <h2 data-reveal className="lp-h2 max-w-[20ch]">
            Outside the clinic, the days fill up quickly.
          </h2>
        </div>

        <div data-reveal-group className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:grid-rows-[repeat(2,minmax(16rem,auto))] lg:gap-5">
          {TILES.map((tile) => (
            <figure
              key={tile.key}
              data-reveal-item
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

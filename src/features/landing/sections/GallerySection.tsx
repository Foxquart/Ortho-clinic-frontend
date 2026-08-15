/**
 * Gallery — a bento of real photographs from the doctor's life and work.
 *
 * Prefers the clinic's own uploaded, published gallery (served through
 * `resolveApiUrl`); when the CMS has none it falls back to the curated stock
 * set in `imagery.ts`, so the section is never empty and never broken. The
 * first tile is deliberately oversized for a bento rhythm; every image sits in
 * a filmic `.lp-media` frame and zooms a touch within that frame on hover.
 *
 * MOTION CONTRACT (see landing.css): nothing here carries an `opacity: 0`
 * baseline. The `data-reveal` heading and `data-reveal-group` /
 * `data-reveal-item` tiles are revealed by the PAGE-level GSAP, only inside the
 * `(prefers-reduced-motion: no-preference)` branch. The hover zoom is a plain
 * CSS transform, disabled under reduced motion.
 */
import { resolveApiUrl } from '@/api/http'
import { LIFE_GALLERY, img } from '@/features/landing/imagery'
import type { PhotoKey } from '@/features/landing/imagery'
import { sortedGallery } from '@/features/public/content'
import { usePublicPortfolio } from '@/features/public/usePublicData'

interface Tile {
  key: string
  src: string
  alt: string
}

/* Descriptive alt text for the curated life-gallery fallback set. */
const STOCK_ALT: Partial<Record<PhotoKey, string>> = {
  speaking: 'Dr. Mehta speaking at a medical conference',
  travel: 'Travelling: a mountain road at first light',
  cycling: 'A morning ride on the cycle',
  coffee: 'A quiet coffee between clinics',
  photography: 'Out with the camera at golden hour',
  family: 'Family time away from the clinic',
}

export function GallerySection() {
  const portfolio = usePublicPortfolio()
  const published = sortedGallery(portfolio.data?.gallery)

  // Prefer the clinic's own uploads; fall back to the curated stock set so the
  // wall of photos is never empty.
  const tiles: Tile[] =
    published.length > 0
      ? published.slice(0, 6).map((image) => ({
          key: image.id,
          src: resolveApiUrl(image.image_url),
          alt: image.alt_text ?? image.caption ?? 'A photograph from inside the clinic',
        }))
      : LIFE_GALLERY.map((photo: PhotoKey) => ({
          key: photo,
          src: img(photo, { w: 900, h: 900 }),
          alt: STOCK_ALT[photo] ?? 'A moment from life outside the clinic',
        }))

  return (
    <section id="gallery" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <h2 data-reveal className="lp-h2 mb-10 max-w-[16ch]">
          Life, in motion.
        </h2>

        <div data-reveal-group className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile, i) => (
            <figure
              key={tile.key}
              data-reveal-item
              className={
                'lp-media group rounded-xl ' +
                (i === 0
                  ? 'aspect-square sm:aspect-auto sm:col-span-2 sm:row-span-2'
                  : 'aspect-square')
              }
            >
              <img
                src={tile.src}
                alt={tile.alt}
                loading="lazy"
                decoding="async"
                className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

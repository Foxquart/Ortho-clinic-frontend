/**
 * Gallery — a bento of real photographs from inside the clinic.
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
import { GALLERY_PHOTOS, img } from '@/features/landing/imagery'
import type { PhotoKey } from '@/features/landing/imagery'
import { sortedGallery } from '@/features/public/content'
import { usePublicPortfolio } from '@/features/public/usePublicData'

interface Tile {
  key: string
  src: string
  alt: string
}

/* Descriptive alt text for the curated stock fallback set. */
const STOCK_ALT: Partial<Record<PhotoKey, string>> = {
  clinic: 'The clinic reception and waiting area',
  scan: 'Diagnostic imaging inside the clinic',
  physio: 'A physiotherapy and rehabilitation session',
  team: 'The clinical care team',
  strength: 'Strength and conditioning for recovery',
  hospital: 'The clinic building and facilities',
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
      : GALLERY_PHOTOS.map((photo) => ({
          key: photo,
          src: img(photo, { w: 900, h: 900 }),
          alt: STOCK_ALT[photo] ?? 'A photograph from inside the clinic',
        }))

  return (
    <section id="gallery" className="scroll-mt-[var(--nav-h)] pb-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <h2 data-reveal className="lp-h2 mb-10 max-w-[16ch]">
          Inside the clinic.
        </h2>

        <div data-reveal-group className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile, i) => (
            <figure
              key={tile.key}
              data-reveal-item
              className={
                'lp-media group rounded-xl ' +
                (i === 0 ? 'col-span-2 row-span-2' : 'aspect-square')
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

/**
 * Placeholder photography for the landing page.
 *
 * Every URL below is stock. None of it is Dr. Deb Roy, his clinic, or Tripura,
 * and all of it is meant to be replaced — the portrait keys by real photographs
 * uploaded through the CMS, the rest by a single afternoon with a camera. The
 * keys are named for what the photograph should *be*, not for what the stock
 * image happens to show, so swapping in the real ones is a one-line change per
 * key and nothing downstream moves.
 *
 * Real photographs are not a nicety here. Original images of the doctor, the
 * clinic frontage and the consulting room are a local search signal in their
 * own right, they carry the alt text that names him and the city, and they are
 * the same asset set the Google Business Profile needs.
 *
 * `img()` appends sizing and format params so the browser gets an
 * appropriately sized, auto-formatted asset rather than the full original.
 */
/**
 * The one real photograph we have: Dr. Deb Roy in his consulting room, with
 * the AO/OTA long-bone fracture chart on the wall behind him. It arrived as a
 * front-camera selfie, so it was mirrored — the chart read backwards — and has
 * been flipped back and re-encoded at two widths. The filename is deliberately
 * descriptive: image filenames are a real, if small, local search signal, and
 * this is the only asset on the page that is genuinely his.
 *
 * Everything else here is stock and is only ever used illustratively, never
 * captioned or alt-texted as though it were him or his clinic.
 */
export const PORTRAIT = {
  src: '/dr-sankar-deb-roy-orthopaedic-surgeon-agartala.jpg',
  srcSet:
    '/dr-sankar-deb-roy-orthopaedic-surgeon-agartala-720.jpg 720w, /dr-sankar-deb-roy-orthopaedic-surgeon-agartala.jpg 1440w',
  width: 1440,
  height: 1920,
  alt: 'Dr. Sankar Deb Roy, orthopaedic surgeon, in his consulting room in Agartala, Tripura.',
} as const

const BASE = 'https://images.unsplash.com/'

const PHOTO = {
  /** Hero — the doctor, natural light, no clinical staging. */
  heroPortrait: 'photo-1622253692010-333f2da6031d',
  /** About — a second, quieter portrait. */
  portrait: 'photo-1612349317150-e413f6a5b16d',

  /* The record — training, teaching, published work. */
  teaching: 'photo-1576091160550-2173dba999ef',
  reading: 'photo-1512820790803-83ca734da794',

  /* Life outside the clinic. */
  landscape: 'photo-1470071459604-3b5ec3a7fe05',
  garden: 'photo-1466692476868-aef1dfb1e735',
  community: 'photo-1559757148-5c350d0d3c56',
  family: 'photo-1511895426328-dc8714191300',

  /* Clinic — kept to the minimum the page actually uses. */
  clinicSpace: 'photo-1631815588090-d4bfec5b1ccb',
} as const

export type PhotoKey = keyof typeof PHOTO

export function img(
  key: PhotoKey,
  { w = 1200, h, q = 72 }: { w?: number; h?: number; q?: number } = {},
): string {
  const params = new URLSearchParams({
    auto: 'format',
    fit: 'crop',
    w: String(w),
    q: String(q),
  })
  if (h) params.set('h', String(h))
  return `${BASE}${PHOTO[key]}?${params.toString()}`
}

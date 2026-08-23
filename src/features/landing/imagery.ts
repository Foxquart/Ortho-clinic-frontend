/**
 * Premium lifestyle photography for Dr. Arjun Mehta's personal brand landing page.
 * Every URL points to curated Unsplash photography with a warm, editorial grade.
 * `img()` appends sizing + format params so the browser gets an appropriately
 * sized, auto-formatted asset. Swap these for the doctor's own photographs via
 * the CMS later.
 */
const BASE = 'https://images.unsplash.com/'

const PHOTO = {
  // Hero — warm, confident portrait with natural light and shallow depth
  heroPortrait: 'photo-1500648767791-00dcc994a43e',
  // Events — speaking, conferences, teaching
  speaking: 'photo-1540575467063-178a50c2df87',
  workshop: 'photo-1556761175-5973dc0f32e7',
  lecture: 'photo-1515187029135-18ee286d815b',
  // Activities & hobbies
  travel: 'photo-1488646953014-85cb44e25828',
  coffee: 'photo-1495474472287-4d71bcdd2085',
  cycling: 'photo-1541625602330-2277a4c46182',
  photography: 'photo-1516035069371-29a1b244cc32',
  reading: 'photo-1512820790803-83ca734da794',
  // Life & community
  family: 'photo-1511895426328-dc8714191300',
  kitchen: 'photo-1466637574441-749b8f19452f',
  // Clinic — kept minimal, only where absolutely necessary
  clinicPortrait: 'photo-1612349317150-e413f6a5b16d',
  clinicSpace: 'photo-1631815588090-d4bfec5b1ccb',
  physio: 'photo-1538805060514-97d9cc17730c',
  strength: 'photo-1571019613454-1cb2f99b2d8b',
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

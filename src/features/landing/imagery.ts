/**
 * Curated stock photography for the landing page. Every URL was verified to
 * return 200 image/jpeg from the Unsplash CDN. `img()` appends sizing +
 * format params so the browser gets an appropriately sized, auto-formatted
 * asset. Swap any of these for the clinic's own photos via the CMS later.
 */
const BASE = 'https://images.unsplash.com/'

const PHOTO = {
  heroMovement: 'photo-1538805060514-97d9cc17730c', // runner on stadium steps, teal
  runnerKnee: 'photo-1519494026892-80bbd2d6fd0d', // clinic reception
  doctor: 'photo-1612349317150-e413f6a5b16d', // clinician portrait
  doctorAlt: 'photo-1579684385127-1ef15d508118', // doctor
  physio: 'photo-1571019613454-1cb2f99b2d8b', // mat exercise, rehab
  team: 'photo-1551076805-e1869033e561', // medical team
  clinic: 'photo-1631815588090-d4bfec5b1ccb', // clinic interior
  scan: 'photo-1516549655169-df83a0774514', // imaging / scan
  hospital: 'photo-1559757148-5c350d0d3c56', // facility
  strength: 'photo-1517649763962-0c623066013b', // cyclists in motion
} as const

export type PhotoKey = keyof typeof PHOTO

export function img(
  key: PhotoKey,
  { w = 1200, h, q = 70 }: { w?: number; h?: number; q?: number } = {},
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

/** Gallery set, in display order. */
export const GALLERY_PHOTOS: PhotoKey[] = [
  'clinic',
  'scan',
  'physio',
  'team',
  'strength',
  'hospital',
]

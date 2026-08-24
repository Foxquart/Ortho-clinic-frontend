/**
 * Bake Dr. Deb Roy's Google reviews into the landing page at build time.
 *
 *   bun run fetch:reviews
 *
 * Calls the Places API (New) exactly once, normalizes the response, downloads
 * each reviewer's profile photo into `public/reviews/avatars/`, and writes
 * `src/features/landing/googleReviews.json` — which the landing data layer
 * (`src/features/landing/profile.ts`) imports statically. Build-time rather
 * than runtime: the API key never reaches the browser, there is no CORS, and
 * a patient's phone never depends on Google being reachable.
 *
 * The JSON is a reviewed, committable artifact: it is generated here but read
 * by a human like any other content change. The committed file is a
 * placeholder — empty `fetchedAt`, no reviews — until this script runs with
 * real credentials, and `profile.ts` treats that placeholder as "no live
 * data" and renders the hand-written `REVIEWS` fallback instead. So:
 *
 *   - With either env var unset the script prints a note and exits 0,
 *     changing nothing. Builds must never break for want of this key.
 *   - If the Places fetch itself fails, the script exits non-zero BEFORE
 *     touching the JSON or any avatar — a loud failure on real credentials,
 *     never a silent half-write.
 *
 * Both variables are server/build-time only. Never prefix them with `VITE_`:
 * anything so named ships to the browser. See `.env.example` for how to get
 * them.
 */

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? ''
const PLACE_ID = process.env.GOOGLE_PLACE_ID ?? ''

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AVATAR_DIR = join(ROOT, 'public', 'reviews', 'avatars')
const OUT_FILE = join(ROOT, 'src', 'features', 'landing', 'googleReviews.json')

/* ------------------------------ api response ------------------------------ */

/* Places API (New), Place Details with field mask `rating,userRatingCount,reviews`.
   Every field is optional in the wire format — code below assumes nothing. */
interface PlaceReview {
  rating?: number
  text?: { text?: string }
  relativePublishTimeDescription?: string
  publishTime?: string
  authorAttribution?: {
    displayName?: string
    /** The reviewer's public Maps profile. */
    uri?: string
    /** The reviewer's profile photo; append `=s128-c` for a 128px crop. */
    photoUri?: string
  }
}

interface PlaceDetails {
  rating?: number
  userRatingCount?: number
  reviews?: PlaceReview[]
}

/* ---------------------------- normalized output ---------------------------- */

interface NormalizedReview {
  author: string
  /** Local `/reviews/avatars/<slug>.jpg` path, or "" when the download failed. */
  avatar: string
  stars: number
  text?: string
  when: string
  /** ISO timestamp from Google; used only for the newest-first sort. */
  publishTime: string
  profileUrl: string
}

interface GoogleReviewsFile {
  fetchedAt: string
  rating: number
  count: number
  placeId: string
  reviews: NormalizedReview[]
}

/* --------------------------------- helpers --------------------------------- */

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'reviewer'
}

/** Download `url` to `dest`; returns false (and writes nothing) on any failure. */
async function download(url: string, dest: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    if (!response.ok) return false
    await Bun.write(dest, await response.arrayBuffer())
    return true
  } catch {
    return false
  }
}

/* ---------------------------------- main ----------------------------------- */

async function main() {
  if (!API_KEY || !PLACE_ID) {
    console.log(
      'fetch-google-reviews: skipping: GOOGLE_PLACES_API_KEY/GOOGLE_PLACE_ID unset — landing will use fallback reviews',
    )
    return
  }

  console.log(`Fetching place details for ${PLACE_ID}`)
  const response = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
    },
  })
  if (!response.ok) {
    throw new Error(`places api → ${response.status} ${(await response.text()).slice(0, 400)}`)
  }
  const place = (await response.json()) as PlaceDetails

  /* --------------------------- normalize + avatars --------------------------- */
  await mkdir(AVATAR_DIR, { recursive: true })
  const claimedSlugs = new Map<string, string>() // slug → the author who owns it

  const reviews: NormalizedReview[] = []
  for (const review of place.reviews ?? []) {
    const author = review.authorAttribution?.displayName ?? 'Google user'
    const photoUri = review.authorAttribution?.photoUri

    let avatar = ''
    if (photoUri) {
      // Two authors can slugify to the same file name — disambiguate.
      let slug = slugify(author)
      for (let n = 2; claimedSlugs.has(slug) && claimedSlugs.get(slug) !== author; n++) {
        slug = `${slugify(author)}-${n}`
      }
      claimedSlugs.set(slug, author)
      if (await download(`${photoUri}=s128-c`, join(AVATAR_DIR, `${slug}.jpg`))) {
        avatar = `/reviews/avatars/${slug}.jpg`
      } else {
        console.log(`  avatar download failed for ${author} — leaving blank`)
      }
    }

    reviews.push({
      author,
      avatar,
      stars: review.rating ?? 0,
      ...(review.text?.text ? { text: review.text.text } : {}),
      when: review.relativePublishTimeDescription ?? '',
      publishTime: review.publishTime ?? '',
      profileUrl: review.authorAttribution?.uri ?? '',
    })
  }

  // Google returns reviews "most relevant" first; the page wants newest first.
  reviews.sort((a, b) => b.publishTime.localeCompare(a.publishTime))

  const output: GoogleReviewsFile = {
    fetchedAt: new Date().toISOString(),
    rating: place.rating ?? 0,
    count: place.userRatingCount ?? 0,
    placeId: PLACE_ID,
    reviews,
  }

  await Bun.write(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`)
  console.log(
    `  wrote ${reviews.length} reviews, rating ${output.rating} from ${output.count} → src/features/landing/googleReviews.json`,
  )
  console.log('Done.')
}

main().catch((error: unknown) => {
  console.error('\nFetching reviews failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})

/**
 * Dr. Sankar Deb Roy — every word the landing page says about him, in one file.
 *
 * The landing page is a personal site, not a clinic brochure: it is ordered
 * around the person, his training and his life, and the clinic is one quiet
 * band near the bottom. That editorial decision only works if the facts are
 * right, so they all live here rather than being scattered through eight
 * section components where they drift apart.
 *
 * ## Provenance — read this before editing
 *
 * Nothing here has been confirmed by Dr. Deb Roy yet. Every factual line is
 * tagged in the comment above it with where it came from:
 *
 *   [SOURCED]  Published on a public third-party page (Lybrate, a journal
 *              record). Plausible, but directories are stale and contradicted
 *              each other — Lybrate alone gives 19, 21 and 22 years of
 *              experience on different pages. Confirm before launch.
 *   [DRAFT]    Written by us as a placeholder so the layout can be judged.
 *              Not a fact about a real person. These never reach production —
 *              see `SHOW_DRAFTS` below.
 *
 * When a fact is confirmed, change its tag to [CONFIRMED] and delete it from
 * `PENDING_CONFIRMATION`. When draft copy is replaced with the real thing,
 * drop the `draft` flag on that entry.
 *
 * ## Name spelling
 *
 * He appears online as "Sankar Debroy" (Lybrate, and the byline on his 2025
 * paper), "Shanker Debroy" (his Google Business Profile), "Dr Sankar Debroy"
 * (Doordarshan Tripura), "Sankar DebRoy" (AppointDoctor) and "Sankar Deb Roy".
 * Five spellings means neither Google nor any LLM ever merges them into one
 * entity, so all of them stay weak. `DOCTOR.name` is the one canonical display
 * spelling and `DOCTOR.alternateNames` feeds `alternateName` in the structured
 * data, which is how the variants get folded back into a single entity.
 */

import type { PhotoKey } from './imagery'

/**
 * Draft copy renders in development so the page can be designed against a full
 * layout, and is stripped from production builds so invented biography can
 * never ship on a real doctor's website. Sections that end up with nothing but
 * drafts render nothing at all.
 */
export const SHOW_DRAFTS: boolean = import.meta.env.DEV

/** Drop entries that are still placeholder copy, unless we are in dev. */
export function published<T extends { draft?: boolean }>(items: readonly T[]): T[] {
  return SHOW_DRAFTS ? [...items] : items.filter((item) => !item.draft)
}

/* -------------------------------------------------------------------------- */
/*  The person                                                                */
/* -------------------------------------------------------------------------- */

export const DOCTOR = {
  /** The one canonical spelling. Never write it any other way on the site. */
  name: 'Dr. Sankar Deb Roy',
  /** Short form for tight spaces — the nav wordmark, the footer mark. */
  shortName: 'Dr. Deb Roy',
  /** [SOURCED] Every spelling he is published under, for `alternateName`. */
  alternateNames: [
    'Sankar Debroy',
    'Shanker Debroy',
    'Dr. Sankar DebRoy',
    'Sankar Deb Roy',
    'S. Deb Roy',
  ],
  /** Both spellings are used in Indian search; the copy should carry each. */
  specialty: 'Orthopaedic surgeon',
  specialtyAlt: 'Orthopedic surgeon',
  /** [SOURCED] Lybrate. */
  qualifications: 'MBBS, MS (Orthopaedics)',
  /** [SOURCED] Lybrate — but the same site also says 19 and 21. Confirm. */
  experienceYears: 22,
  city: 'Agartala',
  state: 'Tripura',
  country: 'India',
} as const

/**
 * [SOURCED] Regional Institute of Medical Sciences, Imphal (Lybrate, 2004);
 * Department of Orthopaedics, AGMC & GBP (author affiliation on the 2025
 * paper below — the strongest single signal in the set, because a journal
 * affiliation line is checked in a way a directory listing is not).
 */
export const TRAINING = {
  postgraduate: 'MS (Orthopaedics), Regional Institute of Medical Sciences, Imphal',
  postgraduateYear: 2004,
  department: 'Department of Orthopaedics',
  institution: 'Agartala Government Medical College & G. B. Pant Hospital',
  institutionShort: 'AGMC & GBP Hospital',
} as const

/* -------------------------------------------------------------------------- */
/*  Narrative — the editorial voice of the page                               */
/* -------------------------------------------------------------------------- */

/**
 * The hero. `headline` is split into lines so the page's GSAP can stagger them
 * word by word; concatenated it must still read as one clean sentence, because
 * that is what a screen reader and a crawler get.
 *
 * The H1 carries the name, the specialty and the city deliberately. The
 * editorial line lives underneath as the lead, where it costs nothing.
 */
export const HERO = {
  kicker: `${DOCTOR.city} · ${DOCTOR.state}`,
  headline: [
    { text: DOCTOR.name },
    { text: 'Orthopaedic surgeon', emphasis: true },
    { text: `in ${DOCTOR.city}.` },
  ],
  /** [SOURCED] figures; [DRAFT] the sentence they sit in. */
  lead: `Twenty-two years of bones, joints and the people attached to them — ${TRAINING.institutionShort}, and an evening clinic in Battala. This page is about the whole of that, not only the half that happens in a consulting room.`,
  alt: `${DOCTOR.name}, orthopaedic surgeon, at his clinic in ${DOCTOR.city}.`,
} as const

/** [DRAFT] The editorial hinge. Replace with something in his own voice. */
export const MANIFESTO = {
  statement: 'A bone heals on its own schedule.',
  emphasis: 'The job is to give it the conditions.',
  body: 'Most of orthopaedics is not the operation. It is the twenty minutes before it explaining what is broken, and the six months after it making sure the explanation held. I have spent longer on the second part than the first, and I would not reorder them.',
  draft: true,
} as const

/* -------------------------------------------------------------------------- */
/*  The record — training, post, published work                               */
/* -------------------------------------------------------------------------- */

export interface Milestone {
  /** A year, or a range like `2004 —`. Rendered as a numeral, so keep it short. */
  when: string
  title: string
  detail: string
  draft?: boolean
}

/** [SOURCED] except where flagged. Ordered oldest first. */
export const MILESTONES: readonly Milestone[] = [
  {
    when: '2004',
    title: 'MS, Orthopaedics',
    detail: 'Regional Institute of Medical Sciences, Imphal',
  },
  {
    when: 'Since',
    title: TRAINING.department,
    detail: TRAINING.institution,
  },
  {
    when: '2024',
    title: 'An hour on arthritis, live',
    detail: 'Health Live, Doordarshan Tripura',
  },
  {
    when: '2025',
    title: 'Published on distal femoral fractures',
    detail: 'International Journal of Research in Orthopaedics',
  },
  {
    when: 'Now',
    title: 'Evening clinic, Battala',
    detail: 'MEDICAIDS, Ronaldsay Road — six days a week',
  },
]

export interface Publication {
  title: string
  journal: string
  year: number
  citation: string
  doi: string
  draft?: boolean
}

/**
 * [SOURCED] Verified against the journal's own record, not a directory. Worth
 * showing prominently: almost no orthopaedic practice in Agartala has a
 * peer-reviewed publication, and it is the kind of third-party-anchored signal
 * that search engines and AI assistants both weigh heavily.
 */
export const PUBLICATIONS: readonly Publication[] = [
  {
    title:
      'Functional outcome of distal femoral fractures treated with distal femoral locking compression plate: a cross-sectional study',
    journal: 'International Journal of Research in Orthopaedics',
    year: 2025,
    citation: 'Vol. 11, No. 5, pp. 1089–1097',
    doi: 'https://doi.org/10.18203/issn.2455-4510.IntJResOrthop20252635',
  },
]

/** [DRAFT] Short, honest facts for the About column. */
export const ABOUT = {
  bio: `${DOCTOR.name} is an orthopaedic surgeon in ${DOCTOR.city}, ${DOCTOR.state}. He took his MS in Orthopaedics at RIMS Imphal in 2004 and has practised in Tripura since, in the ${TRAINING.department} at ${TRAINING.institutionShort} and, in the evenings, at his own clinic in Battala. He treats fractures, joint pain, sports injuries and the long unglamorous business of getting people walking again.`,
  draft: true,
  /**
   * [CONFIRMED for Bengali] — he presented an hour of live television in it.
   * Worth stating on the page: every competing listing shows only English and
   * Hindi, and in Agartala that omission costs real patients.
   */
  languages: ['Bengali', 'Hindi', 'English'],
} as const

/* -------------------------------------------------------------------------- */
/*  Life — everything that is not the clinic                                  */
/* -------------------------------------------------------------------------- */

export interface LifeTile {
  key: PhotoKey
  label: string
  caption: string
  alt: string
  span: 'large' | 'medium' | 'small'
  draft?: boolean
}

/**
 * [DRAFT] — all of it. We know nothing about what Dr. Deb Roy does outside the
 * clinic, and inventing it on a real person's website is not acceptable, so
 * every tile below is flagged and none of them reach a production build.
 *
 * This is the section that needs him most. Replacing it takes one conversation
 * and one afternoon with a camera: six things he actually does, a real
 * photograph of each, and a sentence in his own words. Until then the section
 * renders in dev only, so the layout can be built against something.
 */
export const LIFE: readonly LifeTile[] = [
  {
    key: 'teaching',
    label: 'Teaching',
    caption: 'Postgraduate rounds, and the residents who ask the good questions.',
    alt: 'A teaching session in a hospital corridor.',
    span: 'large',
    draft: true,
  },
  {
    key: 'reading',
    label: 'On the shelf',
    caption: 'Journals on the desk, everything else on the veranda.',
    alt: 'An open book resting on a table.',
    span: 'medium',
    draft: true,
  },
  {
    key: 'landscape',
    label: 'Tripura',
    caption: 'The hills on a free Sunday, when there is a free Sunday.',
    alt: 'Green hills under morning cloud in Tripura.',
    span: 'medium',
    draft: true,
  },
  {
    key: 'garden',
    label: 'Outside',
    caption: 'Slow things, deliberately.',
    alt: 'Plants in morning light in a home garden.',
    span: 'small',
    draft: true,
  },
  {
    key: 'community',
    label: 'Camps',
    caption: 'Bone and joint camps, out where the hospital is far away.',
    alt: 'A rural health camp in session.',
    span: 'small',
    draft: true,
  },
  {
    key: 'family',
    label: 'Home',
    caption: 'The people who hear about every case twice.',
    alt: 'A family at home together.',
    span: 'small',
    draft: true,
  },
]

/* -------------------------------------------------------------------------- */
/*  Media — verifiable, third-party, and rare in this market                  */
/* -------------------------------------------------------------------------- */

export interface MediaAppearance {
  title: string
  outlet: string
  /** ISO date, so it can feed structured data without reparsing. */
  date: string
  /** Human-readable duration, e.g. `1 hr 4 min`. */
  length?: string
  language: string
  /** The watch URL, for `sameAs` and for the "open on YouTube" fallback. */
  url: string
  /** The privacy-preserving embed URL, for the player on the page. */
  embedUrl: string
  note?: string
  draft?: boolean
}

/**
 * [CONFIRMED] — verified against the broadcaster's own upload, which is why
 * this is the only [CONFIRMED] block in the file.
 *
 * An hour of state television on a single condition is the strongest authority
 * signal Dr. Deb Roy has, and it is stronger than anything his competitors in
 * Agartala can show. It is also the only public record that establishes he
 * consults in Bengali, which for this practice matters more than any credential
 * — most of his patients arrive in Bengali and every competing listing shows
 * only English and Hindi.
 *
 * It belongs in `sameAs` in the structured data as well as on the page.
 */
export const MEDIA: readonly MediaAppearance[] = [
  {
    title: 'Health Live — arthritis',
    outlet: 'Doordarshan Tripura',
    date: '2024-12-12',
    length: '1 hr 4 min',
    language: 'Bengali',
    url: 'https://www.youtube.com/watch?v=b3gISR4ovfU',
    /* `youtube-nocookie` rather than `youtube.com`: same player, but it sets no
       tracking cookie until someone actually presses play. On a page whose
       visitors are looking up a doctor, that is worth the zero effort it costs. */
    embedUrl: 'https://www.youtube-nocookie.com/embed/b3gISR4ovfU',
    note: 'A full hour taking questions on arthritis, live on the state broadcaster.',
  },
]

/* -------------------------------------------------------------------------- */
/*  Google reviews                                                            */
/* -------------------------------------------------------------------------- */

export interface Review {
  /** The reviewer's Google display name, exactly as it appears. */
  author: string
  /** Relative age as Google shows it. Google gives no absolute date. */
  when: string
  /** The written review, where the reviewer left one. */
  text?: string
  /**
   * Stars out of five.
   *
   * READ THIS BEFORE TRUSTING THESE NUMBERS. We transcribed the reviews from
   * the profile listing, which showed the author, the age and the text but not
   * the per-review star count. The values below are assumed, not observed.
   *
   * They are also demonstrably not all correct: the profile's own average is
   * 4.0 across nine reviews, and nine fives with the one-star we excluded
   * would average 4.6. So at least one of the silent reviewers gave fewer than
   * five stars and is currently being shown too generously.
   *
   * Open the Business Profile, read the real number off each review, and
   * correct this field. It is one line per review and it is the difference
   * between displaying reviews and inventing them.
   */
  stars: number
  draft?: boolean
}

/**
 * [CONFIRMED] Transcribed from the Google Business Profile. Real people, real
 * words, nothing rewritten or tidied.
 *
 * ## Two things this deliberately does not do
 *
 * The star counts on each review are ASSUMED, not observed — see the `stars`
 * field below. They must be checked against the live profile before launch.
 *
 * It omits the one negative review, at the client's request. That is an
 * ordinary editorial choice and every practice makes it, but it is only
 * defensible because `GOOGLE_RATING` below states the true aggregate and links
 * to the profile, where all nine reviews including that one are one click
 * away. If the aggregate is ever removed, this selection stops being curation
 * and starts being concealment — so the two travel together.
 *
 * Reviews with no written text still earn a card. They are real ratings from
 * real patients and they carry the one thing a written review cannot: that the
 * practice has been seeing people steadily for six years.
 */
export const REVIEWS: readonly Review[] = [
  {
    author: 'Self Defence Coach, Karate',
    when: '4 months ago',
    text: 'Very good doctor, good human, excellent behaviour.',
    stars: 5,
  },
  {
    author: 'Imran Hossain',
    when: 'a year ago',
    text: 'Good doctor for minimal pain.',
    stars: 5,
  },
  { author: 'Manab Das', when: '4 months ago', stars: 5 },
  { author: 'Bimal Das', when: 'a year ago', stars: 5 },
  { author: 'Barnali Barnali', when: '3 years ago', stars: 5 },
  { author: 'Anik Roy', when: '5 years ago', stars: 5 },
  { author: 'Soma Deb', when: '5 years ago', stars: 5 },
  { author: 'Tushnin Roy', when: '6 years ago', stars: 5 },
]

/**
 * [CONFIRMED] The true aggregate, negative review included. Stated on the page
 * because a curated selection without it is not honest, and because 4.0 from a
 * named, checkable profile reads better than a suspiciously perfect five.
 *
 * On the page only — never in structured data. A practice must not mint its
 * own `aggregateRating` markup from reviews collected on someone else's
 * platform; that is a manual-action risk, not a shortcut.
 */
export const GOOGLE_RATING = { rating: 4.0, count: 9 } as const

/* -------------------------------------------------------------------------- */
/*  The clinic — deliberately the smallest part of the page                   */
/* -------------------------------------------------------------------------- */

/**
 * Static fallbacks only. The CMS is the live source for all of this once the
 * clinic settings are filled in; these values exist so the page is never blank
 * and so a crawler that does not wait for the API still reads a real address.
 *
 * ## The two addresses problem
 *
 * Lybrate lists the practice as "MEDICAIDS, Ronaldsay road, Battala". The
 * Google Business Profile is pinned to "Amita Drug Distributor, Ronaldsay Rd,
 * opposite Tripura State Cooperative Bank Limited, Battala, Agartala 799001" —
 * the same road, but filed under a pharmacy's name rather than the clinic's.
 *
 * That mismatch is expensive. Google reconciles a practice from agreeing
 * name-address-phone triples, and right now his two most visible listings agree
 * on neither the business name nor the doctor's. Whatever is decided, the site,
 * the Business Profile and every directory have to say it identically — which
 * is the whole reason this file exists.
 *
 * The phone number is deliberately absent rather than guessed: a wrong number
 * on a doctor's website is worse than no number, and no public listing agreed.
 */
export const CLINIC = {
  /** [SOURCED] Lybrate. The Business Profile says otherwise — see above. */
  name: 'MEDICAIDS',
  street: 'Ronaldsay Road, Battala',
  /** [SOURCED] Google Business Profile — the most useful line for a patient. */
  landmark: 'Opposite Tripura State Cooperative Bank',
  city: DOCTOR.city,
  state: DOCTOR.state,
  /** [SOURCED] Google Business Profile. */
  postalCode: '799001',
  /** [SOURCED] Lybrate. Evening-only is plausible alongside a hospital post. */
  hours: 'Monday – Saturday, 6:00 pm – 8:30 pm',
  consultationFee: '₹300',
  phone: null as string | null,
} as const

/**
 * Where he already exists on the web, for `sameAs` in the structured data.
 * Listing these tells Google and every AI assistant that the site, the map pin
 * and the directory entries are one person rather than five.
 *
 * The Business Profile currently carries 9 reviews at 4.0. The clinic holding
 * the map pack for "orthopedic doctor in agartala" has 281 at 5.0. That gap,
 * not anything on this website, is what decides the map results — which is
 * exactly why the page below spends its effort on the person instead.
 */
export const PRESENCE = {
  googleBusinessProfile: {
    reviews: 9,
    rating: 4.0,
    listedAs: 'Dr. Shanker Debroy',
    /* A search URL, not the profile's own link, because we do not have the
       place ID yet. Replace with the short `maps.app.goo.gl` link from the
       profile's Share menu — a direct link is one redirect fewer for a
       patient and a cleaner `sameAs` target for search engines. */
    url: 'https://www.google.com/search?q=Dr+Shanker+Debroy+Orthopaedic+Battala+Agartala',
  },
  lybrate: 'https://www.lybrate.com/agartala/doctor/dr-sankardebroy-orthopedist',
  publicationDoi: 'https://doi.org/10.18203/issn.2455-4510.IntJResOrthop20252635',
  doordarshan: 'https://www.youtube.com/watch?v=b3gISR4ovfU',
} as const

/* -------------------------------------------------------------------------- */
/*  Launch checklist                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Everything on this page that a real person has not yet signed off on. This
 * is not busywork: publishing scraped credentials for a practising surgeon is
 * the kind of mistake that is very hard to walk back.
 */
export const PENDING_CONFIRMATION: readonly string[] = [
  'Years in practice — public listings say 19, 21 and 22.',
  'Whether MEDICAIDS on Ronaldsay Road is still the practice address.',
  'Current clinic hours and consultation fee.',
  'A phone number, and whether it should be published at all.',
  'Medical registration number (Tripura Medical Council).',
  'Whether the AGMC & GBP post is current, and the exact designation.',
  'Preferred spelling of his name for the domain and every directory.',
  'Whether the Google Business Profile should be renamed — it currently reads\n    "Dr. Shanker Debroy" at a drug distributor\'s address, not the clinic\'s.',
  'Everything in LIFE — we know none of it.',
  'Real photographs of him and the clinic, to replace the stock imagery.',
  'Patient testimonials — real, attributed, and consented to.',
]

/**
 * The landing page's head tags and structured data.
 *
 * React 19 hoists bare `<title>`, `<meta>` and `<link>` elements rendered
 * anywhere in the tree into `<head>`, so this component can live inside the
 * page and still produce a correct document head. The JSON-LD is emitted as an
 * ordinary script element; search engines and AI crawlers read `application/
 * ld+json` wherever it appears in the document, so it does not need hoisting.
 *
 * ## What this cannot fix
 *
 * All of it runs in JavaScript. Googlebot renders and will see it on the
 * second wave, but GPTBot, PerplexityBot, ClaudeBot and most of Bingbot do
 * not execute JavaScript reliably — to them this page is still an empty
 * `<div id="root">`. Prerendering `/` at build time is the fix, and until that
 * lands this file buys correctness rather than reach. The static defaults in
 * `index.html` are the crawler-visible floor in the meantime.
 *
 * ## What is deliberately absent
 *
 * No `canonical`, no `og:url` and no absolute image URLs, because there is no
 * domain yet. Set `VITE_SITE_ORIGIN` when it is bought and they start emitting;
 * a canonical pointing at the wrong origin is worse than none.
 *
 * No `telephone`, and no `aggregateRating`. The phone number is not confirmed,
 * and a practice must never mint its own rating markup from reviews collected
 * somewhere else — that is a manual-action risk, not a shortcut.
 */
import { CLINIC, DOCTOR, MEDIA, PRESENCE, TRAINING } from './profile'

/** Set once the domain exists. Absent origin means absolute URLs are skipped. */
const ORIGIN: string | undefined = import.meta.env.VITE_SITE_ORIGIN

const TITLE = `${DOCTOR.name} — Orthopaedic Surgeon in ${DOCTOR.city}, ${DOCTOR.state}`

/**
 * Both spellings of the specialty appear on purpose. Indian searches split
 * roughly evenly between "orthopedic" and "orthopaedic", and Google does not
 * reliably conflate them inside long-tail combinations like
 * "orthopedic doctor in agartala".
 */
const DESCRIPTION = `${DOCTOR.name} (also written Sankar Debroy) is an orthopaedic and orthopedic surgeon in ${DOCTOR.city}, ${DOCTOR.state} — MS Orthopaedics, ${DOCTOR.experienceYears} years in practice, ${TRAINING.institutionShort}. Consultations in Bengali, Hindi and English at ${CLINIC.name}, ${CLINIC.street}.`

export function SeoHead() {
  const physician = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: DOCTOR.name,
    alternateName: [...DOCTOR.alternateNames],
    description: DESCRIPTION,
    medicalSpecialty: 'Orthopedic',
    knowsLanguage: ['bn', 'hi', 'en'],
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: 'Regional Institute of Medical Sciences, Imphal',
    },
    worksFor: {
      '@type': 'Hospital',
      name: TRAINING.institution,
      department: TRAINING.department,
    },
    address: postalAddress(),
    areaServed: [
      { '@type': 'City', name: DOCTOR.city },
      { '@type': 'AdministrativeArea', name: `West Tripura` },
      { '@type': 'AdministrativeArea', name: DOCTOR.state },
    ],
    /* The variants above are one person; these links are how Google and every
       LLM are told so. This is the single highest-value field in the file. */
    sameAs: [PRESENCE.lybrate, PRESENCE.doordarshan, PRESENCE.publicationDoi],
    subjectOf: MEDIA.map((item) => ({
      '@type': 'VideoObject',
      name: `${item.title} — ${item.outlet}`,
      uploadDate: item.date,
      inLanguage: 'bn',
      url: item.url,
      publisher: { '@type': 'Organization', name: item.outlet },
    })),
  }

  const clinic = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    name: CLINIC.name,
    description: `Orthopaedic clinic of ${DOCTOR.name} in ${CLINIC.landmark.replace(/^Opposite /, 'Battala, opposite ')}, ${DOCTOR.city}.`,
    medicalSpecialty: 'Orthopedic',
    address: postalAddress(),
    physician: { '@type': 'Physician', name: DOCTOR.name },
    priceRange: CLINIC.consultationFee,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        opens: '18:00',
        closes: '20:30',
      },
    ],
    ...(ORIGIN ? { url: ORIGIN } : {}),
  }

  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <meta name="robots" content="index, follow, max-image-preview:large" />

      {/* Geo hints. Low weight on their own, but free and unambiguous. */}
      <meta name="geo.region" content="IN-TR" />
      <meta name="geo.placename" content={`${DOCTOR.city}, ${DOCTOR.state}`} />

      <meta property="og:type" content="profile" />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:locale" content="en_IN" />
      <meta property="og:locale:alternate" content="bn_IN" />
      {ORIGIN && <link rel="canonical" href={ORIGIN} />}
      {ORIGIN && <meta property="og:url" content={ORIGIN} />}
      <meta name="twitter:card" content="summary_large_image" />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify([physician, clinic]) }}
      />
    </>
  )
}

function postalAddress() {
  return {
    '@type': 'PostalAddress',
    streetAddress: CLINIC.street,
    addressLocality: DOCTOR.city,
    addressRegion: DOCTOR.state,
    postalCode: CLINIC.postalCode,
    addressCountry: 'IN',
  }
}

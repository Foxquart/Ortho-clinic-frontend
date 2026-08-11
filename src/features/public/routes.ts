/**
 * The public site's own route table. Paths are absolute because `PublicSite`
 * is mounted at a fixed `/site/*` in the app router; the `<Routes>` inside it
 * declare the matching relative segments.
 */
export const SITE_ROOT = '/site'

export const BOOK_PATH = `${SITE_ROOT}/book`

export const SITE_NAV = [
  { to: SITE_ROOT, label: 'Home', end: true },
  { to: `${SITE_ROOT}/about`, label: 'About', end: false },
  { to: `${SITE_ROOT}/services`, label: 'Services', end: false },
  { to: `${SITE_ROOT}/gallery`, label: 'Gallery', end: false },
  { to: `${SITE_ROOT}/testimonials`, label: 'Patient stories', end: false },
  { to: `${SITE_ROOT}/contact`, label: 'Contact', end: false },
] as const

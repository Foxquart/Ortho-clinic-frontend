/**
 * Which of the two front doors this tab came through.
 *
 * One repo, one Vercel project, one bundle — two hostnames pointed at it:
 *
 *   ortho-fe.foxquart.com    the public site. Landing page and /site/*.
 *   ortho-dash.foxquart.com  the app. Login and every authenticated screen.
 *
 * Both hostnames are attached to the same Vercel project, so they serve the
 * same build with the same environment. That is precisely why the split is
 * decided by comparing `window.location.origin` against configured origins
 * rather than by pattern-matching the hostname: the two names are siblings
 * (`ortho-fe` / `ortho-dash`), not a prefix of one another, and the next
 * deployment may name them anything at all.
 *
 * Vercel serves index.html for every path on both hosts (the single rewrite in
 * vercel.json), so this runs once at module load, before the router is built.
 * Nothing downstream asks about hostnames; it just gets a different route tree.
 *
 * ## Configuration
 *
 *   VITE_SITE_ORIGIN   the public site's origin. Already used by SeoHead for
 *                      canonical and og:url — deliberately reused rather than
 *                      introducing a second variable that means the same thing.
 *   VITE_STAFF_ORIGIN  the app's origin.
 *
 * Set BOTH on the single Vercel project. Neither is secret; both are baked
 * into the bundle at build time like every other VITE_ value.
 *
 * ## Dev and preview
 *
 * With neither variable matching (localhost, a preview URL, a bare IP) the
 * surface falls back to public, and `?surface=staff` overrides it for the tab.
 * sessionStorage, not localStorage: a staff tab and a public tab should be
 * able to sit side by side without fighting over one flag.
 */

export type Surface = 'public' | 'staff'

/** Trailing slashes make origin comparison silently fail. Strip them once. */
function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '')
  return trimmed ? trimmed : null
}

export const PUBLIC_ORIGIN = normalizeOrigin(import.meta.env.VITE_SITE_ORIGIN)
export const STAFF_ORIGIN = normalizeOrigin(import.meta.env.VITE_STAFF_ORIGIN)

const OVERRIDE_KEY = 'ortho-surface'

function isSurface(value: unknown): value is Surface {
  return value === 'public' || value === 'staff'
}

function resolveSurface(): Surface {
  if (typeof window === 'undefined') return 'public'

  /* An explicit ?surface= wins and is remembered, so the flag survives the
     client-side navigations that follow it. */
  const requested = new URLSearchParams(window.location.search).get('surface')
  if (isSurface(requested)) {
    try {
      sessionStorage.setItem(OVERRIDE_KEY, requested)
    } catch {
      /* Private mode. The parameter still governs this page load. */
    }
    return requested
  }

  try {
    const stored = sessionStorage.getItem(OVERRIDE_KEY)
    if (isSurface(stored)) return stored
  } catch {
    /* Storage unavailable — fall through to the origin check. */
  }

  /* Only the staff origin is matched positively. Anything else — the public
     origin, a preview URL, localhost — is public, which is the surface that
     must never leak app screens if configuration is wrong. Failing closed
     matters more here than being clever about it. */
  if (STAFF_ORIGIN && window.location.origin === STAFF_ORIGIN) return 'staff'
  return 'public'
}

export const SURFACE: Surface = resolveSurface()
export const IS_STAFF = SURFACE === 'staff'

/**
 * Build an absolute URL onto one of the two surfaces.
 *
 * When the target origin is not configured (dev, previews) this returns a
 * same-origin URL carrying `?surface=`, so every cross-surface link keeps
 * working locally without a second hostname.
 */
function surfaceUrl(target: Surface, origin: string | null, path: string): string {
  if (origin) return `${origin}${path.startsWith('/') ? path : `/${path}`}`

  const url = new URL(path, window.location.origin)
  url.searchParams.set('surface', target)
  return url.toString()
}

/**
 * Absolute URL to `path` on the staff surface.
 *
 * Cross-origin in production, so callers must use a plain `<a href>` — a
 * react-router `<Link>` would try to resolve it against the current origin.
 */
export function staffUrl(path = '/'): string {
  return surfaceUrl('staff', STAFF_ORIGIN, path)
}

/** Absolute URL to `path` on the public surface. The inverse of staffUrl. */
export function publicUrl(path = '/'): string {
  return surfaceUrl('public', PUBLIC_ORIGIN, path)
}

import { useEffect } from 'react'

/**
 * Sets `document.title` for the duration of a page and restores whatever was
 * there before on unmount, so leaving the public site does not leave the
 * clinic's marketing title stuck on the dashboard tab.
 *
 * Pass `null` while the clinic name is still loading rather than flashing a
 * placeholder title into the tab and the browser history entry.
 */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}

/** `About · OrthoClinic` — one consistent separator across every page. */
export function siteTitle(
  page: string | null,
  clinicName: string | null | undefined,
): string | null {
  if (!clinicName) return null
  return page ? `${page} · ${clinicName}` : clinicName
}

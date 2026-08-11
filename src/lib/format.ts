import {
  differenceInYears,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isValid,
  isYesterday,
  parseISO,
} from 'date-fns'

/** Parse an API date/date-time string. Returns null rather than an Invalid Date. */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

/** `12 Aug 2026` — unambiguous, and never the US month-first order. */
export function formatDate(value: string | null | undefined, fallback = '—'): string {
  const d = parseApiDate(value)
  return d ? format(d, 'd MMM yyyy') : fallback
}

export function formatDateTime(value: string | null | undefined, fallback = '—'): string {
  const d = parseApiDate(value)
  return d ? format(d, 'd MMM yyyy, h:mm a') : fallback
}

/** `HH:MM:SS` from the API → `9:30 am`. */
export function formatTime(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback
  const [h, m] = value.split(':')
  const hour = Number(h)
  if (!Number.isFinite(hour)) return fallback
  const suffix = hour < 12 ? 'am' : 'pm'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${m ?? '00'} ${suffix}`
}

/** "Today", "Tomorrow", "Yesterday", else the date. */
export function formatRelativeDay(value: string | null | undefined, fallback = '—'): string {
  const d = parseApiDate(value)
  if (!d) return fallback
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'd MMM yyyy')
}

/** `3 days ago`. For audit trails and "last seen". */
export function formatAgo(value: string | null | undefined, fallback = '—'): string {
  const d = parseApiDate(value)
  return d ? `${formatDistanceToNowStrict(d)} ago` : fallback
}

export function patientAge(dateOfBirth: string | null | undefined): number | null {
  const d = parseApiDate(dateOfBirth)
  if (!d) return null
  const years = differenceInYears(new Date(), d)
  return years >= 0 && years < 130 ? years : null
}

/** `Ranjit Sharma` from first/last, collapsing missing halves cleanly. */
export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unnamed patient'
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/** Today in the API's `YYYY-MM-DD` form, in the browser's local timezone. */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Titlecase an API enum for display: `in_progress` → `In progress`. */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Pure helpers for turning CMS / availability payloads into something a page
 * can render. No hardcoded clinic facts live here — only shape handling and
 * date arithmetic.
 */
import { DAYS_OF_WEEK } from '@/api/schema'
import type {
  DayOfWeek,
  GalleryImageResponse,
  JsonObject,
  PortfolioPageResponse,
  ServiceResponse,
  TestimonialResponse,
  WeeklyAvailabilityResponse,
} from '@/api/schema'
import { formatTime, toIsoDate } from '@/lib/format'

/* -------------------------------------------------------------------------- */
/*  CMS page content                                                          */
/* -------------------------------------------------------------------------- */

export interface CmsSection {
  heading: string | null
  body: string | null
}

/**
 * `true` when a string carries actual content. The CMS seed ships bodies that
 * are literally `"..."`; rendering those as prose would look like a bug, and
 * inventing replacement copy would be worse. We drop them instead, so a
 * half-filled page degrades to just its headings.
 */
export function hasWords(value: unknown): value is string {
  return typeof value === 'string' && /[\p{L}\p{N}]/u.test(value)
}

/** Trim to a plain string, or null when there is nothing worth showing. */
export function text(value: unknown): string | null {
  return hasWords(value) ? value.trim() : null
}

/**
 * `content` is an untyped object in the schema. In practice it is
 * `{ sections: [{ heading, body }] }`. Anything that does not match that shape
 * is ignored rather than guessed at.
 */
export function pageSections(page: PortfolioPageResponse | undefined | null): CmsSection[] {
  const content = page?.content
  if (!content || typeof content !== 'object') return []
  const raw = (content as JsonObject).sections
  if (!Array.isArray(raw)) return []

  const sections: CmsSection[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as JsonObject
    const heading = text(record.heading)
    const body = text(record.body)
    if (heading || body) sections.push({ heading, body })
  }
  return sections
}

/** Split a CMS body into paragraphs on blank lines / newlines. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * `working_hours` is a free-form object. We only surface entries whose value is
 * a plain string or number — never a nested blob rendered as `[object Object]`.
 */
export function readableWorkingHours(value: JsonObject | null): { label: string; value: string }[] {
  if (!value || typeof value !== 'object') return []
  const rows: { label: string; value: string }[] = []
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' && hasWords(raw)) rows.push({ label: humanizeKey(key), value: raw })
    else if (typeof raw === 'number') rows.push({ label: humanizeKey(key), value: String(raw) })
  }
  return rows
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/* -------------------------------------------------------------------------- */
/*  Availability                                                              */
/* -------------------------------------------------------------------------- */

export const DAY_LABEL: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** `2026-08-10` → a Date at local midnight, never shifted by the timezone. */
export function parseIsoDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** JS `getDay()` is Sunday-first; the API's `DayOfWeek` list is Monday-first. */
export function dayOfWeekFor(date: Date): DayOfWeek {
  return DAYS_OF_WEEK[(date.getDay() + 6) % 7]
}

export function dayOfWeekForIso(iso: string): DayOfWeek | null {
  const date = parseIsoDay(iso)
  return date ? dayOfWeekFor(date) : null
}

export interface DayHours {
  day: DayOfWeek
  label: string
  /** Formatted `4:00 pm – 8:00 pm` ranges. Empty means the clinic is closed. */
  blocks: string[]
}

/** All seven days, Monday first, so "closed on Sunday" is visible information. */
export function weeklyHours(availability: WeeklyAvailabilityResponse[]): DayHours[] {
  return DAYS_OF_WEEK.map((day) => ({
    day,
    label: DAY_LABEL[day],
    blocks: availability
      .filter((block) => block.is_active && block.day_of_week === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((block) => `${formatTime(block.start_time)} – ${formatTime(block.end_time)}`),
  }))
}

export function isClinicOpenOn(
  availability: WeeklyAvailabilityResponse[],
  iso: string,
): boolean | null {
  if (availability.length === 0) return null
  const day = dayOfWeekForIso(iso)
  if (!day) return null
  return availability.some((block) => block.is_active && block.day_of_week === day)
}

/**
 * The next `count` calendar days (starting today) on which the clinic has an
 * active availability block. Used to offer real dates instead of asking the
 * patient to hunt through a date picker for an open day.
 */
export function nextOpenDates(
  availability: WeeklyAvailabilityResponse[],
  count: number,
  from: Date = new Date(),
): string[] {
  const open = new Set(
    availability.filter((block) => block.is_active).map((block) => block.day_of_week),
  )
  if (open.size === 0) return []

  const dates: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let i = 0; i < 60 && dates.length < count; i += 1) {
    if (open.has(dayOfWeekFor(cursor))) dates.push(toIsoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

/** `2026-08-10` → `Mon 10 Aug`, for a compact date chip. */
export function shortDayLabel(iso: string): string {
  const date = parseIsoDay(iso)
  if (!date) return iso
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** `2026-08-10` → `Monday, 10 August 2026`, for a confirmation sentence. */
export function longDayLabel(iso: string): string {
  const date = parseIsoDay(iso)
  if (!date) return iso
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/* -------------------------------------------------------------------------- */
/*  Collection ordering                                                       */
/* -------------------------------------------------------------------------- */

/* The CMS controls order with `sort_order` and visibility with
   `is_active` / `is_published`. Both are honoured here, once, so no page can
   accidentally show an unpublished item. */

export function sortedServices(services: ServiceResponse[] | undefined): ServiceResponse[] {
  return (services ?? [])
    .filter((service) => service.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
}

export function sortedTestimonials(
  testimonials: TestimonialResponse[] | undefined,
): TestimonialResponse[] {
  return (testimonials ?? [])
    .filter((testimonial) => testimonial.is_published)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function sortedGallery(images: GalleryImageResponse[] | undefined): GalleryImageResponse[] {
  return (images ?? [])
    .filter((image) => image.is_published)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

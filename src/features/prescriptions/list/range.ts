/**
 * Date ranges and day-grouping for the prescription list. Pure functions only,
 * so the one place a doctor can be shown the wrong day is unit-tested.
 *
 * A "range" travels in the URL as a single `range` param: one of the four
 * named values, or a literal `YYYY-MM-DD` for a custom single day.
 */

import { addDays, format, isValid, parse } from 'date-fns'
import { parseApiDate, toIsoDate } from '../../../lib/format'
import { relativeDay } from '../../patients/relativeDay'

export const NAMED_RANGES = ['today', 'yesterday', '7d', 'all'] as const
export type NamedRange = (typeof NAMED_RANGES)[number]

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDay(value: string | null | undefined): value is string {
  return Boolean(value && ISO_DAY.test(value) && isValid(parse(value, 'yyyy-MM-dd', new Date())))
}

/**
 * The range actually in force. A missing or garbled `range` falls back to Today
 * — unless the doctor is hunting for someone (a search, a patient filter), in
 * which case Today would hide the very thing they asked for.
 */
export function resolveRange(raw: string | null, widen: boolean): string {
  if (raw && ((NAMED_RANGES as readonly string[]).includes(raw) || isIsoDay(raw))) return raw
  return widen ? 'all' : 'today'
}

/** `date_from` / `date_to` for the API. `all` sends neither. */
export function rangeBounds(
  range: string,
  now: Date = new Date(),
): { date_from?: string; date_to?: string } {
  const today = toIsoDate(now)
  switch (range) {
    case 'today':
      return { date_from: today, date_to: today }
    case 'yesterday': {
      const y = toIsoDate(addDays(now, -1))
      return { date_from: y, date_to: y }
    }
    case '7d':
      // Rolling 7 days including today — the same window as `stats.this_week`.
      return { date_from: toIsoDate(addDays(now, -6)), date_to: today }
    case 'all':
      return {}
    default:
      return { date_from: range, date_to: range }
  }
}

/** A range that can only ever contain one day, so its total IS that day's count. */
export const isSingleDay = (range: string) => range !== '7d' && range !== 'all'

/** Local calendar day of an API timestamp, `YYYY-MM-DD`. */
export function dayKey(createdAt: string): string {
  const d = parseApiDate(createdAt)
  return d ? toIsoDate(d) : 'unknown'
}

export function groupByDay<T extends { created_at: string }>(
  rows: readonly T[],
): { day: string; rows: T[] }[] {
  const groups: { day: string; rows: T[] }[] = []
  for (const row of rows) {
    const day = dayKey(row.created_at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.rows.push(row)
    else groups.push({ day, rows: [row] })
  }
  return groups
}

export interface DayLabel {
  /** "Today", "Yesterday", "3 days ago", "2 weeks ago" (from `relativeDay`). */
  relative: string
  /** "Wed 14 Oct" (year only when it is not this year). */
  date: string
  /** Everyday spoken Bengali: আজ / গতকাল / ৩ দিন আগে. */
  bn: string
}

export function dayLabel(day: string, now: Date = new Date()): DayLabel {
  const d = parse(day, 'yyyy-MM-dd', now)
  if (!isValid(d)) return { relative: '', date: 'Unknown date', bn: '' }

  const date = format(d, d.getFullYear() === now.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy')
  const rel = relativeDay(day, now)
  return { relative: rel?.en ?? '', date, bn: rel?.bn ?? '' }
}

/** "34y · F" — the clinical shorthand, so a row's second line stays one line. */
export function ageGender(age: number | null | undefined, gender: string | null | undefined) {
  const g = gender === 'male' ? 'M' : gender === 'female' ? 'F' : gender === 'other' ? 'Other' : ''
  return [age != null ? `${age}y` : '', g].filter(Boolean).join(' · ')
}

/** `{ hm: '10:42', ap: 'am' }` in the browser's local time. */
export function clockParts(createdAt: string): { hm: string; ap: string } | null {
  const d = parseApiDate(createdAt)
  return d ? { hm: format(d, 'h:mm'), ap: format(d, 'a').toLowerCase() } : null
}

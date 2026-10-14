/**
 * Recency buckets for the section headers of the "All" and "7 days" views.
 * The per-row wording ("৩ দিন আগে / 3 days ago") comes from `../relativeDay`;
 * this only decides which header a row sits under.
 */

import { differenceInCalendarDays } from 'date-fns'
import { parseApiDate } from '../../../lib/format'

export type VisitGroup = 'today' | 'yesterday' | 'week' | 'earlier' | 'never'

export function visitGroup(date: string | null | undefined, now: Date = new Date()): VisitGroup {
  const d = parseApiDate(date)
  if (!d) return 'never'
  const days = differenceInCalendarDays(now, d)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return days < 7 ? 'week' : 'earlier'
}

export const GROUP_LABEL: Record<VisitGroup, string> = {
  today: 'Seen today',
  yesterday: 'Yesterday',
  week: 'Earlier this week',
  earlier: 'Earlier',
  never: 'Not seen yet',
}

import { differenceInCalendarDays } from 'date-fns'
import { parseApiDate } from '../../lib/format'
import { toBnDigits } from '../prescriptions/bn'

/**
 * How long ago a visit was, in everyday spoken Bengali with the English beside
 * it: `আজ / Today`, `গতকাল / Yesterday`, `৩ দিন আগে / 3 days ago`. Calendar
 * days, not 24-hour blocks, so 11pm last night is "yesterday" at 8am.
 */
export function relativeDay(
  value: string | null | undefined,
  now: Date = new Date(),
): { bn: string; en: string } | null {
  const d = parseApiDate(value)
  if (!d) return null
  const days = Math.max(0, differenceInCalendarDays(now, d))
  if (days === 0) return { bn: 'আজ', en: 'Today' }
  if (days === 1) return { bn: 'গতকাল', en: 'Yesterday' }

  const [n, bn, en] =
    days < 7
      ? [days, 'দিন', 'day']
      : days < 30
        ? [Math.floor(days / 7), 'সপ্তাহ', 'week']
        : days < 365
          ? [Math.floor(days / 30), 'মাস', 'month']
          : [Math.floor(days / 365), 'বছর', 'year']
  return { bn: `${toBnDigits(n)} ${bn} আগে`, en: `${n} ${en}${n === 1 ? '' : 's'} ago` }
}

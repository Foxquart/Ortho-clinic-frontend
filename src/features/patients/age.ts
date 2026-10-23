/**
 * Age <-> date of birth. The API stores `date_of_birth` (DATE); the UI speaks
 * years + months. All maths is on local calendar fields, never `toISOString`,
 * so a clinic running east of UTC does not lose a day.
 */

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate()

/** `YYYY-MM-DD` (or a longer ISO string) -> local calendar parts, else null. */
function parts(dob: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? '')
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) }
}

/**
 * Today minus `years` and `months`, keeping the day of month and clamping it to
 * the end of a shorter month (31 Mar minus 1 month = 28/29 Feb).
 */
export function ageToDob(years: number, months: number, today: Date = new Date()): string {
  const total =
    today.getFullYear() * 12 + today.getMonth() - Math.trunc(years) * 12 - Math.trunc(months)
  const y = Math.floor(total / 12)
  const m = total - y * 12
  const d = Math.min(today.getDate(), daysIn(y, m))
  return `${pad(y, 4)}-${pad(m + 1)}-${pad(d)}`
}

/** Whole years and leftover whole months between `dob` and `today` (0/0 if in the future). */
export function dobToAge(dob: string, today: Date = new Date()): { years: number; months: number } {
  const p = parts(dob)
  if (!p) return { years: 0, months: 0 }
  let total = (today.getFullYear() - p.y) * 12 + (today.getMonth() - p.m)
  // The current month is not complete yet — unless today is the month's last
  // day and the birth day does not exist this month (31 Jan -> 28 Feb is a month).
  const lastDay = today.getDate() === daysIn(today.getFullYear(), today.getMonth())
  if (today.getDate() < p.d && !lastDay) total -= 1
  if (total < 0) return { years: 0, months: 0 }
  return { years: Math.floor(total / 12), months: total % 12 }
}

/** "34 Y 2 M", "8 M" under a year, "34 Y" on the birthday; "" when there is no usable DOB. */
export function formatAge(dob: string | null | undefined, today: Date = new Date()): string {
  if (!parts(dob)) return ''
  const { years, months } = dobToAge(dob as string, today)
  if (years === 0) return `${months} M`
  return months === 0 ? `${years} Y` : `${years} Y ${months} M`
}

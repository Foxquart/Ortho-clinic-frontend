/**
 * Bengali for the hardcoded VALUE choices on the prescription pad (frequency
 * presets, food timing, the live frequency and days line), shown small beside
 * the English so the doctor sees what the patient will read on the printed
 * page. Field and section labels carry no Bengali. Free text the doctor types
 * is translated server-side at print time.
 */

/** "After food" is the wording the printed page already uses. */
export const BN_FOOD = {
  after: 'খাবারের পরে',
  before: 'খাবারের আগে',
  with: 'খাবারের সাথে',
} as const

/** Frequency preset values (see RxRowEditor) to their Bengali label. */
export const BN_FREQUENCY_PRESET: Record<string, string> = {
  '1-0-0': 'শুধু সকালে',
  '1-0-1': 'সকালে আর রাতে',
  '1-1-1': 'দিনে তিনবার',
  '0-0-1': 'শুধু রাতে',
  SOS: 'দরকার হলে',
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const SLOTS = ['সকালে', 'দুপুরে', 'রাতে']

export const toBnDigits = (value: string | number): string =>
  String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)])

/** "5" → "৫ দিন". */
export const daysBn = (days: number): string => `${toBnDigits(days)} দিন`

/**
 * Port of `frequency_words_bn` in the API's app/services/print.py, so the pad
 * says exactly what the printed page will: '1-0-1' → 'সকালে ১টা এবং রাতে ১টা'.
 * Anything that is not three plain decimals with one positive returns ''.
 */
export function frequencyBn(frequency: string): string {
  const tokens = frequency
    .trim()
    .split('-')
    .map((t) => t.trim())
  if (tokens.length !== 3 || !tokens.every((t) => /^\d+(\.\d+)?$/.test(t))) return ''
  const counts = tokens.map(Number)
  const parts = counts.flatMap((count, i) =>
    count > 0 ? [`${SLOTS[i]} ${count === 0.5 ? 'আধা' : `${toBnDigits(count)}টা`}`] : [],
  )
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} এবং ${parts[parts.length - 1]}`
}

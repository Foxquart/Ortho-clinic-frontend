/**
 * Bengali for the hardcoded VALUE choices on the prescription pad (frequency
 * presets, food timing, the live frequency and days line), shown small beside
 * the English so the doctor sees what the patient will read on the printed
 * page. Field and section labels carry no Bengali. Free text the doctor types
 * is matched against the clinic phrasebook server-side at print time.
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
const SLOTS_BN = ['সকালে', 'দুপুরে', 'রাতে']
const SLOTS_EN = ['in the morning', 'in the afternoon', 'at night']

export const toBnDigits = (value: string | number): string =>
  String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)])

/** "5" → "৫ দিন". */
export const daysBn = (days: number): string => `${toBnDigits(days)} দিন`

const half = (n: number, whole: string): string => (n === 0.5 ? 'half' : whole)
const halfBn = (n: number, whole: string): string => (n === 0.5 ? 'আধা' : whole)

/**
 * How one dose count is said, by what is being dosed. Mirrors the API's
 * `frequency_words` / `frequency_words_bn` (app/services/print.py): a bare
 * count for tablets, spoons for syrup, drops for drops.
 */
const DOSE_UNITS = {
  tablet: {
    en: (n: number) => half(n, String(n)),
    bn: (n: number) => halfBn(n, `${toBnDigits(n)}টা`),
  },
  syrup: {
    en: (n: number) => `${half(n, String(n))} tsp`,
    bn: (n: number) => `${halfBn(n, toBnDigits(n))} চামচ`,
  },
  drops: {
    en: (n: number) => `${half(n, String(n))} ${n > 1 ? 'drops' : 'drop'}`,
    bn: (n: number) => `${halfBn(n, toBnDigits(n))} ফোঁটা`,
  },
}

/** Forms a count of "how many" means nothing for: the pad stays silent, as for "SOS". */
const NO_COUNT_FORMS = new Set(['ointment', 'cream', 'gel', 'injection', 'inhaler', 'powder'])

/** Unknown, missing or tablet-like forms (tablet, capsule, other) keep the tablet wording. */
function doseUnit(dosageForm?: string | null) {
  if (dosageForm === 'syrup' || dosageForm === 'drops') return DOSE_UNITS[dosageForm]
  return dosageForm && NO_COUNT_FORMS.has(dosageForm) ? null : DOSE_UNITS.tablet
}

/** "1-0-1" → [1, 0, 1]. Anything that is not three plain decimals with one positive → null. */
function parseCounts(frequency: string): number[] | null {
  const tokens = frequency
    .trim()
    .split('-')
    .map((t) => t.trim())
  if (tokens.length !== 3 || !tokens.every((t) => /^\d+(\.\d+)?$/.test(t))) return null
  const counts = tokens.map(Number)
  return counts.some((c) => c > 0) ? counts : null
}

function join(parts: string[], and: string): string {
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`
}

/**
 * Port of `frequency_words_bn` in the API's app/services/print.py, so the pad
 * says exactly what the printed page will: '1-0-1' → 'সকালে ১টা এবং রাতে ১টা';
 * for syrup 'সকালে ১ চামচ এবং রাতে ১ চামচ'. Anything that is not three plain
 * decimals with one positive, or a form with no count words, returns ''.
 */
export function frequencyBn(frequency: string, dosageForm?: string | null): string {
  const counts = parseCounts(frequency)
  const unit = doseUnit(dosageForm)
  if (!counts || !unit) return ''
  return join(
    counts.flatMap((n, i) => (n > 0 ? [`${SLOTS_BN[i]} ${unit.bn(n)}`] : [])),
    'এবং',
  )
}

/**
 * English counterpart of `frequencyBn`, port of `frequency_words`:
 * '1-0-1' → '1 in the morning and 1 at night'; for syrup '1 tsp in the morning
 * and 1 tsp at night'.
 */
export function frequencyEn(frequency: string, dosageForm?: string | null): string {
  const counts = parseCounts(frequency)
  const unit = doseUnit(dosageForm)
  if (!counts || !unit) return ''
  return join(
    counts.flatMap((n, i) => (n > 0 ? [`${unit.en(n)} ${SLOTS_EN[i]}`] : [])),
    'and',
  )
}

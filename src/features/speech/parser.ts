/**
 * Turning a dictated sentence into prescription rows.
 *
 * Pure, synchronous, dependency-free. The only import that is not vocabulary
 * data is a *type* from the prescription model, so this module compiles down to
 * plain functions over plain data and can be tested with `bun test` alone.
 *
 * Three rules govern everything below:
 *
 *  1. **Never invent a dose.** If a frequency was not spoken, `schedule` is
 *     `null`. Not `1-0-1`, not `0-0-0`. A blank the doctor has to fill is a
 *     nuisance; a fabricated dose on a printed prescription is an injury.
 *  2. **`0` and `null` are different.** "one zero one" *says* nothing in the
 *     afternoon and sets `a: 0`. Saying nothing at all about the afternoon
 *     leaves `a: null`.
 *  3. **Nothing is silently dropped.** Text that matched no pattern comes back
 *     in `unparsed` so the screen can show it. Losing what the doctor said is
 *     worse than failing to parse it.
 */
import type { DoseSchedule } from '@/features/prescriptions/model'
import {
  CONNECTORS,
  CONTEXTUAL_FREQUENCY_REPAIRS,
  COUNTABLE_UNITS,
  DOSE_FORMS,
  DOSE_UNITS,
  DURATION_CUES,
  DURATION_SKIP_WORDS,
  DURATION_UNITS,
  FOOD_CUES,
  FREQUENCY_ABBREVIATIONS,
  FREQUENCY_PHRASES,
  MAX_SCHEDULE_SLOT,
  MEDICINE_VERBS,
  PRN_PHRASES,
  ROW_CONNECTORS,
  SCHEDULE_WORD_NUMBERS,
  SECTION_CUES,
  STOP_WORDS,
  STRENGTH_NUMBER_FLOOR,
  STRENGTH_UNITS,
  TIME_WORDS,
  WORD_NUMBERS,
  tokenise,
} from './vocabulary'
import type { FoodTiming, SectionKind, SpeechToken } from './vocabulary'

/* -------------------------------------------------------------------------- */
/*  The shape handed to the prescription pad                                   */
/* -------------------------------------------------------------------------- */

export interface ParsedRow {
  /** The drug name as heard, verbatim — original casing, never normalised. */
  spokenName: string
  /** Null when no frequency was spoken at all. Never guessed. */
  schedule: DoseSchedule | null
  durationDays: number | null
  food: FoodTiming | null
  prn: boolean
  /** Anything the structured fields cannot hold, in the doctor's own words. */
  instructions: string | null
  /** The exact span of the transcript this row came from. */
  sourceText: string
}

export interface ParsedDictation {
  rows: ParsedRow[]
  diagnosis: string | null
  chiefComplaint: string | null
  advice: string | null
  investigations: string | null
  followUpDays: number | null
  /** Text that matched nothing. Never silently discard it. */
  unparsed: string[]
}

/* -------------------------------------------------------------------------- */
/*  Lookup sets built once                                                     */
/* -------------------------------------------------------------------------- */

const MEDICINE_VERB_SET = new Set(MEDICINE_VERBS)
const CONNECTOR_SET = new Set(CONNECTORS)
const ROW_CONNECTOR_SET = new Set(ROW_CONNECTORS)
const TIME_WORD_SET = new Set(TIME_WORDS)
const STRENGTH_UNIT_SET = new Set(STRENGTH_UNITS)
const COUNTABLE_UNIT_SET = new Set(COUNTABLE_UNITS)
const DURATION_CUE_SET = new Set(DURATION_CUES)
const DURATION_SKIP_SET = new Set(DURATION_SKIP_WORDS)

/**
 * Every word the vocabulary knows about. A word that is *not* in here, sitting
 * after "and", is probably a drug name — that inference is the whole basis of
 * chained-row splitting.
 */
const KNOWN_WORDS = new Set<string>([
  ...Object.keys(WORD_NUMBERS),
  ...Object.keys(SCHEDULE_WORD_NUMBERS),
  ...Object.keys(DOSE_FORMS),
  ...Object.keys(DOSE_UNITS),
  ...Object.keys(DURATION_UNITS),
  ...Object.keys(FREQUENCY_ABBREVIATIONS),
  ...Object.keys(CONTEXTUAL_FREQUENCY_REPAIRS),
  ...STRENGTH_UNITS,
  ...TIME_WORDS,
  ...CONNECTORS,
  ...MEDICINE_VERBS,
  ...DURATION_CUES,
  ...DURATION_SKIP_WORDS,
  ...STOP_WORDS,
  ...FREQUENCY_PHRASES.flatMap((p) => [...p.words]),
  ...FOOD_CUES.flatMap((c) => [...c.words]),
  ...PRN_PHRASES.flatMap((p) => [...p]),
  ...SECTION_CUES.flatMap((c) => [...c.words]),
])

/** Longest cue first, so "diagnosis is" beats "diagnosis". */
const ORDERED_SECTION_CUES = [...SECTION_CUES].sort((a, b) => b.words.length - a.words.length)
const ORDERED_FREQUENCY_PHRASES = [...FREQUENCY_PHRASES].sort(
  (a, b) => b.words.length - a.words.length,
)
const ORDERED_FOOD_CUES = [...FOOD_CUES].sort((a, b) => b.words.length - a.words.length)
const ORDERED_PRN_PHRASES = [...PRN_PHRASES].sort((a, b) => b.length - a.length)

/**
 * What a bare count means when the doctor named a form but no unit. "cap
 * myoril one at night" is one capsule; "syrup X one at night" is not one
 * syrup, so syrup is deliberately absent.
 */
const FORM_DEFAULT_UNIT: Readonly<Record<string, string>> = {
  tab: 'tab',
  cap: 'cap',
  drops: 'drop',
  sachet: 'sachet',
  patch: 'patch',
  inhaler: 'puff',
}

/* -------------------------------------------------------------------------- */
/*  Token helpers                                                              */
/* -------------------------------------------------------------------------- */

function isPunct(token: SpeechToken): boolean {
  return token.kind === 'punct'
}

/** A vocabulary word matches a token by spelling, or by numeric value. */
function tokenMatches(token: SpeechToken, word: string): boolean {
  if (token.norm === word) return true
  const wordValue = WORD_NUMBERS[word] ?? (/^\d+(\.\d+)?$/.test(word) ? Number(word) : undefined)
  return wordValue !== undefined && token.value === wordValue
}

/**
 * Match a word sequence starting at `i`, stepping over punctuation so
 * "morning, and night" reads the same as "morning and night". Returns the
 * number of tokens consumed, or 0.
 */
function matchWords(
  tokens: readonly SpeechToken[],
  i: number,
  words: readonly string[],
  to: number,
): number {
  let k = i
  for (const word of words) {
    while (k < to && isPunct(tokens[k])) k++
    if (k >= to || !tokenMatches(tokens[k], word)) return 0
    k++
  }
  return k - i
}

/** True when every non-punctuation token in the range is still unclaimed. */
function rangeFree(tokens: readonly SpeechToken[], used: boolean[], from: number, to: number) {
  for (let i = from; i < to; i++) {
    if (!isPunct(tokens[i]) && used[i]) return false
  }
  return true
}

function claim(used: boolean[], from: number, to: number) {
  for (let i = from; i < to; i++) used[i] = true
}

/** Find the first free occurrence of a word sequence inside a span. */
function findPhrase(
  tokens: readonly SpeechToken[],
  used: boolean[],
  from: number,
  to: number,
  words: readonly string[],
): { start: number; end: number } | null {
  for (let i = from; i < to; i++) {
    if (used[i] || isPunct(tokens[i])) continue
    const length = matchWords(tokens, i, words, to)
    if (length > 0 && rangeFree(tokens, used, i, i + length)) {
      return { start: i, end: i + length }
    }
  }
  return null
}

/**
 * The transcript exactly as spoken across a span — filler words and all. This
 * is what `sourceText` quotes: the doctor gets to see what they actually said,
 * not a cleaned-up version of it.
 */
function sliceRaw(source: string, tokens: readonly SpeechToken[], from: number, to: number): string {
  if (to <= from) return ''
  return source.slice(tokens[from].start, tokens[to - 1].end).trim()
}

/**
 * The same span with dropped filler left out — "dolo uh 650" becomes
 * "dolo 650". Used for the drug name, where an "uh" in the middle is noise
 * rather than evidence.
 */
function joinRaw(tokens: readonly SpeechToken[], from: number, to: number): string {
  let out = ''
  for (let i = from; i < to; i++) {
    const token = tokens[i]
    if (out === '') out = token.raw
    else if (token.join === '-') out += `-${token.raw}`
    else out += ` ${token.raw}`
  }
  return out.trim()
}

/* -------------------------------------------------------------------------- */
/*  Splitting the dictation into spans                                         */
/* -------------------------------------------------------------------------- */

type ChunkKind = SectionKind | 'unknown'

interface Chunk {
  kind: ChunkKind
  /** First token of the span, cue words included — this is what gets quoted. */
  from: number
  /** First token of the span's *content*. */
  contentFrom: number
  to: number
}

function isMedicineOpener(token: SpeechToken): boolean {
  return token.kind === 'word' && (DOSE_FORMS[token.norm] !== undefined || MEDICINE_VERB_SET.has(token.norm))
}

/**
 * Is this dose-form word the unit of a dose just spoken ("two **tabs**"),
 * rather than the start of another medicine ("…grade two, **tab** dolo")?
 *
 * Two guards, and both are load-bearing:
 *
 *  - Punctuation breaks the pairing. A unit sits against its number; a comma
 *    between them means the number belonged to the sentence before.
 *  - A drug name after the form word overrules everything. "grade two tab dolo
 *    650" has no comma to help, and reading `tab` as a unit there loses the
 *    whole medicine — the failure this function must never cause.
 */
function isDoseUnitUse(tokens: readonly SpeechToken[], i: number): boolean {
  let followsNumber = false
  for (let k = i - 1; k >= 0; k--) {
    // A comma or full stop between the number and the form word means they are
    // not a pair.
    if (isPunct(tokens[k])) break
    if (tokens[k].kind === 'number') {
      followsNumber = true
      break
    }
    // "half a tablet" — the weak "a" does not break the pairing.
    if (tokens[k].norm === 'a' || tokens[k].norm === 'an') continue
    break
  }
  if (!followsNumber) return false

  // "two tabs twice a day" — the next word is vocabulary, so `tabs` is a unit.
  // "grade two tab dolo" — `dolo` is a name, so `tab` opened a row.
  const next = tokens[i + 1]
  if (next && next.kind === 'word' && !KNOWN_WORDS.has(next.norm)) return false
  return true
}

function matchSectionCue(
  tokens: readonly SpeechToken[],
  i: number,
  to: number,
): { kind: SectionKind; length: number; keepWords: boolean } | null {
  for (const cue of ORDERED_SECTION_CUES) {
    const length = matchWords(tokens, i, cue.words, to)
    if (length > 0) return { kind: cue.kind, length, keepWords: cue.keepWords === true }
  }
  return null
}

/** Does a span hold anything worth keeping, or only cue words and punctuation? */
function isSubstantive(
  tokens: readonly SpeechToken[],
  kind: ChunkKind,
  from: number,
  to: number,
): boolean {
  for (let i = from; i < to; i++) {
    const token = tokens[i]
    if (isPunct(token)) continue
    if (kind === 'medicine') {
      if (isMedicineOpener(token) || CONNECTOR_SET.has(token.norm)) continue
    }
    return true
  }
  return false
}

/**
 * The heart of the thing: deciding that the word after "and" starts another
 * medicine.
 *
 * A drug name is a word the vocabulary has never heard of. So: an unknown word
 * (up to four of them, for "zerodol SP" style names), followed immediately by
 * something dose-shaped — a number, a unit, a frequency, "for". That is enough
 * to split "…for three days, and shelcal one daily for a month" without
 * splitting "morning and night" or "for pain and swelling".
 */
function startsNewMedicine(tokens: readonly SpeechToken[], i: number, to: number): boolean {
  let k = i
  let nameTokens = 0
  while (k < to && nameTokens < 4) {
    const token = tokens[k]
    if (token.kind !== 'word' || KNOWN_WORDS.has(token.norm)) break
    nameTokens++
    k++
  }
  if (nameTokens === 0) return false
  const signal = tokens[k]
  if (!signal) return false
  if (signal.kind === 'number') return true
  if (signal.kind === 'punct') return false
  return (
    FREQUENCY_ABBREVIATIONS[signal.norm] !== undefined ||
    DOSE_UNITS[signal.norm] !== undefined ||
    DURATION_CUE_SET.has(signal.norm) ||
    TIME_WORD_SET.has(signal.norm)
  )
}

function splitChunks(tokens: readonly SpeechToken[]): Chunk[] {
  const chunks: Chunk[] = []
  const total = tokens.length
  let current: Chunk = { kind: 'unknown', from: 0, contentFrom: 0, to: 0 }

  /**
   * Close the current span at `at` and start a new one. A span that turned out
   * to hold nothing but cue words is not emitted — instead the new span
   * inherits its start, so "start tab zerodol" quotes back in full.
   */
  const open = (at: number, kind: ChunkKind, contentFrom: number) => {
    const keep = isSubstantive(tokens, current.kind, current.contentFrom, at)
    if (keep) {
      chunks.push({ ...current, to: at })
      current = { kind, from: at, contentFrom, to: at }
    } else {
      current = { kind, from: Math.min(current.from, at), contentFrom, to: at }
    }
  }

  let i = 0
  while (i < total) {
    const token = tokens[i]

    // A full stop ends whatever was being said. Commas do not — doctors chain
    // medicines with commas constantly.
    if (isPunct(token)) {
      if (token.norm === '.' || token.norm === ';') {
        open(i, 'unknown', i + 1)
        current.from = i + 1
      }
      i++
      continue
    }

    const cue = matchSectionCue(tokens, i, total)
    if (cue) {
      open(i, cue.kind, cue.keepWords ? i : i + cue.length)
      i += cue.length
      continue
    }

    // "tab" opens a row — except where it is the unit of a dose just spoken
    // ("two tabs", "half tablet").
    if (isMedicineOpener(token) && !isDoseUnitUse(tokens, i)) {
      open(i, 'medicine', i)
      i += 1
      continue
    }

    if (
      current.kind === 'medicine' &&
      ROW_CONNECTOR_SET.has(token.norm) &&
      startsNewMedicine(tokens, i + 1, total)
    ) {
      open(i, 'medicine', i + 1)
      current.from = i + 1
      i += 1
      continue
    }

    i++
  }

  if (isSubstantive(tokens, current.kind, current.contentFrom, total)) {
    chunks.push({ ...current, to: total })
  }
  return chunks
}

/* -------------------------------------------------------------------------- */
/*  Frequency                                                                  */
/* -------------------------------------------------------------------------- */

function scheduleValue(token: SpeechToken): number | null {
  if (token.kind === 'number' && token.value !== undefined) {
    return token.value <= MAX_SCHEDULE_SLOT ? token.value : null
  }
  const word = SCHEDULE_WORD_NUMBERS[token.norm]
  return word === undefined ? null : word
}

/**
 * `1-0-1`, `one zero one`, `1 0 1`, `half-0-half`, `0.5-0-0.5`.
 *
 * Three slot-sized numbers in a row, and nothing number-shaped immediately
 * after them — that last guard is what stops "for 5 days 2 tabs" style runs
 * from being read as a grid.
 */
function findScheduleTriple(
  tokens: readonly SpeechToken[],
  used: boolean[],
  from: number,
  to: number,
): { schedule: DoseSchedule; start: number; end: number } | null {
  for (let i = from; i + 2 < to; i++) {
    if (used[i] || used[i + 1] || used[i + 2]) continue
    const m = scheduleValue(tokens[i])
    const a = scheduleValue(tokens[i + 1])
    const n = scheduleValue(tokens[i + 2])
    if (m === null || a === null || n === null) continue
    const after = tokens[i + 3]
    if (after && scheduleValue(after) !== null && !used[i + 3]) continue
    return { schedule: { m, a, n }, start: i, end: i + 3 }
  }
  return null
}

interface FrequencyResult {
  schedule: DoseSchedule | null
  prn: boolean
  notes: string[]
  /** True when the grid came from words rather than an explicit triple. */
  fromWords: boolean
}

function readFrequency(
  tokens: readonly SpeechToken[],
  used: boolean[],
  from: number,
  to: number,
): FrequencyResult {
  const result: FrequencyResult = { schedule: null, prn: false, notes: [], fromWords: false }

  const triple = findScheduleTriple(tokens, used, from, to)
  if (triple) {
    result.schedule = triple.schedule
    claim(used, triple.start, triple.end)
  }

  // Latin abbreviations.
  for (let i = from; i < to; i++) {
    if (used[i] || tokens[i].kind !== 'word') continue
    const entry = FREQUENCY_ABBREVIATIONS[tokens[i].norm]
    if (!entry) continue
    if (result.schedule === null && entry.schedule) {
      result.schedule = { ...entry.schedule }
      result.fromWords = true
    }
    if (entry.prn) result.prn = true
    if (entry.note) result.notes.push(entry.note)
    used[i] = true
  }

  // Plain English, longest phrase first.
  for (const phrase of ORDERED_FREQUENCY_PHRASES) {
    const hit = findPhrase(tokens, used, from, to, phrase.words)
    if (!hit) continue
    if (result.schedule === null && phrase.schedule) {
      result.schedule = { ...phrase.schedule }
      result.fromWords = true
    }
    if (phrase.note) result.notes.push(phrase.note)
    claim(used, hit.start, hit.end)
  }

  // As-needed.
  for (const phrase of ORDERED_PRN_PHRASES) {
    const hit = findPhrase(tokens, used, from, to, phrase)
    if (!hit) continue
    result.prn = true
    claim(used, hit.start, hit.end)
  }

  // Only now, with nothing else recognised, are the contextual mishearings
  // worth risking. See CONTEXTUAL_FREQUENCY_REPAIRS for why each is safe.
  if (result.schedule === null && !result.prn) {
    for (let i = from; i < to; i++) {
      if (used[i] || tokens[i].kind !== 'word') continue
      const repaired = CONTEXTUAL_FREQUENCY_REPAIRS[tokens[i].norm]
      if (!repaired) continue
      const previous = tokens[i - 1]
      // "inj depot medrol" is a real depot injection, not a BD instruction.
      if (repaired === 'bd' && previous && (previous.norm === 'inj' || previous.norm === 'injection')) {
        continue
      }
      const entry = FREQUENCY_ABBREVIATIONS[repaired]
      if (!entry?.schedule) continue
      result.schedule = { ...entry.schedule }
      result.fromWords = true
      used[i] = true
      break
    }
  }

  return result
}

/* -------------------------------------------------------------------------- */
/*  Duration                                                                   */
/* -------------------------------------------------------------------------- */

interface DurationHit {
  days: number
  start: number
  end: number
}

/** "for five days", "for 2 weeks", "for a month", "x5d", "10 days". */
function findDuration(
  tokens: readonly SpeechToken[],
  used: boolean[],
  from: number,
  to: number,
): DurationHit | null {
  for (let i = from; i < to; i++) {
    if (used[i] || isPunct(tokens[i])) continue
    const token = tokens[i]

    // "x5d" / "x 5 days" — the tokeniser has already split the digits out.
    if (token.norm === 'x') {
      const quantity = tokens[i + 1]
      if (!quantity || used[i + 1] || quantity.kind !== 'number' || quantity.value === undefined) {
        continue
      }
      const unit = tokens[i + 2]
      const multiplier = unit && !used[i + 2] ? DURATION_UNITS[unit.norm] : undefined
      return {
        days: quantity.value * (multiplier ?? 1),
        start: i,
        end: multiplier === undefined ? i + 2 : i + 3,
      }
    }

    if (DURATION_CUE_SET.has(token.norm)) {
      let k = i + 1
      while (k < to && (isPunct(tokens[k]) || DURATION_SKIP_SET.has(tokens[k].norm))) k++
      const quantity = tokens[k]
      if (!quantity || used[k] || quantity.value === undefined) continue
      const unit = tokens[k + 1]
      const multiplier = unit && !used[k + 1] ? DURATION_UNITS[unit.norm] : undefined
      if (multiplier === undefined) continue
      return { days: quantity.value * multiplier, start: i, end: k + 2 }
    }

    // A bare "10 days" / "one week", with no cue in front of it.
    //
    // The weak "a" only counts at the very start of the span — that is
    // "review after | a month". Anywhere else it would read "maximum two a
    // day" as a one-day course, which is both wrong and dangerous.
    if (token.value !== undefined && (token.kind === 'number' || i === from)) {
      const unit = tokens[i + 1]
      const multiplier = unit && !used[i + 1] ? DURATION_UNITS[unit.norm] : undefined
      if (multiplier !== undefined) {
        return { days: token.value * multiplier, start: i, end: i + 2 }
      }
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Amount                                                                     */
/* -------------------------------------------------------------------------- */

interface AmountHit {
  count: number
  unit: string | null
  start: number
  end: number
}

function findAmount(
  tokens: readonly SpeechToken[],
  used: boolean[],
  from: number,
  to: number,
): AmountHit | null {
  for (let i = from; i < to; i++) {
    if (used[i] || tokens[i].kind !== 'number' || tokens[i].value === undefined) continue
    let k = i + 1
    // "half a tablet" — step over the weak "a".
    while (k < to && !used[k] && (isPunct(tokens[k]) || tokens[k].norm === 'a' || tokens[k].norm === 'an')) {
      k++
    }
    const unitToken = tokens[k]
    const unit = unitToken && !used[k] ? DOSE_UNITS[unitToken.norm] : undefined
    if (unit) return { count: tokens[i].value as number, unit, start: i, end: k + 1 }
    return { count: tokens[i].value as number, unit: null, start: i, end: i + 1 }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  One medicine                                                               */
/* -------------------------------------------------------------------------- */

/** Does this token end the drug name? */
function endsName(
  tokens: readonly SpeechToken[],
  i: number,
  to: number,
  nameLength: number,
): boolean {
  const token = tokens[i]
  if (isPunct(token)) return true

  if (token.kind === 'number') {
    const next = tokens[i + 1]
    // "650 mg", or a bare number too large to be a dose — that is a strength,
    // and a strength belongs to the name.
    if (next && STRENGTH_UNIT_SET.has(next.norm)) return false
    if ((token.value ?? 0) >= STRENGTH_NUMBER_FLOOR) return false
    return true
  }

  if (STRENGTH_UNIT_SET.has(token.norm)) return false
  if (FREQUENCY_ABBREVIATIONS[token.norm] !== undefined) return true
  if (DOSE_UNITS[token.norm] !== undefined) return true
  if (DOSE_FORMS[token.norm] !== undefined) return true
  if (TIME_WORD_SET.has(token.norm)) return true
  if (CONNECTOR_SET.has(token.norm)) return true
  if (DURATION_CUE_SET.has(token.norm)) return true
  // A contextual mishearing ("zerodol odd") only ends a name that already has
  // one — "inj depot medrol" must keep its first word.
  if (nameLength > 0 && CONTEXTUAL_FREQUENCY_REPAIRS[token.norm] !== undefined) return true

  for (const phrase of ORDERED_FREQUENCY_PHRASES) {
    if (matchWords(tokens, i, phrase.words, to) > 0) return true
  }
  for (const cue of ORDERED_FOOD_CUES) {
    if (matchWords(tokens, i, cue.words, to) > 0) return true
  }
  for (const phrase of ORDERED_PRN_PHRASES) {
    if (matchWords(tokens, i, phrase, to) > 0) return true
  }
  return false
}

/** The most tablets a name may absorb before we assume it has run away. */
const MAX_NAME_TOKENS = 5

function parseMedicine(
  source: string,
  tokens: readonly SpeechToken[],
  chunk: Chunk,
): { row: ParsedRow | null; unparsed: string | null } {
  const { from, to } = chunk
  const used: boolean[] = new Array(tokens.length).fill(false)

  let i = from
  let form: string | null = null

  // Leading verbs and the dose form: "start tab …", "also give cap …".
  while (i < to) {
    const token = tokens[i]
    if (isPunct(token) || MEDICINE_VERB_SET.has(token.norm) || CONNECTOR_SET.has(token.norm)) {
      used[i] = true
      i++
      continue
    }
    const known = DOSE_FORMS[token.norm]
    if (known) {
      form = known
      used[i] = true
      i++
      continue
    }
    break
  }

  // The name, verbatim.
  const nameStart = i
  let nameEnd = i
  while (nameEnd < to && nameEnd - nameStart < MAX_NAME_TOKENS) {
    if (endsName(tokens, nameEnd, to, nameEnd - nameStart)) break
    nameEnd++
  }
  const spokenName = joinRaw(tokens, nameStart, nameEnd).replace(/[,;:]+$/, '')
  if (!spokenName) {
    return { row: null, unparsed: sliceRaw(source, tokens, from, to) }
  }
  // A number kept inside the name is a strength — "dolo 650", "pan 40 mg" —
  // and a strength is evidence that this really is a drug.
  let strengthInName = false
  for (let k = nameStart; k < nameEnd; k++) {
    if (tokens[k].kind === 'number') strengthInName = true
  }
  claim(used, nameStart, nameEnd)

  const notes: string[] = []

  const frequency = readFrequency(tokens, used, from, to)
  notes.push(...frequency.notes)

  const duration = findDuration(tokens, used, from, to)
  if (duration) claim(used, duration.start, duration.end)

  let food: FoodTiming | null = null
  for (const cue of ORDERED_FOOD_CUES) {
    const hit = findPhrase(tokens, used, from, to, cue.words)
    if (!hit) continue
    food ??= cue.timing
    claim(used, hit.start, hit.end)
  }

  const amount = findAmount(tokens, used, from, to)
  if (amount) claim(used, amount.start, amount.end)

  const unit = amount ? (amount.unit ?? (form ? (FORM_DEFAULT_UNIT[form] ?? null) : null)) : null

  const schedule = scaleSchedule(frequency, amount, unit)

  /**
   * Is there any evidence this span is a prescription at all?
   *
   * "a word the vocabulary has never heard of" also describes most ordinary
   * English, so "give him something for the pain" would otherwise become a row
   * named "him something" — a phantom that blocks printing and makes the
   * doctor work out why. A real medicine carries at least one corroborating
   * signal: a dose form, a strength, an amount, a schedule, a duration, or an
   * as-needed instruction. Without one, the words go to `unparsed`, which is
   * exactly what that field is for.
   */
  const corroborated =
    form !== null ||
    strengthInName ||
    amount !== null ||
    schedule !== null ||
    duration !== null ||
    frequency.prn
  if (!corroborated) {
    return { row: null, unparsed: quotedSpan(source, tokens, from, to) }
  }

  // Whatever is left is still the doctor's words. It goes on the row rather
  // than into `unparsed`, because it belongs to this medicine.
  const leftover = collectLeftover(source, tokens, used, from, to)
  if (leftover) notes.push(leftover)

  return {
    row: {
      spokenName,
      schedule,
      durationDays: duration ? duration.days : null,
      food,
      prn: frequency.prn,
      instructions: notes.length ? notes.join('; ') : null,
      sourceText: quotedSpan(source, tokens, from, to),
    },
    unparsed: null,
  }
}

/**
 * The span as it should be quoted back: the doctor's words, minus the
 * punctuation and the trailing "and" that only exist to join this item to the
 * next one.
 */
function quotedSpan(
  source: string,
  tokens: readonly SpeechToken[],
  from: number,
  to: number,
): string {
  let end = to
  while (end > from && (isPunct(tokens[end - 1]) || CONNECTOR_SET.has(tokens[end - 1].norm))) end--
  return sliceRaw(source, tokens, from, end).replace(/^[,;:\s]+|[,;:\s]+$/g, '')
}

/**
 * "two tabs twice a day" is 2-0-2, not 1-0-1 — the grid counts units, so a
 * spoken amount scales it. Only a grid that came from *words* is scaled: an
 * explicit "1-0-1" already says exactly what it means. And only countable
 * units scale — "10 ml twice daily" is one 10 ml dose morning and night.
 */
function scaleSchedule(
  frequency: FrequencyResult,
  amount: AmountHit | null,
  unit: string | null,
): DoseSchedule | null {
  const schedule = frequency.schedule
  if (!schedule || !amount || !frequency.fromWords) return schedule
  if (amount.count === 1) return schedule
  const countable = unit === null || COUNTABLE_UNIT_SET.has(unit)
  if (!countable) return schedule
  const slots = [schedule.m, schedule.a, schedule.n]
  if (!slots.every((slot) => slot === 0 || slot === 1)) return schedule
  return {
    m: schedule.m === 1 ? amount.count : schedule.m,
    a: schedule.a === 1 ? amount.count : schedule.a,
    n: schedule.n === 1 ? amount.count : schedule.n,
  }
}

const NOISE_ONLY = new Set([...CONNECTORS, ...MEDICINE_VERBS, 'the', 'a', 'an', 'of', 'to', 'is'])

function collectLeftover(
  source: string,
  tokens: readonly SpeechToken[],
  used: boolean[],
  from: number,
  to: number,
): string | null {
  const parts: string[] = []
  let runStart = -1
  const flush = (end: number) => {
    if (runStart === -1) return
    let meaningful = false
    for (let i = runStart; i < end; i++) {
      if (!isPunct(tokens[i]) && !NOISE_ONLY.has(tokens[i].norm)) meaningful = true
    }
    if (meaningful) {
      const text = sliceRaw(source, tokens, runStart, end).replace(/^[,;:\s]+|[,;:\s]+$/g, '')
      if (text) parts.push(text)
    }
    runStart = -1
  }
  for (let i = from; i < to; i++) {
    if (used[i] || isPunct(tokens[i])) {
      flush(i)
      continue
    }
    if (runStart === -1) runStart = i
  }
  flush(to)
  return parts.length ? parts.join(' ') : null
}

/* -------------------------------------------------------------------------- */
/*  Narrative sections                                                         */
/* -------------------------------------------------------------------------- */

const SECTION_TRIM = new Set(['is', 'of', 'the', 'and', 'then', 'also', 'plus', 'for', 'a', 'an'])

function sectionText(source: string, tokens: readonly SpeechToken[], chunk: Chunk): string {
  let start = chunk.contentFrom
  let end = chunk.to
  while (start < end && (isPunct(tokens[start]) || SECTION_TRIM.has(tokens[start].norm))) start++
  while (end > start && (isPunct(tokens[end - 1]) || SECTION_TRIM.has(tokens[end - 1].norm))) end--
  return sliceRaw(source, tokens, start, end)
}

/* -------------------------------------------------------------------------- */
/*  The entry point                                                            */
/* -------------------------------------------------------------------------- */

const EMPTY: ParsedDictation = {
  rows: [],
  diagnosis: null,
  chiefComplaint: null,
  advice: null,
  investigations: null,
  followUpDays: null,
  unparsed: [],
}

export function parseDictation(transcript: string): ParsedDictation {
  if (!transcript || !transcript.trim()) return { ...EMPTY, unparsed: [] }

  const tokens = tokenise(transcript)
  if (tokens.length === 0) return { ...EMPTY, unparsed: [] }

  const chunks = splitChunks(tokens)

  const rows: ParsedRow[] = []
  const unparsed: string[] = []
  const sections: Record<'diagnosis' | 'complaint' | 'advice' | 'investigations', string[]> = {
    diagnosis: [],
    complaint: [],
    advice: [],
    investigations: [],
  }
  let followUpDays: number | null = null

  for (const chunk of chunks) {
    switch (chunk.kind) {
      case 'medicine': {
        const parsed = parseMedicine(transcript, tokens, chunk)
        if (parsed.row) rows.push(parsed.row)
        else if (parsed.unparsed) unparsed.push(parsed.unparsed)
        break
      }
      case 'diagnosis':
      case 'complaint':
      case 'advice':
      case 'investigations': {
        const text = sectionText(transcript, tokens, chunk)
        if (text) sections[chunk.kind].push(text)
        else {
          const raw = sliceRaw(transcript, tokens, chunk.from, chunk.to)
          if (raw) unparsed.push(raw)
        }
        break
      }
      case 'followUp': {
        const used: boolean[] = new Array(tokens.length).fill(false)
        const duration = findDuration(tokens, used, chunk.contentFrom, chunk.to)
        // A follow-up we cannot put a number on is still something the doctor
        // said, so it survives as text rather than disappearing.
        if (duration) followUpDays ??= duration.days
        else {
          const raw = sliceRaw(transcript, tokens, chunk.from, chunk.to)
          if (raw) unparsed.push(raw)
        }
        break
      }
      default: {
        const raw = sliceRaw(transcript, tokens, chunk.from, chunk.to).replace(
          /^[,;:.\s]+|[,;:.\s]+$/g,
          '',
        )
        if (raw) unparsed.push(raw)
        break
      }
    }
  }

  return {
    rows,
    diagnosis: joinSection(sections.diagnosis),
    chiefComplaint: joinSection(sections.complaint),
    advice: joinSection(sections.advice),
    investigations: joinSection(sections.investigations),
    followUpDays,
    unparsed,
  }
}

function joinSection(parts: readonly string[]): string | null {
  const joined = parts.filter(Boolean).join('; ').trim()
  return joined === '' ? null : joined
}

/* -------------------------------------------------------------------------- */
/*  Small helpers the UI shares                                                */
/* -------------------------------------------------------------------------- */

/** "1-0-1", or "—" when nothing was said. Display only. */
export function describeSchedule(schedule: DoseSchedule | null): string {
  if (!schedule) return '—'
  const part = (value: number | null) => (value === null ? '_' : String(value))
  return `${part(schedule.m)}-${part(schedule.a)}-${part(schedule.n)}`
}

/** True when a parse produced nothing at all worth handing on. */
export function isEmptyDictation(parsed: ParsedDictation): boolean {
  return (
    parsed.rows.length === 0 &&
    parsed.diagnosis === null &&
    parsed.chiefComplaint === null &&
    parsed.advice === null &&
    parsed.investigations === null &&
    parsed.followUpDays === null
  )
}

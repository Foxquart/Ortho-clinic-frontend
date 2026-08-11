/**
 * The words an orthopaedic clinic actually says out loud.
 *
 * Everything the parser recognises lives here, in tables, for two reasons:
 * the parser stays a matcher rather than a pile of regexes, and the UI can
 * render "things you can say" hints from the same source — so a cue the hint
 * text advertises is, by construction, a cue the parser understands.
 *
 * Nothing in this file imports React or touches the network. The only import
 * is a *type*, so this module is erased to plain data at build time.
 */
import type { DoseSchedule } from '@/features/prescriptions/model'

export type FoodTiming = 'before' | 'after' | 'with'

/* -------------------------------------------------------------------------- */
/*  Numbers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Spoken cardinals. Twenty is the ceiling on purpose: past that a doctor says
 * digits, and a long word-number chain is far more likely to be a mis-hearing
 * than a dose.
 */
export const WORD_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0,
  nought: 0,
  nil: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  half: 0.5,
  quarter: 0.25,
}

/**
 * Words that mean one but are almost never *said* as a count — "a month",
 * "an injection". They carry a value so `for a month` resolves, but they are
 * never treated as a spoken amount on their own.
 */
export const WEAK_NUMBERS: Readonly<Record<string, number>> = { a: 1, an: 1 }

/**
 * What may appear inside a spoken `m-a-n` triple. Deliberately narrower than
 * `WORD_NUMBERS`: a slot above four is not a dose, it is a misparse, and
 * allowing "a" in here would turn "once a day" into a triple.
 */
export const SCHEDULE_WORD_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0,
  nought: 0,
  nil: 0,
  oh: 0,
  o: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  half: 0.5,
}

/** The largest value a single `m-a-n` slot may hold before we distrust it. */
export const MAX_SCHEDULE_SLOT = 4

/* -------------------------------------------------------------------------- */
/*  Dose forms and units                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Alias → canonical dose form. These double as row-splitting cues: "tab",
 * "cap", "syrup", "inj" are how a doctor signals "next medicine".
 */
export const DOSE_FORMS: Readonly<Record<string, string>> = {
  tab: 'tab',
  tabs: 'tab',
  tablet: 'tab',
  tablets: 'tab',
  cap: 'cap',
  caps: 'cap',
  capsule: 'cap',
  capsules: 'cap',
  syrup: 'syrup',
  syrups: 'syrup',
  syp: 'syrup',
  syr: 'syrup',
  susp: 'suspension',
  suspension: 'suspension',
  inj: 'inj',
  injection: 'inj',
  injections: 'inj',
  oint: 'oint',
  ointment: 'oint',
  cream: 'cream',
  gel: 'gel',
  lotion: 'lotion',
  spray: 'spray',
  drops: 'drops',
  drop: 'drops',
  sachet: 'sachet',
  sachets: 'sachet',
  powder: 'powder',
  patch: 'patch',
  inhaler: 'inhaler',
  supp: 'suppository',
  suppository: 'suppository',
}

/** The subset of dose forms that opens a new prescription row when spoken. */
export const DOSE_FORM_CUES: readonly string[] = Object.keys(DOSE_FORMS)

/** Verbs that introduce a medicine without naming its form. */
export const MEDICINE_VERBS: readonly string[] = ['start', 'add', 'give', 'prescribe', 'continue']

/**
 * Alias → canonical unit of a single administration. Canonical forms are kept
 * singular ("2 tab", not "2 tabs") so a dose string is comparable as text.
 */
export const DOSE_UNITS: Readonly<Record<string, string>> = {
  tab: 'tab',
  tabs: 'tab',
  tablet: 'tab',
  tablets: 'tab',
  cap: 'cap',
  caps: 'cap',
  capsule: 'cap',
  capsules: 'cap',
  ml: 'ml',
  mls: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  cc: 'ml',
  drop: 'drop',
  drops: 'drop',
  puff: 'puff',
  puffs: 'puff',
  spoon: 'tsp',
  spoonful: 'tsp',
  teaspoon: 'tsp',
  teaspoonful: 'tsp',
  tsp: 'tsp',
  tablespoon: 'tbsp',
  tbsp: 'tbsp',
  sachet: 'sachet',
  sachets: 'sachet',
  scoop: 'scoop',
  application: 'application',
  applications: 'application',
  amp: 'amp',
  ampoule: 'amp',
  vial: 'vial',
}

/**
 * Units that count discrete objects. Only these scale an `m-a-n` slot: "two
 * tabs twice a day" is 2-0-2, but "10 ml twice a day" is 1-0-1 with a 10 ml
 * dose — the grid counts administrations, not millilitres.
 */
export const COUNTABLE_UNITS: readonly string[] = [
  'tab',
  'cap',
  'drop',
  'puff',
  'tsp',
  'tbsp',
  'sachet',
  'scoop',
  'amp',
  'vial',
]

/** Strength units. These belong to the *name* ("Dolo 650 mg"), never the dose. */
export const STRENGTH_UNITS: readonly string[] = [
  'mg',
  'mgs',
  'mcg',
  'microgram',
  'micrograms',
  'milligram',
  'milligrams',
  'g',
  'gm',
  'gms',
  'gram',
  'grams',
  'iu',
  'percent',
]

/**
 * A bare number this large, sitting next to a drug name, is a strength and not
 * a dose — nobody takes 650 tablets. Below it, an unqualified number is read
 * as an amount.
 */
export const STRENGTH_NUMBER_FLOOR = 25

/* -------------------------------------------------------------------------- */
/*  Frequency                                                                  */
/* -------------------------------------------------------------------------- */

export interface FrequencyEntry {
  /** `null` when the abbreviation carries no fixed morning/afternoon/night grid. */
  schedule: DoseSchedule | null
  prn?: boolean
  /** Anything the grid cannot hold, preserved as free text on the row. */
  note?: string
  /** How the UI spells this out in hint text. */
  label: string
}

function grid(m: number | null, a: number | null, n: number | null): DoseSchedule {
  return { m, a, n }
}

/**
 * The Latin abbreviations, as this clinic uses them.
 *
 * `qid` is the interesting one: four doses do not fit a three-slot grid, so it
 * fills the grid it can and says the rest in words rather than quietly losing
 * a dose.
 */
export const FREQUENCY_ABBREVIATIONS: Readonly<Record<string, FrequencyEntry>> = {
  od: { schedule: grid(1, 0, 0), label: 'once a day' },
  om: { schedule: grid(1, 0, 0), label: 'in the morning' },
  mane: { schedule: grid(1, 0, 0), label: 'in the morning' },
  bd: { schedule: grid(1, 0, 1), label: 'twice a day' },
  bds: { schedule: grid(1, 0, 1), label: 'twice a day' },
  bid: { schedule: grid(1, 0, 1), label: 'twice a day' },
  tds: { schedule: grid(1, 1, 1), label: 'three times a day' },
  tid: { schedule: grid(1, 1, 1), label: 'three times a day' },
  qid: {
    schedule: grid(1, 1, 1),
    note: 'QID — four times a day; the fourth dose is outside the morning/afternoon/night grid',
    label: 'four times a day',
  },
  qds: {
    schedule: grid(1, 1, 1),
    note: 'QDS — four times a day; the fourth dose is outside the morning/afternoon/night grid',
    label: 'four times a day',
  },
  hs: { schedule: grid(0, 0, 1), label: 'at bedtime' },
  nocte: { schedule: grid(0, 0, 1), label: 'at night' },
  noct: { schedule: grid(0, 0, 1), label: 'at night' },
  // As-needed has no fixed grid, and inventing one would be exactly the lie
  // this whole model exists to prevent.
  sos: { schedule: null, prn: true, note: 'SOS — as needed', label: 'as needed' },
  prn: { schedule: null, prn: true, note: 'PRN — as needed', label: 'as needed' },
  stat: { schedule: null, note: 'STAT — give immediately', label: 'immediately, one dose' },
}

export interface FrequencyPhrase {
  words: readonly string[]
  schedule: DoseSchedule | null
  note?: string
}

/**
 * Plain English. Matched longest-first, so "morning and night" wins over
 * "in the morning".
 *
 * Evening is folded into the night slot: the grid has three columns and an
 * evening dose is written in the third one on every prescription in this
 * clinic.
 */
export const FREQUENCY_PHRASES: readonly FrequencyPhrase[] = [
  { words: ['morning', 'afternoon', 'and', 'night'], schedule: grid(1, 1, 1) },
  { words: ['morning', 'noon', 'and', 'night'], schedule: grid(1, 1, 1) },
  { words: ['morning', 'afternoon', 'and', 'evening'], schedule: grid(1, 1, 1) },
  { words: ['three', 'times', 'a', 'day'], schedule: grid(1, 1, 1) },
  { words: ['three', 'times', 'daily'], schedule: grid(1, 1, 1) },
  { words: ['thrice', 'a', 'day'], schedule: grid(1, 1, 1) },
  { words: ['thrice', 'daily'], schedule: grid(1, 1, 1) },
  {
    words: ['four', 'times', 'a', 'day'],
    schedule: grid(1, 1, 1),
    note: 'Four times a day; the fourth dose is outside the morning/afternoon/night grid',
  },
  {
    words: ['four', 'times', 'daily'],
    schedule: grid(1, 1, 1),
    note: 'Four times a day; the fourth dose is outside the morning/afternoon/night grid',
  },
  { words: ['two', 'times', 'a', 'day'], schedule: grid(1, 0, 1) },
  { words: ['two', 'times', 'daily'], schedule: grid(1, 0, 1) },
  { words: ['twice', 'a', 'day'], schedule: grid(1, 0, 1) },
  { words: ['twice', 'daily'], schedule: grid(1, 0, 1) },
  { words: ['morning', 'and', 'night'], schedule: grid(1, 0, 1) },
  { words: ['morning', 'and', 'evening'], schedule: grid(1, 0, 1) },
  { words: ['morning', 'and', 'bedtime'], schedule: grid(1, 0, 1) },
  { words: ['morning', 'and', 'afternoon'], schedule: grid(1, 1, 0) },
  { words: ['one', 'time', 'a', 'day'], schedule: grid(1, 0, 0) },
  { words: ['once', 'a', 'day'], schedule: grid(1, 0, 0) },
  { words: ['once', 'daily'], schedule: grid(1, 0, 0) },
  { words: ['every', 'day'], schedule: grid(1, 0, 0) },
  { words: ['in', 'the', 'morning'], schedule: grid(1, 0, 0) },
  { words: ['every', 'morning'], schedule: grid(1, 0, 0) },
  { words: ['morning', 'only'], schedule: grid(1, 0, 0) },
  { words: ['in', 'the', 'afternoon'], schedule: grid(0, 1, 0) },
  { words: ['at', 'noon'], schedule: grid(0, 1, 0) },
  { words: ['afternoon', 'only'], schedule: grid(0, 1, 0) },
  { words: ['at', 'bedtime'], schedule: grid(0, 0, 1) },
  { words: ['before', 'bed'], schedule: grid(0, 0, 1) },
  { words: ['at', 'night'], schedule: grid(0, 0, 1) },
  { words: ['every', 'night'], schedule: grid(0, 0, 1) },
  { words: ['night', 'only'], schedule: grid(0, 0, 1) },
  { words: ['in', 'the', 'evening'], schedule: grid(0, 0, 1) },
  { words: ['every', 'evening'], schedule: grid(0, 0, 1) },
  // Interval dosing maps onto the grid where it lands cleanly and says so in
  // words where it does not.
  { words: ['every', 'twelve', 'hours'], schedule: grid(1, 0, 1) },
  { words: ['every', 'eight', 'hours'], schedule: grid(1, 1, 1) },
  {
    words: ['every', 'six', 'hours'],
    schedule: grid(1, 1, 1),
    note: 'Every six hours; the fourth dose is outside the morning/afternoon/night grid',
  },
  // No grid at all — the schedule stays blank and the words are kept.
  { words: ['alternate', 'days'], schedule: null, note: 'On alternate days' },
  { words: ['every', 'other', 'day'], schedule: null, note: 'On alternate days' },
  { words: ['once', 'a', 'week'], schedule: null, note: 'Once a week' },
  { words: ['weekly'], schedule: null, note: 'Once a week' },
  // Bare "daily" last: any longer phrase containing it must match first.
  { words: ['daily'], schedule: grid(1, 0, 0) },
]

/** Time-of-day words. They end a drug name — a medicine is never called "night". */
export const TIME_WORDS: readonly string[] = [
  'morning',
  'afternoon',
  'noon',
  'evening',
  'night',
  'bedtime',
  'daily',
  'once',
  'twice',
  'thrice',
  'times',
  'time',
  'hourly',
  'hours',
]

/* -------------------------------------------------------------------------- */
/*  As-needed, food, duration                                                  */
/* -------------------------------------------------------------------------- */

export const PRN_PHRASES: readonly (readonly string[])[] = [
  ['as', 'needed'],
  ['as', 'required'],
  ['if', 'needed'],
  ['if', 'required'],
  ['when', 'needed'],
  ['when', 'required'],
  ['if', 'there', 'is', 'pain'],
  ['if', 'pain'],
  ['when', 'in', 'pain'],
  ['on', 'demand'],
]

export interface FoodCue {
  words: readonly string[]
  timing: FoodTiming
}

/**
 * "Empty stomach" is filed as `before`: it is how a doctor says "before food"
 * for a drug that must not meet a meal, and the model has no third state for it.
 */
export const FOOD_CUES: readonly FoodCue[] = [
  { words: ['on', 'an', 'empty', 'stomach'], timing: 'before' },
  { words: ['empty', 'stomach'], timing: 'before' },
  { words: ['before', 'food'], timing: 'before' },
  { words: ['before', 'meals'], timing: 'before' },
  { words: ['before', 'meal'], timing: 'before' },
  { words: ['before', 'breakfast'], timing: 'before' },
  { words: ['ac'], timing: 'before' },
  { words: ['after', 'food'], timing: 'after' },
  { words: ['after', 'meals'], timing: 'after' },
  { words: ['after', 'meal'], timing: 'after' },
  { words: ['after', 'breakfast'], timing: 'after' },
  { words: ['post', 'food'], timing: 'after' },
  { words: ['pc'], timing: 'after' },
  { words: ['along', 'with', 'food'], timing: 'with' },
  { words: ['with', 'food'], timing: 'with' },
  { words: ['with', 'meals'], timing: 'with' },
  { words: ['with', 'milk'], timing: 'with' },
]

/** Duration unit → days. A month is 30 days; nobody dictating means 31. */
export const DURATION_UNITS: Readonly<Record<string, number>> = {
  d: 1,
  day: 1,
  days: 1,
  w: 7,
  wk: 7,
  wks: 7,
  week: 7,
  weeks: 7,
  fortnight: 14,
  month: 30,
  months: 30,
  mon: 30,
  year: 365,
  years: 365,
}

/** Words that introduce a duration. */
export const DURATION_CUES: readonly string[] = ['for', 'x', 'over', 'lasting']

/** Fillers a duration phrase may contain and the parser should step over. */
export const DURATION_SKIP_WORDS: readonly string[] = ['the', 'next', 'another', 'about', 'around']

/* -------------------------------------------------------------------------- */
/*  Section cues                                                               */
/* -------------------------------------------------------------------------- */

export type SectionKind =
  | 'medicine'
  | 'diagnosis'
  | 'complaint'
  | 'advice'
  | 'investigations'
  | 'followUp'

export interface SectionCue {
  words: readonly string[]
  kind: SectionKind
  /**
   * Whether the cue words are part of the content. "x-ray of the left knee" is
   * the investigation; "investigations:" is only a label.
   */
  keepWords?: boolean
}

export const SECTION_CUES: readonly SectionCue[] = [
  { words: ['chief', 'complaint', 'is'], kind: 'complaint' },
  { words: ['chief', 'complaint'], kind: 'complaint' },
  { words: ['chief', 'complaints'], kind: 'complaint' },
  { words: ['complaints', 'of'], kind: 'complaint' },
  { words: ['complaint', 'of'], kind: 'complaint' },
  { words: ['complains', 'of'], kind: 'complaint' },
  { words: ['complaining', 'of'], kind: 'complaint' },
  { words: ['presenting', 'with'], kind: 'complaint' },
  { words: ['c', 'o'], kind: 'complaint' },

  { words: ['diagnosis', 'is'], kind: 'diagnosis' },
  { words: ['diagnosis'], kind: 'diagnosis' },
  { words: ['impression', 'is'], kind: 'diagnosis' },
  { words: ['impression'], kind: 'diagnosis' },
  { words: ['provisional', 'diagnosis'], kind: 'diagnosis' },

  { words: ['advice'], kind: 'advice' },
  { words: ['advise'], kind: 'advice' },
  { words: ['advised'], kind: 'advice' },

  { words: ['investigations'], kind: 'investigations' },
  { words: ['investigation'], kind: 'investigations' },
  { words: ['investigate'], kind: 'investigations' },
  { words: ['x', 'ray'], kind: 'investigations', keepWords: true },
  { words: ['xray'], kind: 'investigations', keepWords: true },
  { words: ['x', 'rays'], kind: 'investigations', keepWords: true },
  { words: ['mri'], kind: 'investigations', keepWords: true },
  { words: ['ct', 'scan'], kind: 'investigations', keepWords: true },
  { words: ['ultrasound'], kind: 'investigations', keepWords: true },
  { words: ['usg'], kind: 'investigations', keepWords: true },
  { words: ['blood', 'test'], kind: 'investigations', keepWords: true },
  { words: ['blood', 'tests'], kind: 'investigations', keepWords: true },
  { words: ['cbc'], kind: 'investigations', keepWords: true },
  { words: ['esr'], kind: 'investigations', keepWords: true },
  { words: ['vitamin', 'd', 'levels'], kind: 'investigations', keepWords: true },

  { words: ['review', 'after'], kind: 'followUp' },
  { words: ['review', 'in'], kind: 'followUp' },
  { words: ['follow', 'up', 'after'], kind: 'followUp' },
  { words: ['follow', 'up', 'in'], kind: 'followUp' },
  { words: ['followup', 'after'], kind: 'followUp' },
  { words: ['followup', 'in'], kind: 'followUp' },
  { words: ['come', 'back', 'after'], kind: 'followUp' },
  { words: ['come', 'back', 'in'], kind: 'followUp' },
  { words: ['see', 'me', 'after'], kind: 'followUp' },
  { words: ['see', 'me', 'in'], kind: 'followUp' },
  { words: ['next', 'visit', 'after'], kind: 'followUp' },
  { words: ['next', 'visit', 'in'], kind: 'followUp' },
  { words: ['rv', 'after'], kind: 'followUp' },
]

/** Words that chain one dictated item to the next. */
export const CONNECTORS: readonly string[] = ['and', 'then', 'also', 'plus', 'next', 'after', 'with']

/** The subset of connectors that may start a new medicine row. */
export const ROW_CONNECTORS: readonly string[] = ['and', 'then', 'also', 'plus']

/* -------------------------------------------------------------------------- */
/*  Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Noise the transcriber faithfully reproduces and nobody prescribes. Kept
 * short: every word removed here is a word the doctor can never dictate.
 */
export const FILLER_WORDS: readonly string[] = [
  'uh',
  'uhh',
  'uhm',
  'um',
  'umm',
  'er',
  'erm',
  'ah',
  'ahh',
  'hmm',
  'hm',
  'mmm',
  'okay',
  'ok',
  'alright',
  'yeah',
]

/**
 * ASR mishearings, repaired unconditionally.
 *
 * Every entry is a word that is either not English at all or never appears in
 * a prescription with its ordinary meaning — so the repair cannot destroy
 * something the doctor meant. Anything more contextual than that lives in
 * `CONTEXTUAL_FREQUENCY_REPAIRS` instead, where the parser can look around
 * before deciding.
 */
export const ASR_REPAIRS: Readonly<Record<string, string>> = {
  // "tab." and "tab," lose their punctuation in the tokeniser; these are the
  // spellings that survive it.
  tabe: 'tab',
  tabb: 'tab',
  tablette: 'tab',
  // Transcribers routinely spell the syrup form phonetically.
  sirup: 'syrup',
  sirap: 'syrup',
  syrap: 'syrup',
  // "inj." heard as a word.
  injec: 'inj',
  // "b.i.d." run together by the transcriber.
  bidi: 'bd',
}

/**
 * Letter-by-letter dictation of an abbreviation. Applied as a token *sequence*
 * so "bee dee" only collapses when both words are adjacent.
 */
export const MULTIWORD_REPAIRS: readonly { words: readonly string[]; to: string }[] = [
  { words: ['bee', 'dee'], to: 'bd' },
  { words: ['oh', 'dee'], to: 'od' },
  { words: ['tee', 'dee', 'ess'], to: 'tds' },
  { words: ['aitch', 'ess'], to: 'hs' },
  { words: ['ess', 'oh', 'ess'], to: 'sos' },
]

/**
 * Repairs that are only safe with context, applied by the parser inside a
 * medicine span when no frequency has been recognised yet.
 *
 *  - "depot" is what `BD` becomes when said quickly — but depot *injections*
 *    are a real thing, so the parser refuses this repair after `inj`.
 *  - "odd" is only ever `OD` in a dictated prescription; as an adjective it
 *    would sit before a noun, not after a drug name.
 */
export const CONTEXTUAL_FREQUENCY_REPAIRS: Readonly<Record<string, string>> = {
  depot: 'bd',
  odd: 'od',
  ode: 'od',
}

/**
 * Ordinary English that is never a drug name. Used to decide whether the word
 * after "and" starts a new medicine — an unknown word probably names one, a
 * word from this list does not.
 */
export const STOP_WORDS: readonly string[] = [
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'by',
  'from',
  'as',
  'it',
  'this',
  'that',
  'these',
  'those',
  'he',
  'she',
  'they',
  'his',
  'her',
  'their',
  'patient',
  'patients',
  'please',
  'now',
  'today',
  'tomorrow',
  'pain',
  'swelling',
  'fever',
  'rest',
  'ice',
  'physio',
  'physiotherapy',
  'exercise',
  'exercises',
  'if',
  'when',
  'no',
  'not',
  'any',
  'some',
  'up',
  'down',
  'left',
  'right',
  'both',
  'side',
  'knee',
  'back',
  'neck',
  'shoulder',
  'hip',
  'ankle',
  'wrist',
  'elbow',
  'spine',
]

/* -------------------------------------------------------------------------- */
/*  Tokenising                                                                 */
/* -------------------------------------------------------------------------- */

export type TokenKind = 'word' | 'number' | 'punct'

export interface SpeechToken {
  /** The exact slice of the original transcript, casing and all. */
  raw: string
  /** Lowercased, de-punctuated, repaired. */
  norm: string
  /** Offsets into the *original* transcript, so a span can be quoted verbatim. */
  start: number
  end: number
  kind: TokenKind
  /** Set for digits, spoken cardinals, and the weak "a"/"an". */
  value?: number
  /** The character that glued this token to the previous one, if any. */
  join: '-' | '/' | null
}

/**
 * Character-for-character replacements applied before tokenising.
 *
 * Every one of them is length-preserving on purpose: token offsets must still
 * point into the transcript the doctor's words came from, or `sourceText`
 * stops being verbatim.
 */
function preNormalise(text: string): string {
  return text
    .replace(/[×✕✖]/g, 'x') // × → x, so "×5d" reads as "x5d"
    .replace(/[‐-―−]/g, '-') // dashes of every width → hyphen
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[   ]/g, ' ')
}

const TOKEN_RE = /([A-Za-z](?:\.[A-Za-z])+\.?)|(\d+(?:\.\d+)?)|([A-Za-z]+)|([,;:!?.])|([-/])/g

const FILLER_SET = new Set(FILLER_WORDS)

/**
 * Split a transcript into tokens.
 *
 * This is the single place normalisation happens: `normaliseTranscript` is
 * this function's output re-joined, so the string a hint renders and the
 * tokens the parser matches can never drift apart.
 *
 * Hyphens and slashes are not tokens — they are recorded on the token that
 * follows them. That is what lets `1-0-1` be read as a triple while `x-ray`
 * stays two ordinary words.
 */
export function tokenise(text: string): SpeechToken[] {
  const source = preNormalise(text)
  const tokens: SpeechToken[] = []
  let join: '-' | '/' | null = null

  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(source)) !== null) {
    const [raw] = match
    const start = match.index
    const end = start + raw.length

    if (match[5]) {
      join = raw === '/' ? '/' : '-'
      continue
    }

    if (match[4]) {
      tokens.push({ raw, norm: raw, start, end, kind: 'punct', join: null })
      join = null
      continue
    }

    if (match[2]) {
      const value = Number.parseFloat(raw)
      // "1/2" — the only fraction anyone dictates.
      const prev = tokens[tokens.length - 1]
      if (join === '/' && prev && prev.kind === 'number' && prev.value === 1 && value === 2) {
        prev.value = 0.5
        prev.norm = '0.5'
        prev.end = end
        prev.raw = source.slice(prev.start, end)
        join = null
        continue
      }
      tokens.push({ raw, norm: raw, start, end, kind: 'number', value, join })
      join = null
      continue
    }

    // Words, including dotted abbreviations like "b.d." → "bd".
    let norm = raw.toLowerCase().replace(/\./g, '')
    norm = ASR_REPAIRS[norm] ?? norm
    if (FILLER_SET.has(norm)) {
      join = null
      continue
    }

    const wordValue = WORD_NUMBERS[norm]
    if (wordValue !== undefined) {
      tokens.push({ raw, norm, start, end, kind: 'number', value: wordValue, join })
    } else {
      const weak = WEAK_NUMBERS[norm]
      tokens.push({
        raw,
        norm,
        start,
        end,
        kind: 'word',
        ...(weak === undefined ? {} : { value: weak }),
        join,
      })
    }
    join = null
  }

  return applyMultiwordRepairs(tokens)
}

function applyMultiwordRepairs(tokens: SpeechToken[]): SpeechToken[] {
  if (tokens.length === 0) return tokens
  const out: SpeechToken[] = []
  for (let i = 0; i < tokens.length; i++) {
    let repaired = false
    for (const repair of MULTIWORD_REPAIRS) {
      const n = repair.words.length
      if (i + n > tokens.length) continue
      let ok = true
      for (let k = 0; k < n; k++) {
        if (tokens[i + k].norm !== repair.words[k]) {
          ok = false
          break
        }
      }
      if (!ok) continue
      const first = tokens[i]
      const last = tokens[i + n - 1]
      out.push({
        raw: first.raw,
        norm: repair.to,
        start: first.start,
        end: last.end,
        kind: 'word',
        join: first.join,
      })
      i += n - 1
      repaired = true
      break
    }
    if (!repaired) out.push(tokens[i])
  }
  return out
}

/**
 * Lowercase, collapse whitespace, drop filler, unify punctuation and dashes.
 *
 * This is the readable form of exactly what the parser sees. The parser itself
 * works on the tokens rather than this string, so it can quote the doctor's
 * own words back — but both come out of `tokenise`, so what you read here is
 * what it matched.
 */
export function normaliseTranscript(text: string): string {
  const tokens = tokenise(text)
  let out = ''
  for (const token of tokens) {
    if (token.kind === 'punct') {
      out += token.norm
      continue
    }
    if (out === '') out = token.norm
    else if (token.join === '-') out += `-${token.norm}`
    else out += ` ${token.norm}`
  }
  return out.trim()
}

/* -------------------------------------------------------------------------- */
/*  Hints for the UI                                                           */
/* -------------------------------------------------------------------------- */

export interface DictationHint {
  title: string
  examples: readonly string[]
}

/**
 * What the screen tells the doctor they can say. Written by hand rather than
 * generated, because the tables above hold hundreds of forms and a hint is
 * useful only when it is short — but every example here is covered by a test.
 */
export const DICTATION_HINTS: readonly DictationHint[] = [
  {
    title: 'A medicine',
    examples: [
      'tab zerodol SP one zero one for five days after food',
      'cap myoril one at night for three days',
      'syrup calpol 10 ml twice daily',
      'inj voveran stat',
    ],
  },
  {
    title: 'Timing',
    examples: ['1-0-1', 'one zero one', 'half-0-half', 'OD, BD, TDS, QID, HS, SOS', 'twice daily'],
  },
  {
    title: 'How long',
    examples: ['for five days', 'for 2 weeks', 'for a month', 'x5d'],
  },
  {
    title: 'The rest of the sheet',
    examples: [
      'diagnosis lumbar spondylosis',
      'complaints of low back pain',
      'x-ray of the lumbar spine',
      'advice hot fomentation',
      'review after one week',
    ],
  },
]

import { describe, expect, test } from 'bun:test'
import { parseDictation } from './parser'
import type { ParsedRow } from './parser'
import { normaliseTranscript } from './vocabulary'

function rows(transcript: string): ParsedRow[] {
  return parseDictation(transcript).rows
}

function one(transcript: string): ParsedRow {
  const parsed = rows(transcript)
  expect(parsed).toHaveLength(1)
  return parsed[0]
}

/* -------------------------------------------------------------------------- */
/*  The one that matters most: chained medicines                               */
/* -------------------------------------------------------------------------- */

describe('splitting chained medicines', () => {
  const CHAINED =
    'tab zerodol SP one zero one for five days after food, cap myoril one at night for three days, and shelcal one daily for a month'

  test('the three-drug sentence yields exactly three rows', () => {
    expect(rows(CHAINED)).toHaveLength(3)
  })

  test('row one keeps the name verbatim, with its grid, duration and food', () => {
    const row = rows(CHAINED)[0]
    expect(row.spokenName).toBe('zerodol SP')
    expect(row.schedule).toEqual({ m: 1, a: 0, n: 1 })
    expect(row.durationDays).toBe(5)
    expect(row.food).toBe('after')
  })

  test('row two keeps its own grid and duration', () => {
    const row = rows(CHAINED)[1]
    expect(row.spokenName).toBe('myoril')
    expect(row.schedule).toEqual({ m: 0, a: 0, n: 1 })
    expect(row.durationDays).toBe(3)
  })

  test('row three is split on "and" with no dose-form cue at all', () => {
    const row = rows(CHAINED)[2]
    expect(row.spokenName).toBe('shelcal')
    expect(row.schedule).toEqual({ m: 1, a: 0, n: 0 })
    expect(row.durationDays).toBe(30)
  })

  test('every row quotes the span it came from', () => {
    const parsed = rows(CHAINED)
    expect(parsed[0].sourceText).toBe('tab zerodol SP one zero one for five days after food')
    expect(parsed[1].sourceText).toBe('cap myoril one at night for three days')
    expect(parsed[2].sourceText).toBe('shelcal one daily for a month')
  })

  test('"morning and night" is not a split point', () => {
    const parsed = rows('tab dolo 650 morning and night for 3 days')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('"then" and "also" split as well', () => {
    expect(rows('tab pan 40 one before food then ultracet one at night')).toHaveLength(2)
    expect(rows('start tab dolo bd, also calcium one daily')).toHaveLength(2)
  })

  test('a dose-form cue alone opens a new row', () => {
    expect(rows('tab dolo bd syrup grilinctus 10 ml tds inj voveran stat')).toHaveLength(3)
  })
})

/* -------------------------------------------------------------------------- */
/*  A narrative section must never swallow a medicine                          */
/* -------------------------------------------------------------------------- */

describe('a section cue does not eat the medicine after it', () => {
  const CONSULT =
    'diagnosis osteoarthritis right knee grade two, tab dolo 650 TDS for 3 days after food, advice avoid squatting, review after 2 weeks'

  test('the drug survives a diagnosis that ends in a number', () => {
    const parsed = parseDictation(CONSULT)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].spokenName).toBe('dolo 650')
    expect(parsed.rows[0].schedule).toEqual({ m: 1, a: 1, n: 1 })
    expect(parsed.rows[0].durationDays).toBe(3)
    expect(parsed.rows[0].food).toBe('after')
  })

  test('the narrative keeps only its own words', () => {
    const parsed = parseDictation(CONSULT)
    expect(parsed.diagnosis).toBe('osteoarthritis right knee grade two')
    expect(parsed.advice).toBe('avoid squatting')
    expect(parsed.followUpDays).toBe(14)
  })

  test('with no comma to help, the drug name still opens the row', () => {
    const parsed = parseDictation('diagnosis osteoarthritis grade two tab dolo 650 tds for 3 days')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].spokenName).toBe('dolo 650')
    expect(parsed.diagnosis).toBe('osteoarthritis grade two')
  })

  test('a full consult mixing narrative and two medicines', () => {
    const parsed = parseDictation(
      'complaints of low back pain since 2 months, diagnosis lumbar spondylosis grade two, ' +
        'tab zerodol SP one zero one for five days after food, cap myoril one at night for three days, ' +
        'advice hot fomentation, review after one week',
    )
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].spokenName).toBe('zerodol SP')
    expect(parsed.rows[1].spokenName).toBe('myoril')
    expect(parsed.chiefComplaint).toBe('low back pain since 2 months')
    expect(parsed.diagnosis).toBe('lumbar spondylosis grade two')
    expect(parsed.advice).toBe('hot fomentation')
    expect(parsed.followUpDays).toBe(7)
    expect(parsed.unparsed).toHaveLength(0)
  })

  test('"two tabs" is still an amount, not a second row', () => {
    const parsed = rows('tab calcium two tabs twice a day')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].schedule).toEqual({ m: 2, a: 0, n: 2 })
  })
})

/* -------------------------------------------------------------------------- */
/*  A sentence with no drug in it must not become a row                        */
/* -------------------------------------------------------------------------- */

describe('no phantom rows', () => {
  test('"give him something for the pain" is unparsed, not a medicine', () => {
    const parsed = parseDictation('give him something for the pain')
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.unparsed).toHaveLength(1)
    expect(parsed.unparsed[0]).toContain('something')
  })

  test('a bare instruction with no dose signal is unparsed', () => {
    const parsed = parseDictation('start physiotherapy next week')
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.unparsed.join(' ')).toContain('physiotherapy')
  })

  test('a dose-form cue alone is corroboration enough', () => {
    const parsed = rows('tab zerodol')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].spokenName).toBe('zerodol')
  })

  test('a strength alone is corroboration enough', () => {
    const parsed = rows('start pan forty one before breakfast for ten days')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].spokenName).toBe('pan forty')
    expect(parsed[0].food).toBe('before')
    expect(parsed[0].durationDays).toBe(10)
  })

  test('as-needed alone is corroboration enough', () => {
    const parsed = rows('tab ultracet half tablet SOS maximum two a day')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].prn).toBe(true)
  })

  test('a depot injection is not a BD instruction', () => {
    const row = one('inj depot medrol one stat')
    expect(row.spokenName).toBe('depot medrol')
    expect(row.schedule).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Frequency notation                                                         */
/* -------------------------------------------------------------------------- */

describe('frequency notation', () => {
  test('digits with hyphens', () => {
    expect(one('tab dolo 1-0-1').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('digits with spaces', () => {
    expect(one('tab dolo 1 0 1').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('words', () => {
    expect(one('tab dolo one zero one').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('half-0-half', () => {
    expect(one('tab dolo half-0-half').schedule).toEqual({ m: 0.5, a: 0, n: 0.5 })
  })

  test('decimals', () => {
    expect(one('tab dolo 0.5-0-0.5').schedule).toEqual({ m: 0.5, a: 0, n: 0.5 })
  })

  test('a three-slot grid with all three filled', () => {
    expect(one('tab shelcal 1-1-1').schedule).toEqual({ m: 1, a: 1, n: 1 })
  })
})

describe('latin abbreviations', () => {
  test('OD', () => {
    expect(one('tab dolo od').schedule).toEqual({ m: 1, a: 0, n: 0 })
  })

  test('BD and BID agree', () => {
    expect(one('tab dolo bd').schedule).toEqual({ m: 1, a: 0, n: 1 })
    expect(one('tab dolo bid').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('TDS and TID agree', () => {
    expect(one('tab dolo tds').schedule).toEqual({ m: 1, a: 1, n: 1 })
    expect(one('tab dolo tid').schedule).toEqual({ m: 1, a: 1, n: 1 })
  })

  test('QID fills the grid and says the rest in words', () => {
    const row = one('tab dolo qid for 3 days')
    expect(row.schedule).toEqual({ m: 1, a: 1, n: 1 })
    expect(row.instructions).toMatch(/four times a day/i)
  })

  test('HS and nocte are night only', () => {
    expect(one('tab pan hs').schedule).toEqual({ m: 0, a: 0, n: 1 })
    expect(one('tab pan nocte').schedule).toEqual({ m: 0, a: 0, n: 1 })
  })

  test('SOS is as-needed and refuses to invent a grid', () => {
    const row = one('tab dolo sos')
    expect(row.prn).toBe(true)
    expect(row.schedule).toBeNull()
  })

  test('PRN reads the same as SOS', () => {
    const row = one('tab dolo prn for pain')
    expect(row.prn).toBe(true)
    expect(row.schedule).toBeNull()
  })

  test('stat carries a note and no grid', () => {
    const row = one('inj voveran stat')
    expect(row.schedule).toBeNull()
    expect(row.instructions).toMatch(/immediately/i)
  })

  test('dotted abbreviations survive the tokeniser', () => {
    expect(one('tab dolo b.d.').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })
})

describe('plain English frequency', () => {
  test('twice daily', () => {
    expect(one('tab dolo twice daily').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('once a day', () => {
    expect(one('tab dolo once a day').schedule).toEqual({ m: 1, a: 0, n: 0 })
  })

  test('three times a day', () => {
    expect(one('tab dolo three times a day').schedule).toEqual({ m: 1, a: 1, n: 1 })
  })

  test('at night', () => {
    expect(one('cap myoril at night').schedule).toEqual({ m: 0, a: 0, n: 1 })
  })

  test('in the morning', () => {
    expect(one('tab pan in the morning').schedule).toEqual({ m: 1, a: 0, n: 0 })
  })

  test('morning and night', () => {
    expect(one('tab dolo morning and night').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('twice a day after food keeps both facts', () => {
    const row = one('tab zerodol twice a day after food')
    expect(row.schedule).toEqual({ m: 1, a: 0, n: 1 })
    expect(row.food).toBe('after')
  })

  test('a spoken amount scales a worded grid', () => {
    const row = one('tab calcium two tabs twice a day')
    expect(row.schedule).toEqual({ m: 2, a: 0, n: 2 })
  })

  test('millilitres never scale the grid', () => {
    const row = one('syrup calpol 10 ml twice daily')
    expect(row.schedule).toEqual({ m: 1, a: 0, n: 1 })
  })
})

/* -------------------------------------------------------------------------- */
/*  The safety property: null is not zero                                      */
/* -------------------------------------------------------------------------- */

describe('null is not zero', () => {
  test('no frequency spoken means no schedule at all', () => {
    const row = one('tab zerodol 1 tab for five days')
    expect(row.schedule).toBeNull()
    expect(row.durationDays).toBe(5)
  })

  test('a spoken zero is a zero', () => {
    expect(one('tab zerodol one zero one').schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('a name on its own invents nothing', () => {
    const row = one('tab zerodol')
    expect(row.schedule).toBeNull()
    expect(row.durationDays).toBeNull()
    expect(row.food).toBeNull()
    expect(row.prn).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Amount, duration, food                                                     */
/* -------------------------------------------------------------------------- */

describe('amount', () => {
  test('a spoken amount never opens a second row', () => {
    expect(rows('tab dolo one tablet bd')).toHaveLength(1)
    expect(rows('tab dolo two tabs at night')).toHaveLength(1)
    expect(rows('syrup grilinctus 10 ml tds')).toHaveLength(1)
    expect(rows('inhaler asthalin one puff bd')).toHaveLength(1)
  })

  test('half tablet scales a worded grid', () => {
    const row = one('tab dolo half tablet bd')
    expect(row.schedule).toEqual({ m: 0.5, a: 0, n: 0.5 })
  })

  test('a strength stays part of the name', () => {
    const row = one('tab dolo 650 1-0-1')
    expect(row.spokenName).toBe('dolo 650')
    expect(row.schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('a strength with its unit stays part of the name', () => {
    expect(one('tab pan 40 mg od').spokenName).toBe('pan 40 mg')
  })
})

describe('duration', () => {
  test('for five days', () => {
    expect(one('tab dolo bd for five days').durationDays).toBe(5)
  })

  test('for 2 weeks is fourteen days', () => {
    expect(one('tab dolo bd for 2 weeks').durationDays).toBe(14)
  })

  test('for a month is thirty days', () => {
    expect(one('tab shelcal od for a month').durationDays).toBe(30)
  })

  test('x5d', () => {
    expect(one('tab dolo bd x5d').durationDays).toBe(5)
  })

  test('for 10 days', () => {
    expect(one('tab dolo bd for 10 days').durationDays).toBe(10)
  })

  test('for one week', () => {
    expect(one('tab dolo bd for one week').durationDays).toBe(7)
  })

  test('no duration spoken stays null', () => {
    expect(one('tab dolo bd').durationDays).toBeNull()
  })

  test('"a day" inside a max-per-day phrase is not a one-day course', () => {
    const row = one('tab ultracet half tablet sos for pain maximum two a day')
    expect(row.durationDays).toBeNull()
    expect(row.prn).toBe(true)
    expect(row.instructions).toContain('maximum two')
  })

  test('a follow-up still reads "after a month"', () => {
    expect(parseDictation('review after a month').followUpDays).toBe(30)
  })
})

describe('quoting the doctor', () => {
  test('the trailing conjunction is not part of the quote', () => {
    const parsed = rows('inj diclofenac one ampoule stat then tab dolo 650 tds x3d')
    expect(parsed[0].sourceText).toBe('inj diclofenac one ampoule stat')
    expect(parsed[1].sourceText).toBe('tab dolo 650 tds x3d')
  })

  test('a leading verb stays in the quote', () => {
    expect(one('start tab pantop 40 one before food od for ten days').sourceText).toBe(
      'start tab pantop 40 one before food od for ten days',
    )
  })
})

describe('food', () => {
  test('after food', () => {
    expect(one('tab dolo bd after food').food).toBe('after')
  })

  test('before meals', () => {
    expect(one('tab pan od before meals').food).toBe('before')
  })

  test('with food', () => {
    expect(one('tab shelcal od with food').food).toBe('with')
  })

  test('empty stomach reads as before', () => {
    expect(one('tab pan od empty stomach').food).toBe('before')
  })
})

/* -------------------------------------------------------------------------- */
/*  Sections                                                                   */
/* -------------------------------------------------------------------------- */

describe('sections', () => {
  test('diagnosis', () => {
    expect(parseDictation('diagnosis lumbar spondylosis').diagnosis).toBe('lumbar spondylosis')
  })

  test('complaints of', () => {
    expect(parseDictation('complaints of low back pain since two weeks').chiefComplaint).toBe(
      'low back pain since two weeks',
    )
  })

  test('advice', () => {
    expect(parseDictation('advice hot fomentation twice daily').advice).toBe(
      'hot fomentation twice daily',
    )
  })

  test('investigations keeps the modality in the text', () => {
    expect(parseDictation('x-ray of the lumbar spine').investigations).toBe(
      'x-ray of the lumbar spine',
    )
  })

  test('follow-up in days', () => {
    expect(parseDictation('review after one week').followUpDays).toBe(7)
    expect(parseDictation('follow up in 10 days').followUpDays).toBe(10)
    expect(parseDictation('come back after a month').followUpDays).toBe(30)
  })

  test('a whole consult parses into all its parts', () => {
    const parsed = parseDictation(
      'complaints of low back pain, diagnosis lumbar spondylosis, tab zerodol SP one zero one for five days after food, advice hot fomentation, review after one week',
    )
    expect(parsed.chiefComplaint).toBe('low back pain')
    expect(parsed.diagnosis).toBe('lumbar spondylosis')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.advice).toBe('hot fomentation')
    expect(parsed.followUpDays).toBe(7)
  })
})

/* -------------------------------------------------------------------------- */
/*  Nothing is lost                                                            */
/* -------------------------------------------------------------------------- */

describe('unparsed text survives', () => {
  test('text before any cue is kept', () => {
    const parsed = parseDictation('the patient looks much better today. tab dolo bd for 3 days')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.unparsed.join(' ')).toContain('much better')
  })

  test('a dictation with no cue at all is entirely unparsed, not discarded', () => {
    const parsed = parseDictation('he says the knee gives way on stairs')
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.unparsed).toHaveLength(1)
    expect(parsed.unparsed[0]).toContain('gives way')
  })

  test('leftover words inside a medicine stay on that row', () => {
    const row = one('tab dolo bd for 3 days apply local heat')
    expect(row.instructions).toContain('apply local heat')
  })

  test('empty input parses to an empty draft', () => {
    const parsed = parseDictation('   ')
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.unparsed).toHaveLength(0)
    expect(parsed.diagnosis).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Normalisation and ASR repairs                                              */
/* -------------------------------------------------------------------------- */

describe('normalisation', () => {
  test('filler is stripped and whitespace collapsed', () => {
    expect(normaliseTranscript('  Tab   uh Dolo   BD  ')).toBe('tab dolo bd')
  })

  test('a multiplication sign before digits reads as x', () => {
    expect(one('tab dolo bd ×5d').durationDays).toBe(5)
  })

  test('filler inside a drug name is dropped from the name but kept in the quote', () => {
    const row = one('um tab dolo uh 650 one zero one for five days')
    expect(row.spokenName).toBe('dolo 650')
    expect(row.sourceText).toContain('uh')
    expect(row.schedule).toEqual({ m: 1, a: 0, n: 1 })
  })

  test('"odd" heard for OD is repaired', () => {
    expect(one('tab dolo odd for five days').schedule).toEqual({ m: 1, a: 0, n: 0 })
  })

  test('"depot" heard for BD is repaired, but not after inj', () => {
    expect(one('tab dolo depot for five days').schedule).toEqual({ m: 1, a: 0, n: 1 })
    const injection = one('inj depot medrol one stat')
    expect(injection.spokenName).toBe('depot medrol')
  })
})

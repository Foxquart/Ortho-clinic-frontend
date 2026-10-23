import { describe, expect, test } from 'bun:test'
import { daysBn, frequencyBn, frequencyEn } from './bn'

// Same cases as the API's app/tests/test_frequency_words.py (Bengali half).
describe('frequencyBn', () => {
  test('renders parsable codes', () => {
    expect(frequencyBn('1-0-1')).toBe('সকালে ১টা এবং রাতে ১টা')
    expect(frequencyBn('1-1-1')).toBe('সকালে ১টা, দুপুরে ১টা এবং রাতে ১টা')
    expect(frequencyBn('0-0-1')).toBe('রাতে ১টা')
    expect(frequencyBn('0.5-0-1')).toBe('সকালে আধা এবং রাতে ১টা')
    expect(frequencyBn('1.5-0-0')).toBe('সকালে ১.৫টা')
    expect(frequencyBn(' 1 - 0 - 1 ')).toBe('সকালে ১টা এবং রাতে ১টা')
  })

  test('stays silent on everything else', () => {
    for (const code of [
      'SOS',
      'before bed',
      '1x1',
      '1-_-1',
      '1-0',
      '1-0-1-1',
      '0-0-0',
      'inf-0-1',
      '-1-0-1',
      '',
    ]) {
      expect(frequencyBn(code)).toBe('')
    }
  })
})

// Dose unit follows the medicine's dosage form (same rules as the API's print.py).
describe('dosage form units', () => {
  test('tablet wording is the default for tablet, capsule, other, unknown and missing', () => {
    for (const form of ['tablet', 'capsule', 'other', 'lozenge', null, undefined]) {
      expect(frequencyEn('1-0-1', form)).toBe('1 in the morning and 1 at night')
      expect(frequencyBn('1-0-1', form)).toBe('সকালে ১টা এবং রাতে ১টা')
    }
    expect(frequencyEn('1-1-1')).toBe('1 in the morning, 1 in the afternoon and 1 at night')
    expect(frequencyEn('0.5-0-1')).toBe('half in the morning and 1 at night')
    expect(frequencyEn('0-0-1')).toBe('1 at night')
  })

  test('syrup counts spoons', () => {
    expect(frequencyEn('1-0-1', 'syrup')).toBe('1 tsp in the morning and 1 tsp at night')
    expect(frequencyBn('1-0-1', 'syrup')).toBe('সকালে ১ চামচ এবং রাতে ১ চামচ')
    expect(frequencyEn('0.5-0-0', 'syrup')).toBe('half tsp in the morning')
    expect(frequencyBn('0.5-0-0', 'syrup')).toBe('সকালে আধা চামচ')
    expect(frequencyEn('2-1-1', 'syrup')).toBe(
      '2 tsp in the morning, 1 tsp in the afternoon and 1 tsp at night',
    )
    expect(frequencyBn('1.5-0-0', 'syrup')).toBe('সকালে ১.৫ চামচ')
  })

  test('drops count drops', () => {
    expect(frequencyEn('2-0-0', 'drops')).toBe('2 drops in the morning')
    expect(frequencyBn('2-0-0', 'drops')).toBe('সকালে ২ ফোঁটা')
    expect(frequencyEn('1-0-1', 'drops')).toBe('1 drop in the morning and 1 drop at night')
    expect(frequencyBn('1-0-1', 'drops')).toBe('সকালে ১ ফোঁটা এবং রাতে ১ ফোঁটা')
  })

  test('forms with no count words stay silent', () => {
    for (const form of ['ointment', 'cream', 'gel', 'injection', 'inhaler', 'powder']) {
      expect(frequencyEn('1-0-1', form)).toBe('')
      expect(frequencyBn('1-0-1', form)).toBe('')
    }
  })

  test('unparseable codes stay silent for every form', () => {
    for (const form of ['tablet', 'syrup', 'drops']) {
      for (const code of ['SOS', 'before bed', '1-0', '0-0-0', '1-_-1', '']) {
        expect(frequencyEn(code, form)).toBe('')
        expect(frequencyBn(code, form)).toBe('')
      }
    }
  })
})

test('daysBn', () => {
  expect(daysBn(5)).toBe('৫ দিন')
  expect(daysBn(14)).toBe('১৪ দিন')
})

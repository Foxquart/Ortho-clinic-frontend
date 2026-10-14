import { describe, expect, test } from 'bun:test'
import { daysBn, frequencyBn } from './bn'

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

test('daysBn', () => {
  expect(daysBn(5)).toBe('৫ দিন')
  expect(daysBn(14)).toBe('১৪ দিন')
})

import { describe, expect, test } from 'bun:test'
import { ageGender, dayLabel, groupByDay, isIsoDay, rangeBounds, resolveRange } from './range'

// Wed 14 Oct 2026, mid-afternoon local time.
const NOW = new Date(2026, 9, 14, 15, 0, 0)

describe('resolveRange', () => {
  test('defaults to today, widens to all when the doctor is searching', () => {
    expect(resolveRange(null, false)).toBe('today')
    expect(resolveRange(null, true)).toBe('all')
    expect(resolveRange('garbage', false)).toBe('today')
    expect(resolveRange('2026-02-30', false)).toBe('today')
  })

  test('keeps an explicit choice even while searching', () => {
    expect(resolveRange('today', true)).toBe('today')
    expect(resolveRange('7d', false)).toBe('7d')
    expect(resolveRange('2026-10-01', true)).toBe('2026-10-01')
    expect(isIsoDay('2026-10-01')).toBe(true)
  })
})

describe('rangeBounds', () => {
  test('maps each chip to inclusive local dates', () => {
    expect(rangeBounds('today', NOW)).toEqual({ date_from: '2026-10-14', date_to: '2026-10-14' })
    expect(rangeBounds('yesterday', NOW)).toEqual({
      date_from: '2026-10-13',
      date_to: '2026-10-13',
    })
    expect(rangeBounds('7d', NOW)).toEqual({ date_from: '2026-10-08', date_to: '2026-10-14' })
    expect(rangeBounds('all', NOW)).toEqual({})
    expect(rangeBounds('2026-09-30', NOW)).toEqual({
      date_from: '2026-09-30',
      date_to: '2026-09-30',
    })
  })
})

describe('groupByDay', () => {
  test('groups consecutive rows by local day and keeps order', () => {
    const rows = [
      { id: 1, created_at: '2026-10-14T10:00:00' },
      { id: 2, created_at: '2026-10-14T09:00:00' },
      { id: 3, created_at: '2026-10-13T18:00:00' },
    ]
    const groups = groupByDay(rows)
    expect(groups.map((g) => [g.day, g.rows.map((r) => r.id)])).toEqual([
      ['2026-10-14', [1, 2]],
      ['2026-10-13', [3]],
    ])
  })
})

describe('dayLabel', () => {
  test('speaks English and everyday Bengali', () => {
    expect(dayLabel('2026-10-14', NOW)).toEqual({ relative: 'Today', date: 'Wed 14 Oct', bn: 'আজ' })
    expect(dayLabel('2026-10-13', NOW).bn).toBe('গতকাল')
    expect(dayLabel('2026-10-11', NOW).relative).toBe('3 days ago')
    expect(dayLabel('2026-10-11', NOW).bn).toBe('৩ দিন আগে')
    expect(dayLabel('2026-09-16', NOW).bn).toBe('৪ সপ্তাহ আগে')
    expect(dayLabel('2025-12-01', NOW).date).toBe('Mon 1 Dec 2025')
  })
})

describe('ageGender', () => {
  test('survives missing halves', () => {
    expect(ageGender(34, 'female')).toBe('34y · F')
    expect(ageGender(null, 'male')).toBe('M')
    expect(ageGender(7, null)).toBe('7y')
    expect(ageGender(null, null)).toBe('')
  })
})

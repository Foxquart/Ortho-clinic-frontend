import { expect, test } from 'bun:test'
import { ageToDob, dobToAge, formatAge } from './age'

const today = new Date(2026, 9, 23) // 23 Oct 2026

test('ageToDob subtracts years and months', () => {
  expect(ageToDob(34, 2, today)).toBe('1992-08-23')
  expect(ageToDob(0, 8, today)).toBe('2026-02-23')
  expect(ageToDob(0, 0, today)).toBe('2026-10-23')
  expect(ageToDob(2, 11, today)).toBe('2023-11-23') // crosses a year boundary
})

test('ageToDob clamps the day to the end of a shorter month', () => {
  expect(ageToDob(0, 1, new Date(2026, 2, 31))).toBe('2026-02-28')
  expect(ageToDob(0, 1, new Date(2028, 2, 31))).toBe('2028-02-29')
  expect(ageToDob(1, 0, new Date(2028, 1, 29))).toBe('2027-02-28')
})

test('dobToAge counts whole years and months', () => {
  expect(dobToAge('1992-08-23', today)).toEqual({ years: 34, months: 2 })
  expect(dobToAge('1992-08-24', today)).toEqual({ years: 34, months: 1 })
  expect(dobToAge('2026-02-23', today)).toEqual({ years: 0, months: 8 })
  expect(dobToAge('2026-10-23', today)).toEqual({ years: 0, months: 0 })
  expect(dobToAge('2027-01-01', today)).toEqual({ years: 0, months: 0 }) // future
})

test('dobToAge treats month-end as a complete month', () => {
  expect(dobToAge('2026-01-31', new Date(2026, 1, 28))).toEqual({ years: 0, months: 1 })
})

test('age -> dob -> age round-trips', () => {
  for (const [y, m] of [
    [34, 2],
    [0, 8],
    [5, 0],
    [0, 11],
    [120, 11],
  ] as const) {
    expect(dobToAge(ageToDob(y, m, today), today)).toEqual({ years: y, months: m })
  }
  const eom = new Date(2026, 2, 31)
  expect(dobToAge(ageToDob(0, 1, eom), eom)).toEqual({ years: 0, months: 1 })
})

test('formatAge', () => {
  expect(formatAge('1992-08-23', today)).toBe('34 Y 2 M')
  expect(formatAge('2026-02-23', today)).toBe('8 M')
  expect(formatAge('1992-10-23', today)).toBe('34 Y')
  expect(formatAge('2026-10-23', today)).toBe('0 M')
  expect(formatAge(null, today)).toBe('')
  expect(formatAge('', today)).toBe('')
})

import { expect, test } from 'bun:test'
import { visitGroup } from './lastVisit'

const now = new Date(2026, 9, 14, 9, 0) // 14 Oct 2026, morning

test('visitGroup buckets by calendar day', () => {
  expect(visitGroup('2026-10-14', now)).toBe('today')
  expect(visitGroup('2026-10-16', now)).toBe('today') // clock skew, never "-2 days"
  expect(visitGroup('2026-10-13', now)).toBe('yesterday')
  expect(visitGroup('2026-10-08', now)).toBe('week')
  expect(visitGroup('2026-10-07', now)).toBe('earlier')
  expect(visitGroup(null, now)).toBe('never')
})

import { expect, test } from 'bun:test'
import { relativeDay } from './relativeDay'

const now = new Date('2026-10-14T08:00:00')

test('relativeDay speaks everyday Bengali beside the English', () => {
  const at = (iso: string) => relativeDay(iso, now)
  expect(at('2026-10-13T23:30:00')).toEqual({ bn: 'গতকাল', en: 'Yesterday' })
  expect(at('2026-10-14T01:00:00')).toEqual({ bn: 'আজ', en: 'Today' })
  expect(at('2026-10-11')).toEqual({ bn: '৩ দিন আগে', en: '3 days ago' })
  expect(at('2026-09-30')).toEqual({ bn: '২ সপ্তাহ আগে', en: '2 weeks ago' })
  expect(at('2026-07-01')).toEqual({ bn: '৩ মাস আগে', en: '3 months ago' })
  expect(at('2024-01-01')).toEqual({ bn: '২ বছর আগে', en: '2 years ago' })
  expect(relativeDay(null, now)).toBeNull()
})

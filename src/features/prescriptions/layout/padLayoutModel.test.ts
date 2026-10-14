import { describe, expect, test } from 'bun:test'
import { customKey, defaultSections, dropNear, shift } from './padLayoutModel'
import type { PadLayoutSection } from './usePadLayout'

const keys = (list: PadLayoutSection[]) => list.map((s) => s.key)

describe('padLayoutModel', () => {
  test('shift swaps neighbours and ignores the edges', () => {
    const list = defaultSections()
    expect(keys(shift(list, 'diagnosis', -1)).slice(0, 2)).toEqual(['diagnosis', 'chief_complaint'])
    expect(keys(shift(list, 'chief_complaint', -1))).toEqual(keys(list))
    expect(keys(shift(list, 'follow_up', 1))).toEqual(keys(list))
  })

  test('dropNear inserts before or after the target', () => {
    const list = defaultSections()
    expect(keys(dropNear(list, 'follow_up', 'chief_complaint', false))[0]).toBe('follow_up')
    expect(keys(dropNear(list, 'chief_complaint', 'diagnosis', true)).slice(0, 2)).toEqual([
      'diagnosis',
      'chief_complaint',
    ])
  })

  test('customKey slugs the label, falls back, and stays unique', () => {
    expect(customKey('X-ray report', [])).toBe('custom:x_ray_report')
    expect(customKey('এক্স-রে', [])).toBe('custom:section')
    expect(customKey('X-ray report', ['custom:x_ray_report'])).toBe('custom:x_ray_report_2')
    expect(customKey('a'.repeat(80), []).length <= 'custom:'.length + 40).toBe(true)
  })
})

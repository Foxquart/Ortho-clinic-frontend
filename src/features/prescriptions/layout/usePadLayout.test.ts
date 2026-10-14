import { describe, expect, test } from 'bun:test'
import { DEFAULT_PAD_LAYOUT, MAX_SECTIONS, normalizeLayout } from './usePadLayout'

const keys = (raw: unknown) => normalizeLayout(raw).sections.map((s) => s.key)

describe('normalizeLayout', () => {
  test('nothing usable gives the default layout, as a fresh copy', () => {
    for (const raw of [null, undefined, 42, 'x', {}, { sections: 'nope' }, { sections: [] }]) {
      const out = normalizeLayout(raw)
      expect(out).toEqual(DEFAULT_PAD_LAYOUT)
      expect(out).not.toBe(DEFAULT_PAD_LAYOUT)
    }
    expect(keys(null)).toEqual([
      'chief_complaint',
      'diagnosis',
      'examination_findings',
      'investigations',
      'procedure',
      'consult',
      'advice',
      'notes',
      'follow_up',
    ])
  })

  test('keeps order, renames and hides; appends the built-ins it forgot, visible', () => {
    const out = normalizeLayout({
      sections: [
        { key: 'advice', label: ' Salah ', visible: false },
        { key: 'custom:gait', label: 'Gait', visible: true },
        { key: 'diagnosis', label: '', visible: true },
      ],
    })
    expect(out.sections.slice(0, 3)).toEqual([
      { key: 'advice', label: 'Salah', visible: false },
      { key: 'custom:gait', label: 'Gait', visible: true },
      { key: 'diagnosis', label: 'Diagnosis', visible: true }, // blank label -> default
    ])
    expect(out.sections).toHaveLength(10)
    expect(out.sections.slice(3).every((s) => s.visible)).toBe(true)
    expect(out.sections.some((s) => s.key === 'follow_up')).toBe(true)
  })

  test('drops junk: unknown keys, bad slugs, duplicates, unlabelled customs, non-objects', () => {
    const out = normalizeLayout({
      sections: [
        { key: 'bogus', label: 'x', visible: true },
        { key: 'custom:Bad Slug', label: 'x', visible: true },
        { key: 'custom:ok', label: '   ', visible: true },
        { key: 'custom:ok', label: 'Ok', visible: true },
        { key: 'custom:ok', label: 'Again', visible: true },
        { key: 'notes', label: 'Mine', visible: true },
        { key: 'notes', label: 'Dup', visible: false },
        null,
        'diagnosis',
        { label: 'no key' },
      ],
    })
    expect(out.sections.slice(0, 2)).toEqual([
      { key: 'custom:ok', label: 'Ok', visible: true },
      { key: 'notes', label: 'Mine', visible: true },
    ])
    expect(out.sections).toHaveLength(2 + 8)
  })

  test('truncates a long label to 64', () => {
    const out = normalizeLayout({
      sections: [{ key: 'custom:a', label: 'x'.repeat(100), visible: true }],
    })
    expect(out.sections[0].label).toHaveLength(64)
  })

  test('caps at 30 by shedding trailing customs, never built-ins', () => {
    const customs = Array.from({ length: 40 }, (_, i) => ({
      key: `custom:c${i}`,
      label: `C${i}`,
      visible: true,
    }))
    const out = normalizeLayout({ sections: customs })
    expect(out.sections).toHaveLength(MAX_SECTIONS)
    expect(out.sections.filter((s) => !s.key.startsWith('custom:'))).toHaveLength(9)
    expect(out.sections.filter((s) => s.key.startsWith('custom:'))).toHaveLength(21)
    expect(out.sections[0].key).toBe('custom:c0') // earliest kept
  })
})

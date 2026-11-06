import { describe, expect, test } from 'bun:test'
import {
  appendInvestigationLine,
  groupInvestigations,
  idsInText,
  investigationLines,
  reconcileInvestigationIds,
  removeInvestigationLine,
  toInvestigationOptions,
  type InvestigationOption,
} from './catalog'

const OPTIONS: InvestigationOption[] = [
  { id: 'i1', name: 'CBC', category: 'Blood' },
  { id: 'i2', name: 'X-ray', category: 'Radiology / Pathology' },
  { id: null, name: 'MRI', category: 'Radiology / Pathology' },
  { id: 'i3', name: 'ECG', category: null },
]

describe('investigation text lines', () => {
  test('one test per line, trimmed, blanks ignored', () => {
    expect([...investigationLines(' CBC \n\nKFT\n  ')]).toEqual(['CBC', 'KFT'])
  })

  test('append and remove preserve the rest of the text', () => {
    const added = appendInvestigationLine('CBC', 'KFT')
    expect(added).toBe('CBC\nKFT')
    expect(appendInvestigationLine('', 'KFT')).toBe('KFT')
    expect(removeInvestigationLine('CBC\nKFT\nX-ray', 'KFT')).toBe('CBC\nX-ray')
  })
})

describe('ids', () => {
  test('a line with a catalogue row contributes its id; freehand lines do not', () => {
    expect(idsInText('CBC\nMRI\nsomething else', OPTIONS)).toEqual(['i1'])
  })

  test('deleting a line drops its id, typing one adopts its id', () => {
    expect(reconcileInvestigationIds(['i1', 'i3'], 'CBC', OPTIONS)).toEqual(['i1'])
    expect(reconcileInvestigationIds([], 'CBC\nX-ray', OPTIONS)).toEqual(['i1', 'i2'])
  })

  test('an id the option list cannot resolve is kept rather than silently lost', () => {
    expect(reconcileInvestigationIds(['gone'], 'CBC', OPTIONS)).toEqual(['gone', 'i1'])
  })

  test('server rows map to options; an empty or failed catalogue falls back', () => {
    const rows = [
      {
        id: 's1',
        name: 'CBC',
        category: 'Blood',
        sort_order: 0,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ]
    expect(toInvestigationOptions(rows)).toEqual([{ id: 's1', name: 'CBC', category: 'Blood' }])
    expect(toInvestigationOptions([]).length).toBeGreaterThan(0)
    expect(toInvestigationOptions(undefined).length).toBeGreaterThan(0)
  })
})

describe('grouping', () => {
  test('categories keep their order and General comes last', () => {
    expect(groupInvestigations(OPTIONS).map((g) => g.name)).toEqual([
      'Blood',
      'Radiology / Pathology',
      'General',
    ])
  })
})

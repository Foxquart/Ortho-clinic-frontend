import { describe, expect, test } from 'bun:test'
import type { PrescriptionTemplateResponse } from '@/api/schema'
import {
  applyPrevious,
  applyTemplate,
  blank,
  entered,
  extraValue,
  hasTemplateContent,
  newDraft,
  newRow,
  setExtraField,
  shownSections,
  templateFromDraft,
  toApiRequest,
  toPreviewRequest,
  withLayoutLabels,
  type RxDraft,
} from './model'
import { DEFAULT_PAD_LAYOUT, normalizeLayout } from './layout/usePadLayout'

const template: PrescriptionTemplateResponse = {
  id: 't1',
  name: 'Knee OA',
  chief_complaint: 'Knee pain',
  diagnosis: 'Osteoarthritis',
  advice: null,
  investigations: null,
  procedure: null,
  consult: null,
  notes: null,
  follow_up_days: 14,
  items: [
    { medicine_id: 'm1', medicine_name: 'Paracetamol', frequency: '1-0-1', duration_days: 5, food_timing: 'after' },
    { medicine_id: 'm2', medicine_name: null, frequency: 'SOS' },
  ],
  created_at: '',
  updated_at: '',
}

describe('templates', () => {
  test('apply fills non-patient fields as entered, skips gone medicines, spares patient and vitals', () => {
    const draft = { ...newDraft(), vitalsBp: entered('120/80'), advice: entered('Rest') }
    let n = 0
    const out = applyTemplate(draft, template, () => `k${++n}`)
    expect(out.patient).toBe(draft.patient)
    expect(out.vitalsBp).toEqual(entered('120/80'))
    expect(out.advice).toEqual(entered('Rest')) // template has none: kept
    expect(out.diagnosis).toEqual(entered('Osteoarthritis'))
    expect(out.followUpDate.provenance).toBe('entered')
    expect(out.rows).toHaveLength(1)
    const row = out.rows[0]
    expect([row.medicineId, row.frequency, row.quantity, row.food]).toEqual(['m1', entered('1-0-1'), blank(null), 'after'])
  })

  test('saving the applied pad gives the template back (minus the gone medicine)', () => {
    const out = applyTemplate(newDraft(), template, () => 'k')
    const body = templateFromDraft(out, ' Knee OA ')
    expect([body.name, body.diagnosis, body.follow_up_days, body.advice]).toEqual(['Knee OA', 'Osteoarthritis', 14, null])
    expect(body.items).toEqual([
      { medicine_id: 'm1', frequency: '1-0-1', duration_days: 5, quantity: null, instructions: null, food_timing: 'after' },
    ])
  })

  test('an empty pad has nothing to overwrite', () => {
    expect(hasTemplateContent(newDraft())).toBe(false)
  })
})

describe('examination findings and custom sections', () => {
  const withExtras: PrescriptionTemplateResponse = {
    ...template,
    examination_findings: 'Medial joint line tender, ROM 0-110',
    extra_fields: [
      { key: 'custom:gait', label: 'Gait', value: 'Antalgic' },
      { key: 'custom:blank', label: 'Blank', value: '   ' },
    ],
  }

  /** A draft the API would accept, so toApiRequest does not throw. */
  const ready = (draft: RxDraft): RxDraft => ({
    ...draft,
    patient: { ...draft.patient, firstName: 'A', lastName: 'B', phone: '1' },
    rows: [{ ...newRow('r'), medicineId: 'm1', frequency: entered('1-0-1') }],
  })

  test('apply carries both as entered, drops empty values, keeps what the pad already has', () => {
    const draft = setExtraField(newDraft(), 'custom:posture', 'Posture', entered('Stooped'))
    const out = applyTemplate(draft, withExtras, () => 'k')
    expect(out.examinationFindings).toEqual(entered('Medial joint line tender, ROM 0-110'))
    expect(out.extraFields.map((f) => [f.key, f.value.value])).toEqual([
      ['custom:posture', 'Stooped'],
      ['custom:gait', 'Antalgic'],
    ])
    expect(extraValue(out, 'custom:gait')).toEqual(entered('Antalgic'))
    expect(extraValue(out, 'custom:nope')).toEqual(blank(''))
  })

  test('a template value replaces the same custom section instead of duplicating it', () => {
    const draft = setExtraField(newDraft(), 'custom:gait', 'Gait', entered('Normal'))
    const out = applyTemplate(draft, withExtras, () => 'k')
    expect(out.extraFields).toHaveLength(1)
    expect(extraValue(out, 'custom:gait').value).toBe('Antalgic')
  })

  test('template round-trip: apply then save gives both back', () => {
    const body = templateFromDraft(applyTemplate(newDraft(), withExtras, () => 'k'), 'T')
    expect(body.examination_findings).toBe('Medial joint line tender, ROM 0-110')
    expect(body.extra_fields).toEqual([{ key: 'custom:gait', label: 'Gait', value: 'Antalgic' }])
    expect(templateFromDraft(newDraft(), 'T').extra_fields).toEqual([])
  })

  test('a pad with only a custom value has content a template would overwrite', () => {
    expect(hasTemplateContent(setExtraField(newDraft(), 'custom:a', 'A', entered('x')))).toBe(true)
    expect(hasTemplateContent(setExtraField(newDraft(), 'custom:a', 'A', entered(' ')))).toBe(false)
  })

  test('repeat carries both, marked carried over', () => {
    const out = applyPrevious(
      newDraft(),
      {
        patient_id: 'p1',
        created_at: '2026-10-01T09:00:00',
        chief_complaint: null,
        diagnosis: 'OA',
        examination_findings: 'Crepitus',
        extra_fields: [{ key: 'custom:gait', label: 'Gait', value: 'Antalgic' }],
        advice: null,
        notes: null,
        follow_up_date: null,
        items: [],
      },
      () => 'k',
    )
    expect(out.examinationFindings).toEqual({ value: 'Crepitus', provenance: 'defaulted' })
    expect(out.extraFields).toEqual([
      { key: 'custom:gait', label: 'Gait', value: { value: 'Antalgic', provenance: 'defaulted' } },
    ])
  })

  test('the request carries both; empty custom values are not sent; labels follow the layout', () => {
    const draft = ready(applyTemplate(newDraft(), withExtras, () => 'k'))
    const layout = normalizeLayout({
      sections: [{ key: 'custom:gait', label: 'Walking', visible: true }],
    })
    for (const body of [toApiRequest(withLayoutLabels(draft, layout)), toPreviewRequest(withLayoutLabels(draft, layout))]) {
      expect(body.examination_findings).toBe('Medial joint line tender, ROM 0-110')
      expect(body.extra_fields).toEqual([{ key: 'custom:gait', label: 'Walking', value: 'Antalgic' }])
    }
    // A key the layout no longer has keeps its snapshot label.
    const orphan = toApiRequest(withLayoutLabels(draft, DEFAULT_PAD_LAYOUT))
    expect(orphan.extra_fields).toEqual([{ key: 'custom:gait', label: 'Gait', value: 'Antalgic' }])
    // And an untouched pad sends nothing.
    expect(toApiRequest(ready(newDraft())).examination_findings).toBeNull()
    expect(toApiRequest(ready(newDraft())).extra_fields).toEqual([])
  })

  test('client_request_id rides along when given and is absent otherwise', () => {
    const draft = ready(newDraft())
    expect(toApiRequest(draft, 'req-1').client_request_id).toBe('req-1')
    expect('client_request_id' in toApiRequest(draft)).toBe(false)
  })

  test('shownSections: layout order, hidden skipped unless filled, orphan customs last', () => {
    const layout = normalizeLayout({
      sections: [
        { key: 'advice', label: 'Salah', visible: true },
        { key: 'diagnosis', label: 'Dx', visible: false },
        { key: 'notes', label: 'Notes', visible: false },
        { key: 'custom:gait', label: 'Gait', visible: false },
      ],
    })
    const keys = (d: RxDraft) => shownSections(d, layout).map((s) => s.key)

    const plain = keys(newDraft())
    expect(plain[0]).toBe('advice')
    expect(plain).not.toContain('diagnosis')
    expect(plain).not.toContain('notes')
    expect(plain).not.toContain('custom:gait')
    expect(plain).toContain('examination_findings') // appended built-in, visible

    const filled = {
      ...newDraft(),
      notes: entered('Allergy override: x'),
      diagnosis: entered('OA'),
    }
    const withCustom = setExtraField(filled, 'custom:gait', 'Gait', entered('Antalgic'))
    for (const key of ['diagnosis', 'notes', 'custom:gait']) expect(keys(withCustom)).toContain(key)

    const orphan = setExtraField(newDraft(), 'custom:old', 'Old section', entered('kept'))
    const shown = shownSections(orphan, layout)
    expect(shown.at(-1)).toEqual({ key: 'custom:old', label: 'Old section', visible: true })
  })
})

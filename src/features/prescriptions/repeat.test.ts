import { describe, expect, test } from 'bun:test'
import { applyPrevious, blank, canSubmitDraft, entered, newDraft, type RepeatSource } from './model'

const rx: RepeatSource = {
  patient_id: 'p1',
  created_at: '2026-10-01T09:00:00',
  chief_complaint: 'Knee pain',
  diagnosis: 'Osteoarthritis',
  advice: null,
  notes: null,
  procedure: 'NA',
  follow_up_date: '2026-10-15',
  items: [
    {
      frequency: '1-0-1',
      duration_days: 5,
      quantity: 10,
      instructions: 'after food',
      food_timing: null,
      medicine: { id: 'm1', name: 'Paracetamol' },
    },
  ],
}

describe('repeat last prescription', () => {
  test('carries everything except vitals and patient, all marked carried over', () => {
    const draft = {
      ...newDraft(),
      vitalsBp: entered('140/90'),
      patient: { ...newDraft().patient, id: 'p1' },
    }
    let n = 0
    const out = applyPrevious(draft, rx, () => `k${++n}`)
    expect(out.patient).toBe(draft.patient)
    expect(out.vitalsBp).toEqual(entered('140/90'))
    expect(out.vitalsWeight).toEqual(blank(''))
    expect(out.diagnosis).toEqual({ value: 'Osteoarthritis', provenance: 'defaulted' })
    expect(out.procedure.provenance).toBe('defaulted')
    expect(out.advice).toEqual(blank('')) // source had none: untouched
    expect(out.followUpDate.provenance).toBe('defaulted')
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].frequency).toEqual({ value: '1-0-1', provenance: 'defaulted' })
    expect(out.rows[0].food).toBe('after') // legacy text sniffed, like "continue previous"
    expect(
      canSubmitDraft({
        ...out,
        patient: { ...out.patient, firstName: 'A', lastName: 'B', phone: '1' },
      }),
    ).toBe(true)
  })
})

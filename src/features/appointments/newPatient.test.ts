import { expect, test } from 'bun:test'
import { BLANK_NEW_PATIENT, newPatientIssues, seedFromQuery, toInlinePatient } from './newPatient'

const today = new Date(2026, 9, 23)
const ok = { ...BLANK_NEW_PATIENT, first_name: ' Ana ', last_name: 'Roy', phone: ' 9876543210 ' }

test('blank age and sex are omitted; age becomes a date of birth', () => {
  expect(toInlinePatient(ok, today)).toEqual({ first_name: 'Ana', last_name: 'Roy', phone: '9876543210' })
  expect(
    toInlinePatient({ ...ok, gender: 'female', age_years: '34', age_months: '2' }, today),
  ).toEqual({
    first_name: 'Ana',
    last_name: 'Roy',
    phone: '9876543210',
    gender: 'female',
    date_of_birth: '1992-08-23',
  })
  expect(toInlinePatient({ ...ok, age_months: '8' }, today).date_of_birth).toBe('2026-02-23')
})

test('validation mirrors PatientUpsert and the age ranges', () => {
  expect(newPatientIssues(ok)).toEqual({})
  expect(Object.keys(newPatientIssues(BLANK_NEW_PATIENT))).toEqual(['first_name', 'last_name', 'phone'])
  expect(newPatientIssues({ ...ok, phone: '12345' }).phone).toBeTruthy()
  expect(newPatientIssues({ ...ok, age_years: '121' }).age_years).toBeTruthy()
  expect(newPatientIssues({ ...ok, age_months: '12' }).age_months).toBeTruthy()
  expect(newPatientIssues({ ...ok, age_years: '-1' }).age_years).toBeTruthy()
})

test('search text seeds phone or name', () => {
  expect(seedFromQuery('98765 43210').phone).toBe('98765 43210')
  expect(seedFromQuery('Ana de Roy')).toEqual({ first_name: 'Ana', last_name: 'de Roy', phone: '' })
})

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Phone, Plus, UserPlus, UserRound, X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { fullName } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Input } from '@/components/ui/Input'
import { Kbd } from '@/components/ui/Badge'
import type { Page_PatientResponse_, PatientSearchResult } from '@/api/schema'
import { FIELD_IDS, focusField } from './padState'
import type { RxPatient } from './model'

/* -------------------------------------------------------------------------- */
/*  Shape detection — one field, no mode switch                                */
/* -------------------------------------------------------------------------- */

/**
 * Does this look like someone reaching for a phone number rather than a name?
 *
 * `GET /patients/search` matches both from a single `q`, so this never changes
 * *what* we ask the server. It decides which of the three quick-add fields the
 * typed text belongs in when nobody matches — typing a number and then
 * retyping it into "Phone" is the kind of small insult that makes software
 * feel unfinished.
 */
function looksLikePhone(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed === '') return false
  const digits = trimmed.replace(/\D/g, '')
  return digits.length >= 4 && /^[\d\s+()\-.]+$/.test(trimmed)
}

/** Turn whatever was typed into a head start on the three fields. */
function seedFromQuery(query: string): Pick<RxPatient, 'firstName' | 'lastName' | 'phone'> {
  const trimmed = query.trim()
  if (trimmed === '') return { firstName: '', lastName: '', phone: '' }
  if (looksLikePhone(trimmed)) return { firstName: '', lastName: '', phone: trimmed }

  const parts = trimmed.split(/\s+/)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    phone: '',
  }
}

/* -------------------------------------------------------------------------- */

/** How the register is browsed when nothing has been typed yet. */
const BROWSE_PARAMS = { page: 1, page_size: 20, sort_by: 'first_name', sort_order: 'asc' } as const

export interface RxPatientFieldProps {
  patient: RxPatient
  onChange: (next: RxPatient) => void
  /** True while the three-field walk-in form is open. Owned by the pad. */
  quickAdd: boolean
  onQuickAddChange: (open: boolean) => void
  /** Field id → message, from a 422 the server sent back. */
  errors?: Record<string, string>
  disabled?: boolean
}

/**
 * The patient control — a single combobox, and the only thing standing between
 * a walk-in and a printed prescription.
 *
 * Prescribing must not require creating a patient first. Searching and
 * creating are the same control: type a name or a number, and if nobody
 * matches, the same list offers to prescribe for someone new. That opens
 * exactly three fields, because those are exactly the three the API demands.
 * No date of birth, no address, no blood group — the record is created as a
 * side effect of prescribing and completed later, if it ever needs to be.
 */
export function RxPatientField({
  patient,
  onChange,
  quickAdd,
  onQuickAddChange,
  errors = {},
  disabled,
}: RxPatientFieldProps) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 180)
  const seeded = useRef(false)

  const searching = debounced.length >= 1

  const results = useQuery({
    queryKey: qk.patients.search(debounced),
    queryFn: () =>
      apiGet<PatientSearchResult[]>(endpoints.patients.search, {
        params: { q: debounced, limit: 8 },
      }),
    enabled: searching,
    staleTime: 20_000,
  })

  // With nothing typed, the clinic's patients are browsed rather than hidden:
  // the search endpoint requires a non-empty `q`, and an empty dropdown over a
  // populated register reads as "no patients exist". The list scrolls inside
  // the combobox's fixed-height panel; a failed browse degrades to the
  // typed-search behaviour.
  const browse = useQuery({
    queryKey: qk.patients.list(BROWSE_PARAMS),
    queryFn: () =>
      apiGet<Page_PatientResponse_>(endpoints.patients.list, { params: BROWSE_PARAMS }),
    enabled: !searching,
    staleTime: 30_000,
  })

  const items: PatientSearchResult[] = searching
    ? (results.data ?? [])
    : (browse.data?.items ?? []).filter((p) => p.is_active)
  const noMatches = searching && !results.isFetching && items.length === 0

  // The combobox's own `value` only ever holds a *found* patient. A walk-in
  // being typed in right now is not a search result and must not pretend to be.
  const selected: PatientSearchResult | null = useMemo(
    () =>
      patient.id
        ? ({
            id: patient.id,
            first_name: patient.firstName,
            last_name: patient.lastName,
            phone: patient.phone,
          } as PatientSearchResult)
        : null,
    [patient.id, patient.firstName, patient.lastName, patient.phone],
  )

  const openQuickAdd = () => {
    if (!seeded.current && !patient.firstName && !patient.lastName && !patient.phone) {
      onChange({ ...patient, id: null, allergies: [], ...seedFromQuery(query) })
      seeded.current = true
    }
    onQuickAddChange(true)
    // Moving focus out of the popover is what closes it — Radix dismisses on
    // focus-outside — so this is both the focus move and the close.
    requestAnimationFrame(() => focusField(FIELD_IDS.patientFirst))
  }

  const cancelQuickAdd = () => {
    seeded.current = false
    onChange({ id: null, firstName: '', lastName: '', phone: '', allergies: [] })
    onQuickAddChange(false)
    requestAnimationFrame(() => focusField(FIELD_IDS.patient))
  }

  // Choosing an existing patient supersedes a half-typed walk-in.
  useEffect(() => {
    if (patient.id && quickAdd) {
      seeded.current = false
      onQuickAddChange(false)
    }
  }, [patient.id, quickAdd, onQuickAddChange])

  const set = (field: 'firstName' | 'lastName' | 'phone') => (value: string) =>
    onChange({ ...patient, [field]: value })

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <label htmlFor={FIELD_IDS.patient} className="text-micro uppercase text-text-subtle">
          Patient
        </label>
        <Combobox<PatientSearchResult>
          id={FIELD_IDS.patient}
          value={selected}
          disabled={disabled}
          onChange={(p) =>
            onChange({
              id: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
              phone: p.phone,
              allergies: (p.allergies ?? []).filter(Boolean),
            })
          }
          query={query}
          onQueryChange={setQuery}
          items={items}
          loading={searching ? results.isFetching : browse.isFetching}
          getKey={(p) => p.id}
          getLabel={(p) => `${fullName(p.first_name, p.last_name)} · ${p.phone}`}
          invalid={Boolean(errors[FIELD_IDS.patient])}
          placeholder={
            quickAdd ? 'New patient — filling in below' : 'Search by name or phone number…'
          }
          searchPlaceholder="Name or phone number…"
          emptyMessage={
            searching ? (
              <span className="flex flex-col gap-1">
                <span className="text-text">
                  Nobody {looksLikePhone(debounced) ? 'on' : 'named'} “{debounced}”.
                </span>
                <span>They can still be prescribed for — see below.</span>
              </span>
            ) : (
              'No patients on file yet. Type a name to search, or add one below.'
            )
          }
          renderItem={(p) => (
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-text">{fullName(p.first_name, p.last_name)}</span>
              <span className="shrink-0 font-mono text-caption text-text-subtle">{p.phone}</span>
            </span>
          )}
          footer={
            <button
              type="button"
              onClick={openQuickAdd}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body',
                'text-text transition-colors duration-instant ease-standard',
                'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
                noMatches && 'bg-accent-muted text-accent-muted-fg hover:bg-accent-muted',
              )}
            >
              <UserPlus aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Prescribe for a new patient
                {query.trim() && <span className="text-text-subtle"> — “{query.trim()}”</span>}
              </span>
              <Kbd className="shrink-0">Tab</Kbd>
            </button>
          }
        />
      </div>

      {quickAdd && !patient.id && (
        <QuickAdd
          patient={patient}
          errors={errors}
          onFirstName={set('firstName')}
          onLastName={set('lastName')}
          onPhone={set('phone')}
          onCancel={cancelQuickAdd}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  The three fields. Exactly three.                                           */
/* -------------------------------------------------------------------------- */

function QuickAdd({
  patient,
  errors,
  onFirstName,
  onLastName,
  onPhone,
  onCancel,
}: {
  patient: RxPatient
  errors: Record<string, string>
  onFirstName: (value: string) => void
  onLastName: (value: string) => void
  onPhone: (value: string) => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-muted/40 p-3">
      <div className="mb-2.5 flex items-start gap-2">
        <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-label font-medium text-text">New patient</p>
          <p className="text-caption text-text-muted">
            Three fields is all it takes to prescribe. The record is created when you print, and
            it starts <strong className="font-medium text-text">incomplete</strong> — date of
            birth, address, allergies and history are added later from the{' '}
            <Link to="/patients" className="text-accent underline-offset-4 hover:underline">
              patient screen
            </Link>
            .
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel new patient" onClick={onCancel}>
          <X aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <QuickAddInput
          id={FIELD_IDS.patientFirst}
          label="First name"
          value={patient.firstName}
          onChange={onFirstName}
          error={errors[FIELD_IDS.patientFirst]}
          maxLength={64}
          autoComplete="off"
        />
        <QuickAddInput
          id={FIELD_IDS.patientLast}
          label="Last name"
          value={patient.lastName}
          onChange={onLastName}
          error={errors[FIELD_IDS.patientLast]}
          maxLength={64}
          autoComplete="off"
        />
        <QuickAddInput
          id={FIELD_IDS.patientPhone}
          label="Phone"
          value={patient.phone}
          onChange={onPhone}
          error={errors[FIELD_IDS.patientPhone]}
          maxLength={20}
          inputMode="tel"
          autoComplete="off"
          icon={<Phone aria-hidden className="size-3.5" />}
          hint="6–20 digits"
        />
      </div>
    </div>
  )
}

function QuickAddInput({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  icon,
  ...rest
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  icon?: React.ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const missing = value.trim() === ''

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-micro uppercase text-text-subtle">
        {label}
      </label>
      <Input
        {...rest}
        id={id}
        value={value}
        iconLeft={icon}
        invalid={Boolean(error)}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        // An em dash, never an example. A greyed-out "Ranjit" in an empty
        // required field is a value the doctor never gave, dressed as a hint.
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className={cn(missing && !error && 'border-dashed border-provenance-blank')}
      />
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  The identity line under the control                                        */
/* -------------------------------------------------------------------------- */

/**
 * Who this prescription is for, once that is settled.
 *
 * A brand-new walk-in gets a different line from a patient on file: their
 * record is deliberately partial, and pretending otherwise would be the start
 * of trusting an empty allergy list.
 */
export function RxPatientIdentity({
  patient,
  age,
  gender,
  onClear,
}: {
  patient: RxPatient
  age?: number | null
  gender?: string | null
  onClear: () => void
}) {
  const name = `${patient.firstName} ${patient.lastName}`.trim()
  if (!name && !patient.phone) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
      <span className="inline-flex items-center gap-1.5 text-text">
        {patient.id ? (
          <UserRound aria-hidden className="size-3.5 text-text-subtle" />
        ) : (
          <Plus aria-hidden className="size-3.5 text-accent" />
        )}
        <span className="font-medium">{name || 'Unnamed'}</span>
      </span>
      {patient.phone && <span className="font-mono">{patient.phone}</span>}
      {age != null && <span>{age} years</span>}
      {gender && <span className="capitalize">{gender}</span>}
      {patient.id ? (
        <Link
          to={`/patients/${patient.id}`}
          className="text-accent underline-offset-4 hover:underline"
        >
          Open record
        </Link>
      ) : (
        <span className="text-text-subtle">New record — created when you print</span>
      )}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        Change patient
      </Button>
    </div>
  )
}

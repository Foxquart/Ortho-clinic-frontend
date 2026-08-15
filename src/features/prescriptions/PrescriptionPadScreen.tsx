import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, Lock, Plus, Printer, Save } from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL, apiGet, apiPost, resolveApiUrl } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { toApiError } from '@/api/errors'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { formatDate, patientAge, todayIso } from '@/lib/format'
import { isTypingTarget } from '@/app/useGoToShortcuts'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Kbd } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { isEmptyDictation, parseDictation } from '@/features/speech/parser'
import { extractDictation } from '@/features/speech/extract'
import type { ParsedDictation } from '@/features/speech/parser'
import type {
  MedicineResponse,
  PatientResponse,
  PrescriptionDetailResponse,
  PrescriptionResponse,
} from '@/api/schema'
import { RxRowEditor } from './RxRowEditor'
import { RxPatientField, RxPatientIdentity } from './RxPatientField'
import { RxNarrativeField } from './RxNarrativeField'
import { RxMissingSummary } from './RxMissingSummary'
import { RxDictationPanel } from './RxDictationPanel'
import { RxAllergyConflictBanner, RxAllergyRecord } from './RxAllergyGate'
import { FieldLabel, ProvenanceField, ProvenanceLegend } from './Provenance'
import { applyDictation, confidentMatch, takeDictationHandoff } from './dictation'
import {
  FIELD_IDS,
  conflictSignature,
  focusField,
  issueFieldId,
  mapServerFieldErrors,
  metaFor,
  nextRowKey,
  provenanceControlClass,
  rowFieldId,
  type RowMetaMap,
} from './padState'
import {
  allergyConflicts,
  canSubmitDraft,
  draftIssues,
  entered,
  newDraft,
  newRow,
  rowFromPrevious,
  toApiRequest,
  type FieldState,
  type RxDraft,
  type RxPatient,
  type RxRow,
} from './model'

const MAX_ROWS = 50

/**
 * The prescription pad.
 *
 * This screen is the product. Everything else in the app exists to feed it or
 * to read what came out of it, so the pad is built around three commitments:
 *
 *  1. **A walk-in can be prescribed for in one control.** Searching for a
 *     patient and creating one are the same combobox; a new patient costs
 *     three fields, and the record is a side effect of prescribing rather than
 *     a prerequisite for it.
 *  2. **Nothing is invented.** A field nobody spoke and nobody typed renders
 *     visibly blank and blocks printing. The pad never substitutes a
 *     placeholder, and the reason a print is blocked is always named, specific
 *     and clickable.
 *  3. **Dictation is a source, not an author.** Everything the microphone
 *     produces is `heard`, drug names are resolved against the formulary
 *     rather than trusted, and anything the parser could not place stays on
 *     screen instead of disappearing.
 */
export function PrescriptionPadScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState<RxDraft>(() => newDraft())
  const [rowMeta, setRowMeta] = useState<RowMetaMap>({})
  const [quickAdd, setQuickAdd] = useState(false)
  const [unparsed, setUnparsed] = useState<string[]>([])
  const [transcript, setTranscript] = useState('')
  const [placing, setPlacing] = useState(false)
  const [acknowledgement, setAcknowledgement] = useState<{
    signature: string
    reason: string
  } | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  const patientIdParam = params.get('patientId')
  const dictateOnArrival = params.get('dictate') === '1'
  // `?focus=patient` is how the home screen's "Type a prescription" card asks
  // the pad to open on the one field that starts every prescription.
  const focusPatientOnArrival = params.get('focus') === 'patient'

  /* ----------------------------- draft helpers ---------------------------- */

  const setPatient = useCallback((patient: RxPatient) => {
    setDraft((d) => ({ ...d, patient }))
  }, [])

  const setField = useCallback(
    (
      key: 'diagnosis' | 'chiefComplaint' | 'advice' | 'investigations' | 'notes' | 'followUpDate',
    ) =>
      (next: FieldState<string>) =>
        setDraft((d) => ({ ...d, [key]: next })),
    [],
  )

  const updateRow = useCallback((key: string, next: RxRow) => {
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? next : r)) }))
  }, [])

  const addRow = useCallback((): string | null => {
    const key = nextRowKey()
    let added = false
    setDraft((d) => {
      if (d.rows.length >= MAX_ROWS) return d
      added = true
      return { ...d, rows: [...d.rows, newRow(key)] }
    })
    return added ? key : null
  }, [])

  const addRowAndFocus = useCallback(() => {
    const key = addRow()
    if (key) setPendingFocus(rowFieldId.medicine(key))
  }, [addRow])

  const removeRow = useCallback((key: string) => {
    setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== key) }))
    setRowMeta((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /* ------------------------------- patient -------------------------------- */

  // Arriving from a patient screen: the id is in the URL, the record is not.
  useEffect(() => {
    if (patientIdParam) {
      setDraft((d) => (d.patient.id ? d : { ...d, patient: { ...d.patient, id: patientIdParam } }))
    }
  }, [patientIdParam])

  const patientId = draft.patient.id

  const patientRecord = useQuery({
    queryKey: qk.patients.detail(patientId ?? ''),
    queryFn: () => apiGet<PatientResponse>(endpoints.patients.byId(patientId ?? '')),
    enabled: Boolean(patientId),
  })

  // The record is the authority on allergies. A search result can be stale and
  // an allergy list read from a stale row is worse than none at all.
  useEffect(() => {
    const record = patientRecord.data
    if (!record) return
    setDraft((d) => {
      if (d.patient.id !== record.id) return d
      const allergies = (record.allergies ?? []).filter(Boolean)
      const unchanged =
        d.patient.firstName === record.first_name &&
        d.patient.lastName === record.last_name &&
        d.patient.phone === record.phone &&
        d.patient.allergies.length === allergies.length &&
        d.patient.allergies.every((a, i) => a === allergies[i])
      if (unchanged) return d
      return {
        ...d,
        patient: {
          id: record.id,
          firstName: record.first_name,
          lastName: record.last_name,
          phone: record.phone,
          allergies,
        },
      }
    })
  }, [patientRecord.data])

  // Keep ?patientId= in the URL so a reload or a shared link lands correctly.
  useEffect(() => {
    if (patientId && patientId !== params.get('patientId')) {
      const next = new URLSearchParams(params)
      next.set('patientId', patientId)
      setParams(next, { replace: true })
    }
  }, [patientId, params, setParams])

  const clearPatient = useCallback(() => {
    setDraft((d) => ({
      ...d,
      patient: { id: null, firstName: '', lastName: '', phone: '', allergies: [] },
    }))
    setQuickAdd(false)
    const next = new URLSearchParams(params)
    next.delete('patientId')
    setParams(next, { replace: true })
    requestAnimationFrame(() => focusField(FIELD_IDS.patient))
  }, [params, setParams])

  /* -------------------------- continue previous --------------------------- */

  const history = useQuery({
    queryKey: qk.patients.prescriptions(patientId ?? ''),
    queryFn: () =>
      apiGet<PrescriptionResponse[]>(endpoints.patients.prescriptions(patientId ?? '')),
    enabled: Boolean(patientId),
    staleTime: 30_000,
  })

  const lastPrescription = history.data?.[0] ?? null

  const carryOverPrevious = useCallback(() => {
    if (!lastPrescription) return
    const carried = lastPrescription.items.map((item) =>
      rowFromPrevious(nextRowKey(), {
        medicine_id: item.medicine.id,
        medicine_name: item.medicine.name,
        dosage: item.dosage,
        frequency: item.frequency,
        duration_days: item.duration_days,
        quantity: item.quantity,
        instructions: item.instructions,
      }),
    )
    if (carried.length === 0) {
      toast.info('That prescription had no medicines to carry over.')
      return
    }
    setDraft((d) => ({ ...d, rows: [...d.rows, ...carried] }))
    toast.success(
      `Carried over ${carried.length} medicine${carried.length === 1 ? '' : 's'} — every field is marked "carried over" until you check it.`,
    )
  }, [lastPrescription])

  /* ------------------------------ dictation ------------------------------- */

  const resolveSpokenMedicine = useCallback(
    async (rowKey: string, spokenName: string) => {
      try {
        // Never filtered client-side: the server's trigram ranking is what
        // makes a misheard name findable in the first place.
        const results = await queryClient.fetchQuery({
          queryKey: qk.medicines.search(spokenName),
          queryFn: () =>
            apiGet<MedicineResponse[]>(endpoints.medicines.search, {
              params: { q: spokenName, limit: 8 },
            }),
          staleTime: 30_000,
        })
        const match = confidentMatch(spokenName, results)
        setRowMeta((prev) => ({
          ...prev,
          [rowKey]: { spokenName, candidates: results, resolving: false, resolved: true },
        }))
        if (match) {
          setDraft((d) => ({
            ...d,
            rows: d.rows.map((r) =>
              r.key === rowKey ? { ...r, medicineId: match.id, medicineName: match.name } : r,
            ),
          }))
        }
      } catch {
        setRowMeta((prev) => ({
          ...prev,
          [rowKey]: { spokenName, candidates: [], resolving: false, resolved: true },
        }))
      }
    },
    [queryClient],
  )

  /**
   * Fold a parse into the pad. Used by both routes in: the hand-off from the
   * speech screen, and a recording made here.
   */
  const ingestDictation = useCallback(
    (parsed: ParsedDictation) => {
      // Keys are allocated up front, outside the state updater: an updater can
      // run twice and must not have side effects.
      const keys = parsed.rows.map((row) => ({ key: nextRowKey(), spokenName: row.spokenName }))

      setDraft((d) =>
        applyDictation(
          d,
          parsed,
          keys.map((k) => k.key),
        ),
      )

      setRowMeta((prev) => {
        const next = { ...prev }
        for (const { key, spokenName } of keys) {
          next[key] = { spokenName, candidates: [], resolving: true, resolved: false }
        }
        return next
      })

      if (parsed.unparsed.length > 0) setUnparsed((prev) => [...prev, ...parsed.unparsed])

      for (const { key, spokenName } of keys) {
        if (spokenName) void resolveSpokenMedicine(key, spokenName)
      }

      if (parsed.rows.length > 0) {
        toast.info(
          `${parsed.rows.length} medicine${parsed.rows.length === 1 ? '' : 's'} from dictation — confirm each against the formulary.`,
        )
      }
    },
    [resolveSpokenMedicine],
  )

  const dictationConsumed = useRef(false)

  useEffect(() => {
    if (dictationConsumed.current) return
    dictationConsumed.current = true
    const parsed = takeDictationHandoff()
    if (parsed) ingestDictation(parsed)
  }, [ingestDictation])

  /**
   * Model-first, parser-fallback. The AI reads natural dictation ("use
   * paracetamol, patient has a severe cold") into medicines, diagnosis,
   * complaint and follow-up; the offline regex parser only understands strict
   * notation, so it is the fallback, not the primary. A model failure of any
   * kind (unconfigured, offline, refused) falls back silently: the doctor
   * still gets what the regex can manage, and loses nothing either way.
   */
  const placeTranscript = useCallback(async () => {
    const text = transcript.trim()
    if (!text || placing) return
    setPlacing(true)
    let parsed: ParsedDictation
    try {
      parsed = (await extractDictation(text)).parsed
    } catch {
      parsed = parseDictation(text)
    } finally {
      setPlacing(false)
    }
    if (isEmptyDictation(parsed) && parsed.unparsed.length === 0) {
      // Nothing structured came out of it, but the doctor still said it.
      setUnparsed((prev) => [...prev, text])
    } else {
      ingestDictation(parsed)
    }
    setTranscript('')
  }, [ingestDictation, transcript, placing])

  const fileDictationLine = useCallback(
    (line: string, destination: 'advice' | 'notes') => {
      setDraft((d) => {
        const current = d[destination]
        const merged = current.value.trim() ? `${current.value.trim()}\n${line}` : line
        // Filed by hand, so it is now the doctor's text, not the machine's.
        return { ...d, [destination]: entered(merged) }
      })
      setUnparsed((prev) => prev.filter((l) => l !== line))
    },
    [],
  )

  /* ------------------------------- allergy -------------------------------- */

  const conflicts = useMemo(
    () => allergyConflicts(draft.patient, draft.rows),
    [draft.patient, draft.rows],
  )
  const signature = conflictSignature(conflicts)
  const allergyBlocked = conflicts.length > 0 && acknowledgement?.signature !== signature

  const acknowledgeAllergy = useCallback(
    (reason: string) => {
      setAcknowledgement({ signature, reason })
      // The reason has to survive to the record. `notes` is the only field the
      // API has for it, so it goes there visibly rather than into a private
      // variable that never leaves the browser.
      setDraft((d) => {
        const heading = 'Allergy override:'
        const body = `${heading} ${reason}`
        const existing = d.notes.value.trim()
        if (existing.includes(body)) return d
        return { ...d, notes: entered(existing ? `${existing}\n${body}` : body) }
      })
    },
    [signature],
  )

  const revokeAcknowledgement = useCallback(() => setAcknowledgement(null), [])

  /* -------------------------------- issues -------------------------------- */

  const issues = useMemo(() => draftIssues(draft), [draft])
  const patientChosen = Boolean(draft.patient.id) || quickAdd
  const ready = canSubmitDraft(draft) && !allergyBlocked

  const focusFirstProblem = useCallback(() => {
    if (allergyBlocked) {
      focusField('rx-allergy-conflict')
      return
    }
    const first = issues[0]
    if (!first) return
    focusField(patientChosen ? issueFieldId(first) : FIELD_IDS.patient)
  }, [allergyBlocked, issues, patientChosen])

  /* -------------------------------- submit -------------------------------- */

  const submit = useCallback(
    async (thenPrint: boolean) => {
      if (!ready) {
        focusFirstProblem()
        return
      }
      setSubmitting(true)
      setServerErrors({})
      try {
        const created = await apiPost<PrescriptionDetailResponse>(
          endpoints.prescriptions.create,
          toApiRequest(draft),
        )

        void queryClient.invalidateQueries({ queryKey: qk.prescriptions.all() })
        void queryClient.invalidateQueries({ queryKey: qk.patients.all() })
        void queryClient.invalidateQueries({ queryKey: qk.dashboard.summary() })

        if (thenPrint) {
          // The API serves a complete A4 document; the browser prints it best
          // from its own tab, not from an iframe inside the SPA.
          window.open(
            resolveApiUrl(`${API_BASE_URL}${endpoints.prescriptions.printView(created.id)}`),
            '_blank',
            'noopener',
          )
        }
        toast.success(
          `${created.prescription_number} saved${draft.patient.id ? '' : ' — patient record created'}`,
        )
        navigate(`/prescriptions/${created.id}`, { replace: true })
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.isValidation) {
          const mapped = mapServerFieldErrors(apiError.fieldErrors(), draft)
          setServerErrors(Object.fromEntries(mapped.map((m) => [m.fieldId, m.message])))
          if (mapped[0]) focusField(mapped[0].fieldId)
        } else {
          toast.error(apiError.message)
        }
      } finally {
        setSubmitting(false)
      }
    },
    [draft, focusFirstProblem, navigate, queryClient, ready],
  )

  /* ------------------------------ shortcuts ------------------------------- */

  const shortcuts = useRef({ addRowAndFocus, submit })
  shortcuts.current = { addRowAndFocus, submit }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'Enter') {
        e.preventDefault()
        void shortcuts.current.submit(true)
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void shortcuts.current.submit(false)
        return
      }
      // Alt+Enter adds a line. ⌘Enter is reserved for submitting the form
      // (DESIGN.md §5) and must not be borrowed for anything else.
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault()
        shortcuts.current.addRowAndFocus()
        return
      }
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault()
        focusField(FIELD_IDS.patient)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const arrivalFocused = useRef(false)

  useEffect(() => {
    if (arrivalFocused.current) return
    arrivalFocused.current = true
    if (focusPatientOnArrival && !patientIdParam) {
      requestAnimationFrame(() => focusField(FIELD_IDS.patient))
    }
  }, [focusPatientOnArrival, patientIdParam])

  // Focus moves are queued so they land after the row they point at exists.
  useEffect(() => {
    if (!pendingFocus) return
    const id = pendingFocus
    setPendingFocus(null)
    requestAnimationFrame(() => focusField(id))
  }, [pendingFocus])

  const onRowEnter = useCallback(
    (index: number) => {
      const nextRow = draft.rows[index + 1]
      if (nextRow) {
        focusField(rowFieldId.medicine(nextRow.key))
        return
      }
      addRowAndFocus()
    },
    [addRowAndFocus, draft.rows],
  )

  /* -------------------------------- render -------------------------------- */

  const age = patientAge(patientRecord.data?.date_of_birth)
  const namedPatient = Boolean(
    draft.patient.id || draft.patient.firstName || draft.patient.lastName || draft.patient.phone,
  )
  /* A walk-in has no history, a failed fetch tells us nothing, and a record
     whose `allergies` is `null` has simply never been asked — all three are
     "unknown", and none of them may render as "no allergies". Only an actual
     array, empty or not, counts as an answer. */
  const allergyStatus = !draft.patient.id
    ? 'unknown'
    : patientRecord.isPending
      ? 'loading'
      : patientRecord.data?.allergies == null
        ? 'unknown'
        : 'known'

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-40 pt-6 sm:px-6 xl:max-w-none xl:px-10">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to prescriptions">
          <Link to="/prescriptions">
            <ArrowLeft aria-hidden className="size-4" />
          </Link>
        </Button>
        <h1 className="text-title font-semibold tracking-tight text-text">New prescription</h1>
        <p className="ml-auto hidden items-center gap-3 text-caption text-text-subtle sm:flex">
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> next medicine
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Alt</Kbd>
            <Kbd>Enter</Kbd> add one
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd> save &amp; print
          </span>
        </p>
      </header>

      {/*
        Below `xl` the column wrappers are `display: contents`, so every card is
        a direct flex item of this container and the explicit `order-N`s
        reproduce today's single-column reading order exactly. From `xl` up the
        wrappers become real columns — patient and narrative on the left,
        medicines and dictation on the right — so a laptop sees the whole pad
        with far less scrolling.
      */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(360px,1fr)_1.6fr] xl:items-start xl:gap-6">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          {/* ---------------------------- patient ---------------------------- */}
          <Card className="order-1">
            <CardBody className="flex flex-col gap-3">
          <RxPatientField
            patient={draft.patient}
            onChange={setPatient}
            quickAdd={quickAdd}
            onQuickAddChange={setQuickAdd}
            errors={serverErrors}
          />

          {namedPatient && (
            <RxPatientIdentity
              patient={draft.patient}
              age={age}
              gender={patientRecord.data?.gender}
              onClear={clearPatient}
            />
          )}

          {namedPatient && <RxAllergyRecord patient={draft.patient} status={allergyStatus} />}
            </CardBody>
          </Card>

          {/* --------------------------- clinical ---------------------------- */}
          <Card className="order-2">
            <CardBody className="grid gap-4 sm:grid-cols-2">
          <RxNarrativeField
            id={FIELD_IDS.diagnosis}
            label="Diagnosis"
            labelHint="What you have concluded is wrong, for example osteoarthritis of the right knee. Printed on the prescription."
            field={draft.diagnosis}
            onChange={setField('diagnosis')}
            maxLength={512}
            error={serverErrors[FIELD_IDS.diagnosis]}
            className="sm:col-span-2"
          />
          <RxNarrativeField
            id={FIELD_IDS.chiefComplaint}
            label="Chief complaint"
            labelHint="What the patient came in complaining of, in their words. Printed on the prescription."
            field={draft.chiefComplaint}
            onChange={setField('chiefComplaint')}
            maxLength={512}
            error={serverErrors[FIELD_IDS.chiefComplaint]}
          />
          <div className="flex min-w-0 flex-col">
            <FieldLabel
              htmlFor={FIELD_IDS.followUp}
              provenance={draft.followUpDate.provenance}
              hint="When the patient should come back for review. Printed on the prescription."
            >
              Follow-up date
            </FieldLabel>
            <ProvenanceField provenance={draft.followUpDate.provenance}>
              <Input
                id={FIELD_IDS.followUp}
                type="date"
                min={todayIso()}
                value={draft.followUpDate.value}
                invalid={Boolean(serverErrors[FIELD_IDS.followUp])}
                className={provenanceControlClass(draft.followUpDate.provenance)}
                onChange={(e) => setField('followUpDate')(entered(e.target.value))}
              />
            </ProvenanceField>
          </div>
        </CardBody>
          </Card>

          {/* ---------------------------- advice ----------------------------- */}
          <Card className="order-5">
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <RxNarrativeField
                id={FIELD_IDS.advice}
                label="Advice to the patient"
                labelHint="Non-medicine guidance, one instruction per line, for example avoid squatting. Printed on the prescription."
                hint="Printed. One instruction per line."
                field={draft.advice}
                onChange={setField('advice')}
                rows={4}
                maxLength={4000}
                error={serverErrors[FIELD_IDS.advice]}
              />
              <RxNarrativeField
                id={FIELD_IDS.investigations}
                label="Investigations"
                labelHint="Tests to order, for example an X-ray or blood work. Saved with the prescription notes."
                hint="No backend field yet — saved under a heading in the notes."
                field={draft.investigations}
                onChange={setField('investigations')}
                rows={4}
                maxLength={2000}
              />
              <RxNarrativeField
                id={FIELD_IDS.notes}
                label="Internal notes"
                labelHint="Private notes for your own record. Never printed, never shown to the patient."
                hint="Not printed."
                field={draft.notes}
                onChange={setField('notes')}
                rows={3}
                maxLength={4000}
                error={serverErrors[FIELD_IDS.notes]}
                className="sm:col-span-2"
              />
            </CardBody>
          </Card>

          <p className="order-7 flex items-start gap-2 px-1 text-caption text-text-subtle">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Prescriptions are append-only. Once this is saved it cannot be edited or deleted — a
            correction is a new prescription, written from this pad and printed over the old one.
          </p>
        </div>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          {/* The allergy banner sits directly above the medicines, because it
              has to be read before anything is chosen, not after. */}
          <div id="rx-allergy-conflict" tabIndex={-1} className="order-3 empty:hidden">
        <RxAllergyConflictBanner
          conflicts={conflicts}
          acknowledgedReason={acknowledgement?.signature === signature ? acknowledgement.reason : null}
          onAcknowledge={acknowledgeAllergy}
          onRevoke={revokeAcknowledgement}
          onFocusRow={(rowKey) => focusField(rowFieldId.medicine(rowKey))}
        />
          </div>

          {/* -------------------------- medicines ---------------------------- */}
          <Card className="order-4">
        <CardHeader
          title="Medicines"
          description={
            draft.rows.length === 0
              ? 'Nothing prescribed yet.'
              : `${draft.rows.filter((r) => r.medicineId).length} of ${draft.rows.length} matched · maximum ${MAX_ROWS}`
          }
          action={
            <div className="flex items-center gap-2">
              {lastPrescription && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={carryOverPrevious}
                  iconLeft={<History className="size-4" />}
                >
                  Continue previous
                  <span className="text-text-subtle">
                    ({lastPrescription.items.length} · {formatDate(lastPrescription.created_at)})
                  </span>
                </Button>
              )}
              <Button
                id={FIELD_IDS.addMedicine}
                variant="secondary"
                size="sm"
                onClick={addRowAndFocus}
                iconLeft={<Plus className="size-4" />}
                disabled={draft.rows.length >= MAX_ROWS}
              >
                Add medicine
              </Button>
            </div>
          }
        />
        <CardBody className="flex flex-col gap-3">
          <ProvenanceLegend />

          {draft.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-provenance-blank px-4 py-8 text-center">
              <p className="text-body text-text">No medicines on this prescription.</p>
              <p className="mt-1 text-caption text-text-muted">
                Add one, dictate them, or carry over the last visit&rsquo;s.
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={addRowAndFocus}>
                Add the first medicine
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {draft.rows.map((row, index) => (
                <RxRowEditor
                  key={row.key}
                  row={row}
                  index={index}
                  meta={metaFor(rowMeta, row.key)}
                  allergies={draft.patient.allergies}
                  errors={serverErrors}
                  canRemove
                  onChange={(next) => updateRow(row.key, next)}
                  onRemove={() => removeRow(row.key)}
                  onEnter={() => onRowEnter(index)}
                />
              ))}
            </ul>
          )}
        </CardBody>
          </Card>

          {/* -------------------------- dictation ---------------------------- */}
          <div className="order-6">
            <RxDictationPanel
              transcript={transcript}
              placing={placing}
              lines={unparsed}
              autoStart={dictateOnArrival}
              onCapture={(text) => {
                const chunk = text.trim()
                if (chunk) setTranscript((prev) => (prev ? `${prev} ${chunk}` : chunk))
              }}
              onPlace={placeTranscript}
              onClearTranscript={() => setTranscript('')}
              onFile={fileDictationLine}
              onDiscard={(index) => setUnparsed((prev) => prev.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      </div>

      {/* ---------------------------- action bar ---------------------------- */}
      <div
        data-print-hide
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/85 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 xl:max-w-none xl:px-10">
          <div className="min-w-0 flex-1">
            <RxMissingSummary
              issues={issues}
              draft={draft}
              allergyBlocked={allergyBlocked}
              patientChosen={patientChosen}
              onFocus={focusField}
              onResolveAllergy={() => focusField('rx-allergy-conflict')}
            />
          </div>

          <Button
            variant="secondary"
            onClick={() => void submit(false)}
            loading={submitting}
            iconLeft={<Save className="size-4" />}
          >
            Save
          </Button>

          <Button
            variant="primary"
            onClick={() => void submit(true)}
            loading={submitting}
            iconLeft={<Printer className="size-4" />}
            aria-describedby={ready ? undefined : 'rx-blocked-hint'}
            className={cn(!ready && 'opacity-60')}
          >
            Save &amp; print
          </Button>
          {!ready && (
            <span id="rx-blocked-hint" className="sr-only">
              Blocked: fill in everything listed as still needed.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

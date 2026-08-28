import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Eye, History, Lock, Plus, Printer, Save } from 'lucide-react'
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
import { DialogRoot, DrawerContent } from '@/components/ui/Dialog'
// DICTATION-PANEL: import { isEmptyDictation, parseDictation } from '@/features/speech/parser'
// DICTATION-PANEL: import { extractDictation } from '@/features/speech/extract'
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
import { RxAdvicePicker } from './RxAdvicePicker'
import { applyMedicineDefaults, forgetAppliedDefaults } from './medicineDefaults'
import { RxMissingSummary } from './RxMissingSummary'
// DICTATION-PANEL: import { RxDictationPanel } from './RxDictationPanel'
import { RxLivePreview } from './RxLivePreview'
import { RxAllergyConflictBanner, RxAllergyRecord } from './RxAllergyGate'
import { FieldLabel, ProvenanceField, ProvenanceLegend, TAP_ICON, TAP_TARGET } from './Provenance'
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
type VitalKey = 'vitalsBp' | 'vitalsSpo2' | 'vitalsPulse' | 'vitalsWeight'

/**
 * The four figures he writes in the top-right corner of the paper pad, in his
 * own order. Free text rather than numbers: a blood pressure is `120/80`, and
 * he may qualify a reading. Parsing could only lose information.
 */
const VITALS: {
  key: VitalKey
  id: string
  label: string
  hint: string
  inputMode: 'text' | 'numeric' | 'decimal'
  /** Mirrors the API column width, so a long qualifier is stopped here, not by a 422. */
  maxLength?: number
}[] = [
  { key: 'vitalsBp', id: FIELD_IDS.vitalsBp, label: 'BP', hint: 'Blood pressure as you write it, for example 120/80. Qualifiers are fine — "140/90 (right arm)".', inputMode: 'text', maxLength: 32 },
  { key: 'vitalsSpo2', id: FIELD_IDS.vitalsSpo2, label: 'SpO₂', hint: 'Oxygen saturation, per cent.', inputMode: 'numeric' },
  { key: 'vitalsPulse', id: FIELD_IDS.vitalsPulse, label: 'HR', hint: 'Heart rate, beats per minute.', inputMode: 'numeric' },
  { key: 'vitalsWeight', id: FIELD_IDS.vitalsWeight, label: 'Weight', hint: 'Weight in kilograms.', inputMode: 'decimal' },
]

export function PrescriptionPadScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState<RxDraft>(() => newDraft())
  const [rowMeta, setRowMeta] = useState<RowMetaMap>({})
  const [quickAdd, setQuickAdd] = useState(false)
  /* The value is unread with the dictation panel commented out, but the
     setter is not: `ingestDictation` still files unparsed lines here when a
     dictation arrives from the /speech hand-off. */
  const [, setUnparsed] = useState<string[]>([])
  // DICTATION-PANEL: const [transcript, setTranscript] = useState('')
  // DICTATION-PANEL: const [placing, setPlacing] = useState(false)
  const [acknowledgement, setAcknowledgement] = useState<{
    signature: string
    reason: string
  } | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  /* How much room the fixed action bar is taking, so the column beneath it can
     give exactly that much back.

     The bar's height is not a constant on a narrow screen: what is in it is
     the list of everything still blocking the print, and that is one line on a
     finished draft and five rows on a freshly opened one. The pad used to
     reserve a flat 10rem, which was right for the single-row laptop bar and
     left the last medicine sitting behind a 272px bar at 390px. Measuring is
     the only version of this that is correct in every state; from 1400px the
     columns scroll inside the shell and carry their own padding instead. */
  const [barHeight, setBarHeight] = useState(0)
  const barObserver = useRef<ResizeObserver | null>(null)
  const barRef = useCallback((node: HTMLDivElement | null) => {
    barObserver.current?.disconnect()
    if (!node) return
    barObserver.current = new ResizeObserver(() => setBarHeight(node.offsetHeight))
    barObserver.current.observe(node)
  }, [])
  useEffect(() => () => barObserver.current?.disconnect(), [])

  const patientIdParam = params.get('patientId')
  // DICTATION-PANEL: const dictateOnArrival = params.get('dictate') === '1'
  // `?focus=patient` is how the home screen's "Type a prescription" card asks
  // the pad to open on the one field that starts every prescription.
  const focusPatientOnArrival = params.get('focus') === 'patient'

  /* ----------------------------- draft helpers ---------------------------- */

  const setPatient = useCallback((patient: RxPatient) => {
    setDraft((d) => ({ ...d, patient }))
  }, [])

  const setField = useCallback(
    (
      key:
        | 'diagnosis'
        | 'chiefComplaint'
        | 'advice'
        | 'investigations'
        | 'notes'
        | 'followUpDate'
        | 'procedure'
        | 'consult'
        | VitalKey,
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
    forgetAppliedDefaults(key)
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
          // The confident match is a full formulary record, so its
          // prescription defaults ride along — filling only what dictation
          // left blank, marked `defaulted` for the doctor to verify.
          setDraft((d) => ({
            ...d,
            rows: d.rows.map((r) => (r.key === rowKey ? applyMedicineDefaults(r, match) : r)),
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
  // DICTATION-PANEL: the panel was the only caller.
  // const placeTranscript = useCallback(async () => {
    // const text = transcript.trim()
    // if (!text || placing) return
    // setPlacing(true)
    // let parsed: ParsedDictation
    // try {
      // parsed = (await extractDictation(text)).parsed
    // } catch {
      // parsed = parseDictation(text)
    // } finally {
      // setPlacing(false)
    // }
    // if (isEmptyDictation(parsed) && parsed.unparsed.length === 0) {
      // // Nothing structured came out of it, but the doctor still said it.
      // setUnparsed((prev) => [...prev, text])
    // } else {
      // ingestDictation(parsed)
    // }
    // setTranscript('')
  // }, [ingestDictation, transcript, placing])

  // DICTATION-PANEL: only the dictation panel filed lines into advice/notes.
  // const fileDictationLine = useCallback(
    // (line: string, destination: 'advice' | 'notes') => {
      // setDraft((d) => {
        // const current = d[destination]
        // const merged = current.value.trim() ? `${current.value.trim()}\n${line}` : line
        // // Filed by hand, so it is now the doctor's text, not the machine's.
        // return { ...d, [destination]: entered(merged) }
      // })
      // setUnparsed((prev) => prev.filter((l) => l !== line))
    // },
    // [],
  // )

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
    /* From 1400px the page itself stops scrolling: the shell is exactly one
       viewport tall and the form column scrolls inside it, so the preview
       stays put instead of sliding away as he fills the pad. Below that the
       pad is a single column and the ordinary page scroll is correct. */
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-6 sm:px-6 xl:max-w-none xl:px-10 min-[1400px]:h-full min-[1400px]:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 min-[1400px]:shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          asChild
          className={TAP_ICON}
          aria-label="Back to prescriptions"
        >
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
        Below 1400px the column wrappers are `display: contents`, so every card is
        a direct flex item of this container and the explicit `order-N`s carry
        the single-column reading order: patient, clinical, advice, allergy,
        medicines, dictation, notice. Medicines come AFTER the narrative form —
        what is wrong is established before what is prescribed for it.

        From 1400px up the wrappers become real columns: the entire form on the
        left, and on the right the live preview of the printed page.
      */}
      <div className="flex flex-col gap-4 min-[1400px]:grid min-[1400px]:min-h-0 min-[1400px]:flex-1 min-[1400px]:grid-cols-[minmax(440px,1fr)_1.15fr] min-[1400px]:items-stretch min-[1400px]:gap-6">
        <div className="contents min-[1400px]:no-scrollbar min-[1400px]:flex min-[1400px]:min-h-0 min-[1400px]:min-w-0 min-[1400px]:flex-col min-[1400px]:gap-4 min-[1400px]:overflow-y-auto min-[1400px]:pb-28">
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

              {/* Vitals — the top-right corner of the paper pad, kept on the
                  patient card because that is where he reads them from. */}
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
                {VITALS.map((vital) => (
                  <div key={vital.key} className="flex min-w-0 flex-col">
                    <FieldLabel
                      htmlFor={vital.id}
                      provenance={draft[vital.key].provenance}
                      hint={vital.hint}
                    >
                      {vital.label}
                    </FieldLabel>
                    <ProvenanceField provenance={draft[vital.key].provenance}>
                      <Input
                        id={vital.id}
                        inputMode={vital.inputMode}
                        maxLength={vital.maxLength}
                        placeholder="—"
                        value={draft[vital.key].value}
                        className={cn(TAP_TARGET, provenanceControlClass(draft[vital.key].provenance))}
                        onChange={(e) => setField(vital.key)(entered(e.target.value))}
                      />
                    </ProvenanceField>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* --------------------------- clinical ---------------------------- */}
          <Card className="order-2">
            <CardBody className="grid gap-4 sm:grid-cols-2">
          {/* Complaint before diagnosis: the consultation records what the
              patient says first, then what the doctor concludes. */}
          <RxNarrativeField
            id={FIELD_IDS.chiefComplaint}
            label="Chief complaint"
            labelHint="What the patient came in complaining of, in their words. Printed on the prescription."
            field={draft.chiefComplaint}
            onChange={setField('chiefComplaint')}
            maxLength={512}
            error={serverErrors[FIELD_IDS.chiefComplaint]}
            className="sm:col-span-2"
          />
          <RxNarrativeField
            id={FIELD_IDS.diagnosis}
            label="Diagnosis"
            labelHint="What you have concluded is wrong, for example osteoarthritis of the right knee. Printed on the prescription."
            field={draft.diagnosis}
            onChange={setField('diagnosis')}
            maxLength={512}
            error={serverErrors[FIELD_IDS.diagnosis]}
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
                className={cn(TAP_TARGET, provenanceControlClass(draft.followUpDate.provenance))}
                onChange={(e) => setField('followUpDate')(entered(e.target.value))}
              />
            </ProvenanceField>
          </div>
        </CardBody>
          </Card>

          {/* ---------------------------- advice ----------------------------- */}
          <Card className="order-3">
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-3">
                {/* One tap per line of advice. Renders nothing until the
                    backend serves the library, so the field below stands
                    alone exactly as before. */}
                <RxAdvicePicker field={draft.advice} onChange={setField('advice')} />
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
              </div>
              <RxNarrativeField
                id={FIELD_IDS.investigations}
                label="Investigations"
                labelHint="Tests to order, for example an X-ray or blood work. Saved with the prescription notes."
                hint="Printed under Investigations."
                field={draft.investigations}
                onChange={setField('investigations')}
                rows={4}
                maxLength={2000}
              />
              <RxNarrativeField
                id={FIELD_IDS.procedure}
                label="Procedure"
                labelHint="Any procedure done at this visit. Routinely NA."
                hint="Printed under Procedure."
                field={draft.procedure}
                onChange={setField('procedure')}
                rows={2}
                maxLength={2000}
              />
              <RxNarrativeField
                id={FIELD_IDS.consult}
                label="Consult"
                labelHint="The consult line from the paper pad."
                hint="Printed under Consult."
                field={draft.consult}
                onChange={setField('consult')}
                rows={2}
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

          {/* The allergy banner sits directly above the medicines, because it
              has to be read before anything is chosen, not after. */}
          <div id="rx-allergy-conflict" tabIndex={-1} className="order-4 empty:hidden">
        <RxAllergyConflictBanner
          conflicts={conflicts}
          acknowledgedReason={acknowledgement?.signature === signature ? acknowledgement.reason : null}
          onAcknowledge={acknowledgeAllergy}
          onRevoke={revokeAcknowledgement}
          onFocusRow={(rowKey) => focusField(rowFieldId.medicine(rowKey))}
        />
          </div>

          {/* -------------------------- medicines ---------------------------- */}
          <Card className="order-5">
        <CardHeader
          title="Medicines"
          description={
            draft.rows.length === 0
              ? 'Nothing prescribed yet.'
              : `${draft.rows.filter((r) => r.medicineId).length} of ${draft.rows.length} matched · maximum ${MAX_ROWS}`
          }
          action={
            /* `CardHeader` wraps its action onto a second line but keeps it
               `shrink-0`, so a non-wrapping pair of buttons sets the card's
               min-content width and pushes the page sideways — 418px of
               content in a 320px viewport, which is exactly what these two
               were doing. Capping the group against the viewport is what
               gives `flex-wrap` below something to wrap at: max-width clamps
               a flex item's intrinsic contribution, `shrink-0` does not stop
               it. 6rem covers the page and card gutters either side with
               room for a classic scrollbar. */
            <div className="flex max-w-[calc(100vw-6rem)] flex-wrap items-center gap-2 sm:max-w-none">
              {lastPrescription && (
                <Button
                  variant="primary"
                  size="sm"
                  className={TAP_TARGET}
                  onClick={carryOverPrevious}
                  iconLeft={<History className="size-4" />}
                >
                  Continue previous
                  {/* Which prescription, and when — worth the width on a
                      laptop, and the first thing to go on a phone, where the
                      button itself is already the whole idea. */}
                  <span className="hidden text-text-subtle sm:inline">
                    ({lastPrescription.items.length} · {formatDate(lastPrescription.created_at)})
                  </span>
                </Button>
              )}
              <Button
                id={FIELD_IDS.addMedicine}
                variant="primary"
                size="sm"
                className={TAP_TARGET}
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
              <Button
                variant="primary"
                size="sm"
                className={cn(TAP_TARGET, 'mt-3')}
                onClick={addRowAndFocus}
              >
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
          {/* Dictation panel — commented out on request. The `/speech`
              hand-off still works: `takeDictationHandoff()` is consumed in an
              effect above and fills the pad from a dictation started there.
              Restore by uncommenting this block and the symbols marked
              DICTATION-PANEL below.

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
          */}
          <p className="order-7 flex items-start gap-2 px-1 text-caption text-text-subtle">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Prescriptions are append-only. Once this is saved it cannot be edited or deleted — a
            correction is a new prescription, written from this pad and printed over the old one.
          </p>

          {/* Reserves the fixed action bar's measured height. `order-8` because
              every card in this column is explicitly ordered and an unordered
              child would sort to the front. */}
          <div
            aria-hidden
            style={{ height: barHeight }}
            className="order-8 shrink-0 min-[1400px]:hidden"
          />
        </div>

        <div className="contents min-[1400px]:flex min-[1400px]:min-h-0 min-[1400px]:min-w-0 min-[1400px]:flex-col min-[1400px]:gap-4 min-[1400px]:overflow-hidden min-[1400px]:pb-28">
          {/* Live preview — Overleaf's PDF pane, minus the compile step: it
              reads `draft` straight out of React state, so it redraws as he
              types. Laptop only; below 1400px there is no room beside the form
              and the pad is a single column — see the "Preview" button in the
              action bar, which is where the page goes on a narrow screen. */}
          {/* Fills the column: the A4 page scrolls inside the iframe, so the
              pane is exactly as tall as the viewport allows and never itself
              scrolls. `min-h-0` is what lets a flex child shrink below its
              content height — without it the iframe collapses to its intrinsic
              size and the page is cut off under the letterhead. */}
          <div className="hidden min-[1400px]:flex min-[1400px]:min-h-0 min-[1400px]:flex-1 min-[1400px]:flex-col">
            <RxLivePreview draft={draft} />
          </div>
        </div>
      </div>

      {/* ---------------------------- action bar ---------------------------- */}
      <div
        ref={barRef}
        data-print-hide
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/85 backdrop-blur-md"
      >
        {/* One row on a laptop, exactly as before. On a phone the blockers
            get the full width — squeezed into a 120px column beside three
            buttons they were unreadable, and they are the reason the bar
            exists — and the buttons take the row below. `sm:contents` is what
            dissolves the mobile button group again above `sm`, so the desktop
            bar is the same flex row it always was. */}
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:px-6 xl:max-w-none xl:px-10">
          <div className="min-w-0 sm:flex-1">
            <RxMissingSummary
              issues={issues}
              draft={draft}
              allergyBlocked={allergyBlocked}
              patientChosen={patientChosen}
              onFocus={focusField}
              onResolveAllergy={() => focusField('rx-allergy-conflict')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:contents">
            {/* The preview's narrow-screen home. Hidden from 1400px up, where
                the page is already sitting open beside the form.

                "Preview prescription", not "Preview": in a bar that also says
                Save and Save & print, a bare verb leaves the doctor to work out
                what is being previewed. It is the widest label in the row and
                that is the correct trade. */}
            <Button
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
              iconLeft={<Eye className="size-4" />}
              className={cn(TAP_TARGET, 'basis-full sm:flex-none min-[1400px]:hidden')}
            >
              Preview prescription
            </Button>

            <Button
              variant="secondary"
              onClick={() => void submit(false)}
              loading={submitting}
              iconLeft={<Save className="size-4" />}
              className={cn(TAP_TARGET, 'flex-1 basis-24 sm:flex-none')}
            >
              Save
            </Button>

            <Button
              variant="primary"
              onClick={() => void submit(true)}
              loading={submitting}
              iconLeft={<Printer className="size-4" />}
              aria-describedby={ready ? undefined : 'rx-blocked-hint'}
              className={cn(TAP_TARGET, 'flex-1 basis-40 sm:flex-none', !ready && 'opacity-60')}
            >
              Save &amp; print
            </Button>
          </div>
          {!ready && (
            <span id="rx-blocked-hint" className="sr-only">
              Blocked: fill in everything listed as still needed.
            </span>
          )}
        </div>
      </div>

      {/*
        The preview, on a screen with no room beside the form.

        An A4 page is 794px wide and the pad's form column is not compressible
        much below 380 — there is no viewport under about 1400px where both
        fit, which is why the pane is `hidden` below that breakpoint. The
        question was only ever what replaces it, and the two candidates were a
        Write/Preview segmented switch and an explicit control that opens the
        page over the pad. This is the second one, for three reasons:

         1. **The preview is a check, not a companion.** Beside the form it is
            free — it costs no attention and no gesture, so it can be
            continuous. On a phone it costs the whole screen, and something
            that costs the whole screen should be asked for. Once. Just before
            printing. That is a button, not a mode.
         2. **A mode strands you.** The form is ~2500px tall on a phone. A tab
            that swaps the form out for the page has to put the doctor back
            where he was when he swaps back, and the one thing the action bar
            does — name a missing field and jump to it — cannot work while the
            fields are not rendered. The drawer closes on Escape or a tap
            outside and the form is still exactly where he left it, still
            scrolled to the same row.
         3. **It costs no permanent chrome.** A segmented switch is a strip of
            the screen given up on every screen forever, on the device with the
            least screen to give. The button lives in a bar that was already
            there, next to Save & print, which is precisely when a doctor wants
            to look at the page.

        A bottom DRAWER at 80% of the viewport rather than a centred dialog.
        The remaining 20% is not wasted space — it is the pad still visible
        behind the page, which is what makes this read as "look at it" rather
        than "you have left the form". It also puts the whole page within reach
        of the thumb that opened it, and `dvh` rather than `vh` so the bottom
        edge does not slide under a phone's address bar when that bar is up.

        `zoomable` because fit-to-width lands near 40% at this size: enough to
        see the shape of the page, not enough to read a dose off it, so the
        drawer also offers true A4 and lets the doctor pan.
      */}
      <DialogRoot open={previewOpen} onOpenChange={setPreviewOpen}>
        <DrawerContent
          title="Prescription preview"
          description="Live from the pad. Nothing is saved yet."
        >
          <div className="h-full">
            <RxLivePreview draft={draft} zoomable />
          </div>
        </DrawerContent>
      </DialogRoot>
    </div>
  )
}

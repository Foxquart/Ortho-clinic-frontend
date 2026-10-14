/**
 * `/patients/:patientId` — a returning patient, readable in one glance.
 *
 * Top to bottom: who they are (name, age·sex, phone), the allergy banner, the
 * last vitals, and the two things a doctor does next — repeat the last
 * prescription, or write a new one. Below that, the visit timeline.
 *
 * `GET /patients/{id}/summary` answers the whole screen in one round trip: the
 * full patient, their complete prescription and appointment history, and the
 * last visit date. Its prescription entries carry an `items_count` but not the
 * medicines, and "what did I put her on last time" is the single most useful
 * thing this page can answer — so `GET /patients/{id}/prescriptions` is fetched
 * alongside and merged in. The rows paint from the summary immediately and
 * gain their medicine line (and the last vitals, which live on the
 * prescription) when the second call lands; nothing waits on it.
 *
 * "Repeat last prescription" is a link to the pad with `?from=<rxId>`; the pad
 * does the copying (see `applyPrevious`), and never copies vitals.
 *
 * There is no DELETE for patients (the API has four DELETE routes and none of
 * them is this one). Deactivation is real, though: `PATCH` with
 * `is_active: false`, which is what `PatientUpdateRequest` exists for.
 */

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Ellipsis,
  FileText,
  Pencil,
  Pill,
  Plus,
  Repeat2,
  RotateCcw,
  UserMinus,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import {
  formatDate,
  formatRelativeDay,
  formatTime,
  fullName,
  humanizeEnum,
  patientAge,
} from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import type { JsonObject, PrescriptionResponse } from '@/api/schema'
import type { PatientSummaryPrescription } from '@/api/derived'
import { cleanAllergies, usePatientPrescriptions, usePatientSummary, useUpdatePatient } from './api'
import { AllergyBanner } from './AllergyDisplay'
import { PatientAvatar } from './PatientAvatar'
import { PatientFormSheet } from './PatientFormSheet'
import { relativeDay } from './relativeDay'
import { readVitals, type Vitals } from './vitals'

const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: 'info',
  confirmed: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

/** Both history lists come back complete. Long histories get a tail, not a wall. */
const APPOINTMENTS_SHOWN = 6

/* -------------------------------------------------------------------------- */
/* Small parts                                                                */
/* -------------------------------------------------------------------------- */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="text-body text-text mt-0.5 truncate">{children}</dd>
    </div>
  )
}

/**
 * `medical_history` and `emergency_contact` are `additionalProperties: true` —
 * the schema models nothing inside them. Rather than invent a shape, the flat
 * primitive entries are shown as they are and anything nested is skipped.
 */
function jsonFacts(value: JsonObject | null | undefined): [string, string][] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => [humanizeEnum(k), String(v)] as [string, string])
    .filter(([, v]) => v.trim().length > 0)
}

/** `Etoricoxib 90mg · Pantoprazole 40mg · +2 more` */
function medicineLine(prescription: PrescriptionResponse): string {
  const names = prescription.items.map((item) =>
    [item.medicine.name, item.medicine.strength].filter(Boolean).join(' '),
  )
  if (names.length <= 3) return names.join(' · ')
  return `${names.slice(0, 3).join(' · ')} · +${names.length - 3} more`
}

/* ------------------------------ last vitals ------------------------------- */

/** Vitals are per-visit columns on the prescription; `schema.ts` does not model them yet. */
type RxVitals = {
  vitals_bp?: string | null
  vitals_spo2?: number | null
  vitals_pulse_bpm?: number | null
  vitals_weight_kg?: number | string | null
}

function vitalPairs(
  bp: string | null | undefined,
  weight: number | string | null | undefined,
  spo2: number | null | undefined,
  pulse: number | null | undefined,
): [string, string][] {
  const out: [string, string][] = []
  if (bp) out.push(['BP', bp])
  if (weight != null && weight !== '') out.push(['Wt', `${Number(weight)} kg`])
  if (spo2 != null) out.push(['SpO₂', `${spo2}%`])
  if (pulse != null) out.push(['HR', `${pulse}`])
  return out
}

/**
 * The most recent measurements: from the latest visit that took any, else the
 * ones saved on the patient record. `rxs` is newest first.
 */
function lastVitals(rxs: PrescriptionResponse[], record: Vitals) {
  for (const rx of rxs) {
    const v = rx as PrescriptionResponse & RxVitals
    const pairs = vitalPairs(v.vitals_bp, v.vitals_weight_kg, v.vitals_spo2, v.vitals_pulse_bpm)
    if (pairs.length > 0) return { pairs, on: rx.created_at, fromVisit: true }
  }
  const pairs = vitalPairs(record.bp, record.weight_kg, record.spo2, record.pulse_bpm)
  return pairs.length > 0 ? { pairs, on: record.recorded_at ?? null, fromVisit: false } : null
}

/* ------------------------------ visit timeline ---------------------------- */

function VisitRow({
  entry,
  detail,
  latest,
  last,
}: {
  entry: PatientSummaryPrescription
  detail: PrescriptionResponse | undefined
  latest: boolean
  last: boolean
}) {
  const ago = relativeDay(entry.created_at)
  const count = `${entry.items_count} ${entry.items_count === 1 ? 'medicine' : 'medicines'}`

  return (
    <li className="flex gap-2 pr-2 pl-4 sm:gap-3">
      {/* The rail. The dot sits on the first line; the line runs on to the next
          row's dot, so the list reads as one continuous history. */}
      <div aria-hidden className="relative w-3 shrink-0">
        <span
          className={cn(
            'ring-surface absolute top-[1.15rem] left-1/2 size-2.5 -translate-x-1/2 rounded-full ring-4',
            latest ? 'bg-accent' : 'bg-border-strong',
          )}
        />
        {!last && <span className="bg-border absolute inset-y-0 top-[1.9rem] left-1/2 w-px" />}
      </div>

      <Link
        to={`/prescriptions/${entry.id}`}
        className={cn(
          'group min-h-tap -my-px flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-3',
          'duration-fast ease-standard transition-colors',
          'hover:bg-surface-hover focus-visible:bg-surface-hover',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-numeric>
            {ago && (
              <>
                <span lang="bn" className="text-body text-text font-semibold">
                  {ago.bn}
                </span>
                <span className="text-caption text-text-muted">{ago.en}</span>
              </>
            )}
            <span className="text-caption text-text-subtle">{formatDate(entry.created_at)}</span>
            {latest && <Badge tone="accent">Latest</Badge>}
          </p>
          <p className="text-body text-text mt-1 [text-wrap:pretty]">
            {entry.diagnosis || <span className="text-text-subtle">No diagnosis recorded</span>}
          </p>
          <p className="text-label text-text-muted mt-0.5 flex min-w-0 items-center gap-1.5">
            <Pill aria-hidden className="text-text-subtle size-3.5 shrink-0" />
            <span className="shrink-0">{count}</span>
            {detail && <span className="text-text-subtle truncate">· {medicineLine(detail)}</span>}
          </p>
        </div>

        <span className="text-label text-text-subtle duration-fast group-hover:text-text flex shrink-0 items-center gap-0.5 self-center transition-colors">
          <span className="hidden sm:inline">Open</span>
          <ChevronRight aria-hidden className="size-5" />
        </span>
      </Link>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export function PatientDetailScreen() {
  const { patientId = '' } = useParams<{ patientId: string }>()
  const { can } = useAuth()
  const canWrite = can('patient.write')
  const canPrescribe = can('prescription.write')

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const summary = usePatientSummary(patientId)
  const history = usePatientPrescriptions(patientId)
  const update = useUpdatePatient(patientId)

  const patient = summary.data?.patient
  const appointments = summary.data?.appointments ?? []

  /* Newest first, whatever order the API happened to send. */
  const prescriptions = useMemo(
    () =>
      [...(summary.data?.prescriptions ?? [])].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [summary.data?.prescriptions],
  )
  const latest = prescriptions[0]

  /* The summary knows WHICH prescriptions exist; the dedicated route knows
     what is in them. Keyed by id so the merge cannot mis-pair them. */
  const detailById = useMemo(() => {
    const map = new Map<string, PrescriptionResponse>()
    for (const item of history.data ?? []) map.set(item.id, item)
    return map
  }, [history.data])

  const name = patient ? fullName(patient.first_name, patient.last_name) : ''
  const age = patientAge(patient?.date_of_birth)
  const allergyCount = cleanAllergies(patient?.allergies).length
  const vitals = useMemo(
    () =>
      lastVitals(
        [...(history.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        readVitals(patient?.medical_history),
      ),
    [history.data, patient?.medical_history],
  )
  const lastVisit = relativeDay(summary.data?.last_visit_date ?? latest?.created_at)

  function setActive(isActive: boolean) {
    update.mutate(
      { is_active: isActive },
      {
        onSuccess: () => {
          setConfirmDeactivate(false)
          toast.success(isActive ? 'Patient reactivated' : 'Patient deactivated')
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  if (summary.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <Link
          to="/patients"
          className="text-label text-text-muted hover:text-text inline-flex items-center gap-1.5 py-1"
        >
          <ArrowLeft aria-hidden className="size-4" />
          All patients
        </Link>
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <Link
        to="/patients"
        className="text-label text-text-muted duration-fast hover:text-text inline-flex w-fit items-center gap-1.5 py-1 transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All patients
      </Link>

      {/* Identity, allergies, last vitals, next step — one block, one glance.
          The allergy banner is its own solid strip directly under the card
          rather than a row inside it: it must never read as just another fact. */}
      <section aria-label="Patient" className="flex flex-col gap-2">
        <Card>
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              {patient && <PatientAvatar name={name} gender={patient.gender} size="lg" />}
              <div className="min-w-0">
                {summary.isPending ? (
                  <>
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="mt-2 h-3 w-48" />
                  </>
                ) : (
                  patient && (
                    <>
                      <h1 className="text-title text-text flex flex-wrap items-center gap-x-2.5 gap-y-1 [text-wrap:balance]">
                        <span className="min-w-0 break-words">{name}</span>
                        {!patient.is_active && <Badge tone="neutral">Inactive</Badge>}
                      </h1>
                      <p className="text-body text-text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span data-numeric>
                          {age === null ? 'Age not recorded' : `${age} yrs`}
                          {' · '}
                          {patient.gender ? humanizeEnum(patient.gender) : 'Sex not recorded'}
                          {patient.blood_group ? ` · ${patient.blood_group}` : ''}
                        </span>
                        <span aria-hidden className="text-text-subtle">
                          ·
                        </span>
                        <a
                          href={`tel:${patient.phone}`}
                          data-numeric
                          className="text-text -my-1 py-1 font-mono underline-offset-4 hover:underline"
                        >
                          {patient.phone}
                        </a>
                      </p>
                    </>
                  )
                )}
              </div>
            </div>

            {patient && canWrite && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  iconLeft={<Pencil className="size-4" />}
                  onClick={() => setEditOpen(true)}
                  className="min-h-tap sm:min-h-0"
                >
                  <span className="hidden sm:inline">Edit</span>
                  <span className="sr-only sm:hidden">Edit patient</span>
                </Button>
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="More patient actions"
                      className="size-tap sm:size-control"
                    >
                      <Ellipsis aria-hidden className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {patient.is_active ? (
                      <MenuItem
                        destructive
                        icon={<UserMinus aria-hidden />}
                        onSelect={() => setConfirmDeactivate(true)}
                      >
                        Deactivate patient
                      </MenuItem>
                    ) : (
                      <MenuItem icon={<RotateCcw aria-hidden />} onSelect={() => setActive(true)}>
                        Reactivate patient
                      </MenuItem>
                    )}
                  </MenuContent>
                </Menu>
              </div>
            )}
          </div>

          {/* Last vitals: one quiet line. Taken at a visit, so dated by it. */}
          <div className="border-border bg-bg-sunken/60 text-label flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5">
            <span className="text-caption text-text-subtle">Last vitals</span>
            {summary.isPending || history.isPending ? (
              <Skeleton className="h-3 w-56" />
            ) : vitals ? (
              <>
                <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5" data-numeric>
                  {vitals.pairs.map(([label, value]) => (
                    <div key={label} className="flex items-baseline gap-1.5">
                      <dt className="text-caption text-text-subtle">{label}</dt>
                      <dd className="text-text font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {vitals.on && (
                  <span className="text-caption text-text-subtle" data-numeric>
                    {formatRelativeDay(vitals.on)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-text-muted">None recorded yet</span>
            )}
          </div>
        </Card>

        {/* No skeleton here on purpose: a placeholder box would have to guess a
            height, and the one thing worse than a beat of stillness is a red
            rectangle that turns out to say nothing. */}
        {patient && <AllergyBanner allergies={patient.allergies} />}
      </section>

      {patient && !patient.is_active && (
        <p className="border-border bg-surface text-caption text-text-muted rounded-md border px-3 py-2">
          This patient is deactivated. They no longer appear in search, and their history is kept —
          patients are never deleted.
        </p>
      )}

      {/* The next step. Repeat is the primary when there is something to repeat:
          a returning patient is usually the same prescription again, and it is
          one tap instead of rebuilding it. Two lines per button — English for
          the screen, spoken Bengali for the person at the desk. */}
      {patient && canPrescribe && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            {latest && (
              <Button
                variant="primary"
                size="lg"
                asChild
                iconLeft={<Repeat2 className="size-5" />}
                className="min-h-tap w-full sm:w-auto sm:min-w-64"
              >
                <Link to={`/prescriptions/new?patientId=${patient.id}&from=${latest.id}`}>
                  Repeat last prescription
                </Link>
              </Button>
            )}
            <Button
              variant={latest ? 'secondary' : 'primary'}
              size="lg"
              asChild
              iconLeft={<Plus className="size-5" />}
              className="min-h-tap w-full sm:w-auto sm:min-w-64"
            >
              <Link to={`/prescriptions/new?patientId=${patient.id}`}>
                New prescription
              </Link>
            </Button>
          </div>
          {latest && (
            <p className="text-caption text-text-subtle [text-wrap:pretty]">
              Repeat copies the medicines and notes from{' '}
              <span data-numeric>{formatDate(latest.created_at)}</span>
              {latest.diagnosis ? ` (${latest.diagnosis})` : ''}. Vitals start blank — they are per
              visit.
            </p>
          )}
        </div>
      )}

      {/* `min-w-0` on BOTH grid items is what stops this page sliding sideways
          on a phone, and it is not cosmetic. A grid item's automatic minimum
          size is `auto`, i.e. its min-content, so the single `auto` track here
          was sized to the widest thing inside it rather than to the container:
          measured at 320px, the track's base size was 365px against a 288px
          container and the whole `<main>` scrolled to 381px. The truncating
          lines in a visit row and the non-wrapping status Badge on an
          appointment row were what set that 365px. `min-w-0` drops the minimum
          to zero, after which the track is clamped to the space available and
          the truncation inside actually truncates instead of pushing. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Visits"
            description={
              prescriptions.length > 0 ? (
                <>
                  {prescriptions.length}{' '}
                  {prescriptions.length === 1 ? 'prescription' : 'prescriptions'}
                  {lastVisit && (
                    <>
                      {' · last visit '}
                      <span lang="bn">{lastVisit.bn}</span> / {lastVisit.en}
                    </>
                  )}
                </>
              ) : undefined
            }
          />

          {summary.isPending ? (
            <div className="flex flex-col gap-px p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex h-16 items-center gap-3 px-1">
                  <Skeleton className="size-2.5 shrink-0 rounded-full" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : prescriptions.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="No visits yet"
              description="Everything written for this patient will be listed here, newest first."
              action={
                canPrescribe && (
                  <Button variant="primary" size="sm" asChild>
                    <Link to={`/prescriptions/new?patientId=${patientId}`}>
                      Write the first one
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <ol className="py-2">
              {prescriptions.map((entry, index) => (
                <VisitRow
                  key={entry.id}
                  entry={entry}
                  detail={detailById.get(entry.id)}
                  latest={index === 0}
                  last={index === prescriptions.length - 1}
                />
              ))}
            </ol>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              {summary.isPending ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-3 w-full" />
                  ))}
                </div>
              ) : (
                patient && (
                  /* One column on a phone. These values are addresses, emails
                     and city names, and half of a 288px card is 128px — wide
                     enough to truncate every one of them into an ellipsis. The
                     vitals grid above stays at two columns because "120/80" and
                     "72.5 kg" genuinely fit. `col-span-full` rather than
                     `col-span-2` on the spanning rows, so they span whatever
                     the grid actually has rather than conjuring a second
                     implicit column at the narrow size. */
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    <Fact label="Date of birth">
                      <span data-numeric>{formatDate(patient.date_of_birth, 'Not recorded')}</span>
                    </Fact>
                    <Fact label="Blood group">{patient.blood_group || 'Not recorded'}</Fact>
                    <Fact label="City">{patient.city || 'Not recorded'}</Fact>
                    <Fact label="Email">
                      {patient.email ? (
                        <a
                          href={`mailto:${patient.email}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {patient.email}
                        </a>
                      ) : (
                        'Not recorded'
                      )}
                    </Fact>
                    {patient.address && (
                      <div className="col-span-full min-w-0">
                        <dt className="text-caption text-text-subtle">Address</dt>
                        <dd className="text-body text-text mt-0.5">{patient.address}</dd>
                      </div>
                    )}
                    {jsonFacts(patient.emergency_contact).map(([label, value]) => (
                      <Fact key={`ec-${label}`} label={`Emergency · ${label}`}>
                        {value}
                      </Fact>
                    ))}
                    {jsonFacts(patient.medical_history).map(([label, value]) => (
                      <Fact key={`mh-${label}`} label={label}>
                        {value}
                      </Fact>
                    ))}
                    <div className="border-border col-span-full border-t pt-3">
                      <p className="text-caption text-text-subtle">
                        On the books since {formatDate(patient.created_at)}
                        {allergyCount === 0 && canWrite && ' · allergies not yet confirmed'}
                      </p>
                    </div>
                  </dl>
                )
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Appointments"
              description={
                appointments.length > APPOINTMENTS_SHOWN
                  ? `Showing the ${APPOINTMENTS_SHOWN} most recent of ${appointments.length}`
                  : undefined
              }
            />
            {summary.isPending ? (
              <div className="flex flex-col gap-px p-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : appointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays />}
                title="No appointments"
                description="Nothing has been booked for this patient."
              />
            ) : (
              <ul className="divide-border/60 divide-y">
                {appointments.slice(0, APPOINTMENTS_SHOWN).map((appointment) => (
                  <li
                    key={appointment.id}
                    /* The status Badge does not wrap its own text, so on a
                       narrow card it drops to a line of its own rather than
                       squeezing the date beside it into two words a line. */
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3"
                  >
                    {/* `basis-full` below `sm` puts the badge on its own line
                        rather than leaving the date ~150px and breaking
                        "4:41 pm" across two of them. */}
                    <span className="min-w-0 flex-1 basis-full sm:basis-0">
                      <span className="text-body text-text block" data-numeric>
                        {formatRelativeDay(appointment.appointment_date)} ·{' '}
                        {formatTime(appointment.start_time)}
                      </span>
                      {appointment.reason && (
                        <span className="text-caption text-text-muted block truncate">
                          {appointment.reason}
                        </span>
                      )}
                    </span>
                    <Badge tone={STATUS_TONE[appointment.status] ?? 'neutral'} dot>
                      {humanizeEnum(appointment.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {canWrite && patient && (
        <>
          <PatientFormSheet open={editOpen} onOpenChange={setEditOpen} patient={patient} />
          <ConfirmDialog
            open={confirmDeactivate}
            onOpenChange={setConfirmDeactivate}
            title={`Deactivate ${name}?`}
            body={
              <>
                They will stop appearing in patient search and cannot be picked for a new
                prescription. Nothing is deleted — every past prescription stays exactly where it
                is, and you can reactivate them at any time.
              </>
            }
            confirmLabel="Deactivate"
            destructive
            loading={update.isPending}
            onConfirm={() => setActive(false)}
          />
        </>
      )}
    </div>
  )
}

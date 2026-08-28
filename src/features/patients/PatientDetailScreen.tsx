/**
 * `/patients/:patientId` — the record, and everything that has happened to it.
 *
 * `GET /patients/{id}/summary` answers the whole screen in one round trip: the
 * full patient, their complete prescription and appointment history, and the
 * last visit date. Its prescription entries carry an `items_count` but not the
 * medicines, and "what did I put her on last time" is the single most useful
 * thing this page can answer — so `GET /patients/{id}/prescriptions` is fetched
 * alongside and merged in. The rows paint from the summary immediately and
 * gain their medicine line when the second call lands; nothing waits on it.
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
  Plus,
  RotateCcw,
  UserMinus,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import {
  formatAgo,
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
import {
  cleanAllergies,
  usePatientPrescriptions,
  usePatientSummary,
  useUpdatePatient,
} from './api'
import { AllergyBanner } from './AllergyDisplay'
import { PatientFormSheet } from './PatientFormSheet'
import { hasMeasurements, readVitals } from './vitals'

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

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-body text-text">{children}</dd>
    </div>
  )
}

/** One vital on the card: label above, value with its unit beside it. */
function VitalFact({
  label,
  value,
  unit,
}: {
  label: string
  value: string | number | undefined
  unit: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="mt-0.5 text-body font-medium text-text" data-numeric>
        {value === undefined ? (
          <span className="font-normal text-text-subtle">—</span>
        ) : (
          <>
            {value}
            <span className="ml-1 text-caption font-normal text-text-subtle">{unit}</span>
          </>
        )}
      </dd>
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

function PrescriptionRow({
  entry,
  detail,
}: {
  entry: PatientSummaryPrescription
  detail: PrescriptionResponse | undefined
}) {
  return (
    <li>
      <Link
        to={`/prescriptions/${entry.id}`}
        className={cn(
          /* `flex-wrap` below `sm`, `flex-nowrap` from `sm` up. The date is a
             112px column that cannot shrink; on a 320px phone that leaves about
             140px for a diagnosis, which is not enough to read one. Wrapping
             lets the date take a full line of its own and hands the whole width
             back to the diagnosis underneath it. */
          'flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap',
          'transition-colors duration-fast ease-standard',
          'hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none',
        )}
      >
        {/* One line on a phone (date and "3 days ago" side by side), the stacked
            two-line column it has always been from `sm` up. Two stacked lines on
            a phone would cost a row of height to say the same thing. */}
        <div
          className="flex w-full items-baseline gap-2 sm:w-28 sm:shrink-0 sm:flex-col sm:items-start sm:gap-0"
          data-numeric
        >
          <p className="text-body font-semibold text-text">{formatDate(entry.created_at)}</p>
          <p className="text-caption text-text-subtle">{formatAgo(entry.created_at)}</p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-text">
            {entry.diagnosis || <span className="text-text-subtle">No diagnosis recorded</span>}
          </p>
          <p className="mt-0.5 truncate text-label text-text-muted">
            {detail
              ? medicineLine(detail)
              : `${entry.items_count} ${entry.items_count === 1 ? 'medicine' : 'medicines'}`}
          </p>
        </div>

        <span className="hidden shrink-0 font-mono text-label text-text-subtle sm:block" data-numeric>
          {entry.prescription_number}
        </span>
        <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-text-subtle" />
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
  const canWrite = can('patients.write')

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const summary = usePatientSummary(patientId)
  const history = usePatientPrescriptions(patientId)
  const update = useUpdatePatient(patientId)

  const patient = summary.data?.patient
  const prescriptions = summary.data?.prescriptions ?? []
  const appointments = summary.data?.appointments ?? []

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
  const vitals = readVitals(patient?.medical_history)
  const vitalsRecorded = hasMeasurements(vitals)

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
          className="inline-flex items-center gap-1.5 py-1 text-label text-text-muted hover:text-text"
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
        className="inline-flex w-fit items-center gap-1.5 py-1 text-label text-text-muted transition-colors duration-fast hover:text-text"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All patients
      </Link>

      {/* The token layer reserves display type for exactly this: the patient's
          name on the detail screen. Hence a bespoke header rather than
          PageHeader, which is fixed at title size. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          {summary.isPending ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="flex flex-wrap items-center gap-2.5 text-display text-text">
              <span className="min-w-0 break-words">{name}</span>
              {patient && !patient.is_active && <Badge tone="neutral">Inactive</Badge>}
            </h1>
          )}

          {summary.isPending ? (
            <Skeleton className="mt-2 h-3 w-48" />
          ) : (
            patient && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-text-muted">
                <span data-numeric>{age === null ? 'Age not recorded' : `${age} years`}</span>
                <span aria-hidden className="text-text-subtle">
                  ·
                </span>
                <span>{patient.gender ? humanizeEnum(patient.gender) : 'Sex not recorded'}</span>
                {patient.blood_group && (
                  <>
                    <span aria-hidden className="text-text-subtle">
                      ·
                    </span>
                    <span>{patient.blood_group}</span>
                  </>
                )}
                <span aria-hidden className="text-text-subtle">
                  ·
                </span>
                <a
                  href={`tel:${patient.phone}`}
                  data-numeric
                  className="font-mono text-text underline-offset-4 hover:underline"
                >
                  {patient.phone}
                </a>
              </p>
            )
          )}
        </div>

        {patient && (
          /* Below `sm` this is a block under the name, not the right-hand end of
             a row: three 32px controls squeezed against a 320px edge is the
             layout this screen used to have, and none of them was tappable. The
             `min-h-tap` / `sm:min-h-0` pairs below raise every control to the
             44px touch minimum on a phone and hand the desk back its dense
             32px row from `sm` up. */
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {can('prescriptions.write') && (
              <Button
                variant="primary"
                asChild
                iconLeft={<Plus className="size-4" />}
                /* The one thing this screen exists to start. Full width on a
                   phone so it is hit without aiming. */
                className="min-h-tap w-full sm:min-h-0 sm:w-auto"
              >
                <Link to={`/prescriptions/new?patientId=${patient.id}`}>New prescription</Link>
              </Button>
            )}
            {canWrite && (
              <>
                <Button
                  variant="secondary"
                  iconLeft={<Pencil className="size-4" />}
                  onClick={() => setEditOpen(true)}
                  // Takes the rest of the line beside the overflow menu.
                  className="min-h-tap flex-1 sm:min-h-0 sm:flex-none"
                >
                  Edit
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
                      <MenuItem
                        icon={<RotateCcw aria-hidden />}
                        onSelect={() => setActive(true)}
                      >
                        Reactivate patient
                      </MenuItem>
                    )}
                  </MenuContent>
                </Menu>
              </>
            )}
          </div>
        )}
      </header>

      {/* No skeleton here on purpose: a placeholder box would have to guess a
          height, and the one thing worse than a beat of stillness is a red
          rectangle that turns out to say nothing. */}
      {patient && <AllergyBanner allergies={patient.allergies} />}

      {patient && !patient.is_active && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-caption text-text-muted">
          This patient is deactivated. They no longer appear in search, and their history is
          kept — patients are never deleted.
        </p>
      )}

      {/* `min-w-0` on BOTH grid items is what stops this page sliding sideways
          on a phone, and it is not cosmetic. A grid item's automatic minimum
          size is `auto`, i.e. its min-content, so the single `auto` track here
          was sized to the widest thing inside it rather than to the container:
          measured at 320px, the track's base size was 365px against a 288px
          container and the whole `<main>` scrolled to 381px. The truncating
          diagnosis line in a prescription row (`white-space: nowrap`) and the
          non-wrapping status Badge on an appointment row were what set that
          365px. `min-w-0` drops the minimum to zero, after which the track is
          clamped to the space available and the truncation inside actually
          truncates instead of pushing. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Prescription history"
            description={
              prescriptions.length > 0
                ? `${prescriptions.length} in total${
                    summary.data?.last_visit_date
                      ? ` · last visit ${formatRelativeDay(summary.data.last_visit_date)}`
                      : ''
                  }`
                : undefined
            }
            action={
              prescriptions.length > 0 &&
              can('prescriptions.write') &&
              patient && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/prescriptions/new?patientId=${patient.id}`}>Write another</Link>
                </Button>
              )
            }
          />

          {summary.isPending ? (
            <div className="flex flex-col gap-px p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex h-12 items-center gap-3 px-1">
                  <Skeleton className="h-3 w-20 shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : prescriptions.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="No prescriptions yet"
              description="Everything written for this patient will be listed here, newest first."
              action={
                can('prescriptions.write') &&
                patient && (
                  <Button variant="primary" size="sm" asChild>
                    <Link to={`/prescriptions/new?patientId=${patient.id}`}>
                      Write the first one
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {prescriptions.map((entry) => (
                <PrescriptionRow
                  key={entry.id}
                  entry={entry}
                  detail={detailById.get(entry.id)}
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="Vitals"
              action={
                vitalsRecorded &&
                canWrite && (
                  <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                )
              }
            />
            {summary.isPending ? (
              <CardBody>
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 2 }, (_, i) => (
                    <Skeleton key={i} className="h-3 w-full" />
                  ))}
                </div>
              </CardBody>
            ) : !vitalsRecorded ? (
              /* `flex-wrap`: the Edit button is `shrink-0`, so on a narrow card
                 it would otherwise hold the row open at sentence-plus-button
                 width rather than dropping below the sentence. */
              <CardBody className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body text-text-muted">No vitals recorded yet</p>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<Pencil className="size-4" />}
                    onClick={() => setEditOpen(true)}
                  >
                    Edit
                  </Button>
                )}
              </CardBody>
            ) : (
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <VitalFact label="Blood pressure" value={vitals.bp} unit="mmHg" />
                  <VitalFact label="Weight" value={vitals.weight_kg} unit="kg" />
                  <VitalFact label="SpO2" value={vitals.spo2} unit="%" />
                  <VitalFact label="Pulse" value={vitals.pulse_bpm} unit="bpm" />
                </dl>
                {vitals.recorded_at && (
                  <p
                    className="mt-3 border-t border-border pt-3 text-caption text-text-subtle"
                    data-numeric
                  >
                    recorded {formatDate(vitals.recorded_at)}
                  </p>
                )}
              </CardBody>
            )}
          </Card>

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
                        <dd className="mt-0.5 text-body text-text">{patient.address}</dd>
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
                    <div className="col-span-full border-t border-border pt-3">
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
              <ul className="divide-y divide-border/60">
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
                      <span className="block text-body text-text" data-numeric>
                        {formatRelativeDay(appointment.appointment_date)} ·{' '}
                        {formatTime(appointment.start_time)}
                      </span>
                      {appointment.reason && (
                        <span className="block truncate text-caption text-text-muted">
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

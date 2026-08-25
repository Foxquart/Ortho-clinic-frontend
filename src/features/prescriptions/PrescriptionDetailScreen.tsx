import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarCheck, FileDown, Lock, Printer, Stethoscope } from 'lucide-react'
import { API_BASE_URL, apiGet, resolveApiUrl } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, fullName, patientAge } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader, Separator } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { RxAllergyBannerView, type RxAllergyStatus } from './RxAllergyBannerView'
import { RxMedicinesView } from './RxMedicinesView'
import type { PatientResponse, PrescriptionDetailResponse } from '@/api/schema'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-micro text-text-subtle uppercase">{children}</h2>
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <SectionTitle>{label}</SectionTitle>
      {value ? (
        <p className="text-body text-text mt-1 max-w-prose whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-body text-text-subtle mt-1">—</p>
      )}
    </div>
  )
}

export function PrescriptionDetailScreen() {
  const { prescriptionId = '' } = useParams<{ prescriptionId: string }>()
  const navigate = useNavigate()
  const { can } = useAuth()

  const rxQuery = useQuery({
    queryKey: qk.prescriptions.detail(prescriptionId),
    queryFn: () => apiGet<PrescriptionDetailResponse>(endpoints.prescriptions.byId(prescriptionId)),
    enabled: Boolean(prescriptionId),
  })

  const rx = rxQuery.data
  const patientId = rx?.patient_id ?? rx?.patient?.id ?? ''

  /* Allergies are NOT on `PrescriptionDetailResponse` — its embedded `patient`
     is a `PatientSummary` (id, name, phone, email only). They live on
     `PatientResponse`, so the patient record is fetched alongside, keyed on the
     shared patient key so it is shared with every other screen's cache. The
     prescription renders without waiting for it. */
  const patientQuery = useQuery({
    queryKey: qk.patients.detail(patientId),
    queryFn: () => apiGet<PatientResponse>(endpoints.patients.byId(patientId)),
    enabled: Boolean(patientId),
  })

  /* `resolveApiUrl` takes a full API path, while `endpoints.*` are relative to
     the `/api/v1` prefix — so the configured base is prepended before
     resolving. Works behind the dev proxy and against a remote API alike. */
  const printUrl = resolveApiUrl(
    `${API_BASE_URL}${endpoints.prescriptions.printView(prescriptionId)}`,
  )

  /* "Download PDF" is the browser's own print-to-PDF, because that is the only
     honest way to get one: the API has no PDF endpoint, it renders the A4 sheet
     as HTML and nothing else. So the print view is opened and the print dialog
     raised on top of it, where the doctor picks "Save as PDF" as the
     destination. No PDF library is pulled in to fake it, and nothing is
     labelled a PDF that is really an HTML file. */
  const openPrintDialog = () => {
    /* `noopener` is deliberately NOT passed here, unlike the Print button.
       With it the browser returns `null` instead of a window handle, and the
       handle is exactly what is needed to call `print()` on the new tab. The
       URL is our own API, assembled from `API_BASE_URL` rather than from
       anything a user typed, so the reverse-tabnabbing that `noopener` guards
       against has no way in. */
    const printWindow = window.open(printUrl, '_blank')

    if (!printWindow) {
      /* A popup blocker (or a browser withholding the handle) left nothing to
         drive. Open the tab the same way Print does so the sheet still appears;
         the doctor presses Cmd/Ctrl+P from there. */
      window.open(printUrl, '_blank', 'noopener,noreferrer')
      return
    }

    const raisePrintDialog = () => {
      /* Cross-origin guard. `API_BASE_URL` is `/api/v1` in dev — same origin,
         via the Vite proxy — but `VITE_API_URL` can point the API at another
         origin in production, and there the browser throws a SecurityError the
         moment we touch the opened window. Swallowing it degrades to exactly
         the Print behaviour: the sheet is open in its own tab and Cmd/Ctrl+P
         still saves it as a PDF. */
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        // Cross-origin print view — the doctor prints from the tab itself.
      }
    }

    try {
      /* The dialog must not open over a half-rendered page, so it waits for the
         document's own `load`. (`once` so a re-print in that tab is the user's
         business, not ours.) */
      printWindow.addEventListener('load', raisePrintDialog, { once: true })
    } catch {
      // Same cross-origin case, thrown one step earlier on `addEventListener`.
    }
  }

  if (rxQuery.isError) {
    return (
      <div className="max-w-content flex flex-col gap-4 px-6 pt-5 pb-8">
        <ErrorState error={rxQuery.error} onRetry={() => rxQuery.refetch()} />
        <div>
          <Button
            variant="secondary"
            onClick={() => navigate('/prescriptions')}
            iconLeft={<ArrowLeft className="size-4" />}
          >
            Back to prescriptions
          </Button>
        </div>
      </div>
    )
  }

  if (!rx) {
    return (
      <div className="max-w-content flex flex-col gap-4 px-6 pt-5 pb-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-56" />
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
        <Card className="flex flex-col gap-4 p-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3 w-80" />
          <Separator />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      </div>
    )
  }

  const patientName = rx.patient
    ? fullName(rx.patient.first_name, rx.patient.last_name)
    : rx.patient_name || 'Unnamed patient'

  const allergyStatus: RxAllergyStatus = patientQuery.isPending
    ? 'loading'
    : patientQuery.isError
      ? 'unavailable'
      : 'ready'

  const age = patientAge(patientQuery.data?.date_of_birth)
  const identity = [
    age !== null ? `${age} yrs` : null,
    patientQuery.data?.gender ?? null,
    patientQuery.data?.blood_group ? `Blood group ${patientQuery.data.blood_group}` : null,
    rx.patient?.phone ?? patientQuery.data?.phone ?? null,
  ].filter(Boolean)

  return (
    <div className="max-w-content flex flex-col gap-4 px-6 pt-5 pb-8">
      <PageHeader
        breadcrumb={
          <Link
            to="/prescriptions"
            className="duration-fast hover:text-text underline-offset-4 transition-colors hover:underline"
          >
            Prescriptions
          </Link>
        }
        title={<span className="font-mono">{rx.prescription_number}</span>}
        description={
          <span className="text-caption text-text-muted">
            Written {formatDateTime(rx.created_at)}
            {rx.doctor_full_name ? ` · ${rx.doctor_full_name}` : ''}
          </span>
        }
        actions={
          <>
            {/* Prescriptions are append-only: no edit, no delete, no void. The
                only forward action is writing a new one for the same patient. */}
            {can('prescriptions.write') && patientId && (
              <Button
                variant="secondary"
                onClick={() => navigate(`/prescriptions/new?patientId=${patientId}`)}
              >
                New prescription for this patient
              </Button>
            )}
            {/* Sits beside Print rather than competing with it: same sheet,
                same dialog, different destination. Kept `secondary` so the one
                filled button in this header stays Print. */}
            <Button
              variant="secondary"
              onClick={openPrintDialog}
              iconLeft={<FileDown className="size-4" />}
              title="Opens the print view and your browser's print dialog. Choose Save as PDF as the destination."
            >
              Download PDF
            </Button>
            {/* The API renders the A4 sheet itself; a new tab hands the doctor
                the browser's own print dialog in one click. */}
            <Button
              variant="primary"
              onClick={() => window.open(printUrl, '_blank', 'noopener,noreferrer')}
              iconLeft={<Printer className="size-4" />}
            >
              Print
            </Button>
          </>
        }
      />

      {/* There is deliberately no Edit and no Delete, so this says why in the
          place someone would go looking for them. Silence would read as an
          oversight, and the doctor would keep hunting. */}
      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        This prescription is a signed record: it cannot be edited or deleted. To correct it,
        write a new prescription for the same patient and hand that one over instead.
      </p>

      <RxAllergyBannerView
        status={allergyStatus}
        allergies={patientQuery.data?.allergies}
        onRetry={() => patientQuery.refetch()}
      />

      <Card>
        {/* Patient identity — who this sheet is for, before anything clinical. */}
        <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-heading text-text truncate font-semibold">{patientName}</h2>
              {rx.status !== 'active' && <Badge tone="danger">Voided</Badge>}
            </div>
            {identity.length > 0 && (
              <p className="text-caption text-text-muted mt-0.5" data-numeric>
                {identity.join(' · ')}
              </p>
            )}
          </div>
          {patientId && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/patients/${patientId}`)}>
              Patient record
            </Button>
          )}
        </div>

        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <Meta label="Chief complaint" value={rx.chief_complaint} />
          <Meta label="Diagnosis" value={rx.diagnosis} />
        </div>

        <div className="border-border border-t">
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <SectionTitle>Medicines</SectionTitle>
            <span className="text-micro text-text-subtle" data-numeric>
              {rx.items.length}
            </span>
          </div>
          {rx.items.length === 0 ? (
            <p className="text-body text-text-subtle px-4 pb-3">
              This prescription has no medicines.
            </p>
          ) : (
            <RxMedicinesView items={rx.items} />
          )}
        </div>

        <div className="border-border grid gap-4 border-t px-4 py-3 sm:grid-cols-[1fr_auto]">
          <Meta label="Advice" value={rx.advice} />
          <div className="sm:w-56">
            <SectionTitle>Follow-up</SectionTitle>
            <div className="mt-1 flex items-center gap-2">
              <CalendarCheck
                aria-hidden
                className={cn('size-4', rx.follow_up_date ? 'text-accent' : 'text-text-subtle')}
              />
              <span
                className={cn(
                  'text-body',
                  rx.follow_up_date ? 'text-text font-medium' : 'text-text-subtle',
                )}
                data-numeric
              >
                {rx.follow_up_date ? formatDate(rx.follow_up_date) : 'None scheduled'}
              </span>
            </div>
          </div>
        </div>

        {rx.notes && (
          <div className="border-border border-t px-4 py-3">
            <SectionTitle>Internal notes</SectionTitle>
            <p className="text-body text-text-muted mt-1 max-w-prose whitespace-pre-wrap">
              {rx.notes}
            </p>
          </div>
        )}

        {(rx.doctor_full_name || rx.doctor_qualifications) && (
          <div className="border-border text-caption text-text-muted flex items-center gap-2 border-t px-4 py-2.5">
            <Stethoscope aria-hidden className="text-text-subtle size-3.5" />
            <span>
              {rx.doctor_full_name}
              {rx.doctor_qualifications ? ` · ${rx.doctor_qualifications}` : ''}
            </span>
          </div>
        )}
      </Card>

      <p className="text-caption text-text-subtle">
        Prescriptions are a permanent record — they cannot be edited or deleted. Write a new one
        instead.
      </p>
    </div>
  )
}

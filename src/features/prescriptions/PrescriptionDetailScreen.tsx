import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, CalendarCheck, FileDown, Lock, Printer, Stethoscope } from 'lucide-react'
import { API_BASE_URL, apiGet, apiGetBlob, resolveApiUrl } from '@/api/http'
import { errorMessage, toApiError } from '@/api/errors'
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
  /* Rendering the PDF is a server round trip that can take a second. Without
     this the button looks dead and gets clicked three more times, which is
     three more renders the server has to do. */
  const [isDownloading, setIsDownloading] = useState(false)

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

  /* "Download PDF" has two paths, and which one runs is the server's answer,
     not a guess made here.

     The real one is `prescriptions.pdf`: the API renders the same A4 sheet to
     a PDF and returns it as an attachment, so the doctor gets a file. It is
     fetched as a blob through the shared axios instance rather than linked to
     with an `<a href>`, because this API authenticates by COOKIE — a bare
     navigation (or a `fetch` without credentials) to a cross-origin
     `VITE_API_URL` would arrive signed out and 401. The blob is then handed to
     a synthesised `<a download>`, which is the only way to name the file
     ourselves.

     The fallback is `openPrintDialog` below — the behaviour this button used
     to have, in full. The renderer is an optional server-side dependency, so a
     deployment can legitimately answer 503; on those the doctor must not be
     left holding an error. The print view still exists on every deployment, so
     it is opened with the print dialog raised on top of it and the doctor
     picks "Save as PDF" as the destination. Slower and one dialog longer, but
     it always produces the same sheet.

     Nothing here fakes a PDF: no client-side PDF library is pulled in, and
     nothing that is really HTML is ever labelled `.pdf`. */
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

  const downloadPdf = async () => {
    if (isDownloading) return
    setIsDownloading(true)

    /* Declared out here so the `finally` can revoke it whichever way the try
       block exits. An object URL that is never revoked pins the entire PDF in
       memory for the life of the tab. */
    let objectUrl: string | null = null

    try {
      const blob = await apiGetBlob(endpoints.prescriptions.pdf(prescriptionId))
      objectUrl = URL.createObjectURL(blob)

      /* The filename is derived from the prescription number we already have,
         NOT parsed out of `Content-Disposition`. Cross-origin that header is
         invisible to JavaScript unless the API lists it in CORS
         `expose_headers`, so reading it would work in dev and silently produce
         "download" in production — the one place nobody would see it. */
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${(rx?.prescription_number ?? 'prescription').replace(/[^\w.-]+/g, '-')}.pdf`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      // No success toast: the file landing in the downloads shelf IS the feedback.
    } catch (error) {
      const status = toApiError(error).status

      /* 503 is the documented "this deployment has no renderer" answer. 404 is
         treated the same way on purpose: the prescription itself demonstrably
         exists — we are rendering it — so a 404 from this path means the route
         is missing, i.e. a backend that predates the PDF endpoint. Both mean
         "the server cannot make the file", and neither is the doctor's
         problem, so both fall through to the print view. */
      if (status === 503 || status === 404) {
        toast.info(
          "PDF isn't available on this server — opening the print view, choose Save as PDF",
        )
        openPrintDialog()
      } else {
        toast.error(errorMessage(error))
      }
    } finally {
      if (objectUrl) {
        /* Revoked on the next task rather than in this one. `click()` only
           queues the download; revoking in the same tick can pull the blob out
           from under it before the browser has read it. */
        const url = objectUrl
        setTimeout(() => URL.revokeObjectURL(url), 0)
      }
      setIsDownloading(false)
    }
  }

  if (rxQuery.isError) {
    return (
      <div className="max-w-content flex flex-col gap-4 px-4 pt-5 pb-8 sm:px-6">
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
      <div className="max-w-content flex flex-col gap-4 px-4 pt-5 pb-8 sm:px-6">
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
    <div className="max-w-content flex flex-col gap-4 px-4 pt-5 pb-8 sm:px-6">
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
          /* `w-full sm:w-auto` on every one of them: below `sm` these stack as
             three full-width bars rather than three shrunken ones squeezed onto
             a phone's line. The reader is a 50–60 year old surgeon holding the
             phone one-handed — a wide target he can hit without looking beats a
             tidy row he has to aim at. From `sm` up they go back to being a
             right-aligned row of natural-width buttons. */
          <>
            {/* Prescriptions are append-only: no edit, no delete, no void. The
                only forward action is writing a new one for the same patient. */}
            {can('prescriptions.write') && patientId && (
              <Button
                variant="secondary"
                className="min-h-tap w-full sm:min-h-0 sm:w-auto"
                onClick={() => navigate(`/prescriptions/new?patientId=${patientId}`)}
              >
                New prescription for this patient
              </Button>
            )}
            {/* Sits beside Print rather than competing with it: same sheet,
                different destination. Kept `secondary` so the one filled button
                in this header stays Print. */}
            <Button
              variant="secondary"
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
              loading={isDownloading}
              onClick={() => void downloadPdf()}
              iconLeft={<FileDown className="size-4" />}
              title="Downloads this prescription as a PDF file."
            >
              Download PDF
            </Button>
            {/* The API renders the A4 sheet itself; a new tab hands the doctor
                the browser's own print dialog in one click. */}
            <Button
              variant="primary"
              className="min-h-tap w-full sm:min-h-0 sm:w-auto"
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
        This prescription is a signed record: it cannot be edited or deleted. To correct it, write a
        new prescription for the same patient and hand that one over instead.
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
            /* On a phone this wraps onto its own line under the name, where a
               ghost button's own padding would leave its label indented 12px
               past everything above it. The negative margin pulls the LABEL
               back into the card's text column; from `sm` up it is back on the
               right of the row, where the padding is correct again. */
            <Button
              variant="ghost"
              size="sm"
              className="min-h-tap -ml-2.5 sm:ml-0 sm:min-h-0"
              onClick={() => navigate(`/patients/${patientId}`)}
            >
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

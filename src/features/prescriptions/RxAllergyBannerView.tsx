import { AlertTriangle, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Feedback'

/**
 * Allergy status for the patient this prescription belongs to.
 *
 * `PrescriptionDetailResponse` does NOT carry allergies (its embedded `patient`
 * is a `PatientSummary`: id, name, phone, email only), so the caller fetches
 * `GET /patients/{id}` and hands the result here.
 *
 * Three states, deliberately all visible:
 *  - has allergies  → solid `bg-allergy` fill with an icon. Never a tint, never
 *    collapsed. This screen is read while dispensing.
 *  - none recorded  → a quiet positive line, so "we checked" is distinguishable
 *    from "we don't know".
 *  - unavailable    → says so plainly and offers a retry. Silence would read as
 *    "no allergies", which is the one thing it must not read as.
 */
export type RxAllergyStatus = 'loading' | 'ready' | 'unavailable'

export function RxAllergyBannerView({
  status,
  allergies,
  onRetry,
}: {
  status: RxAllergyStatus
  allergies: string[] | null | undefined
  onRetry?: () => void
}) {
  if (status === 'loading') {
    return <Skeleton className="h-9 w-full rounded-lg" />
  }

  if (status === 'unavailable') {
    return (
      <div className="border-border-strong bg-surface flex items-center gap-2.5 rounded-lg border px-3 py-2">
        <ShieldQuestion aria-hidden className="text-text-muted size-4 shrink-0" />
        <p className="text-caption text-text-muted min-w-0 flex-1">
          Allergy history could not be loaded. Confirm with the patient before dispensing.
        </p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
            Retry
          </Button>
        )}
      </div>
    )
  }

  const list = (allergies ?? []).map((a) => a.trim()).filter(Boolean)

  /* `null` and `[]` are not the same answer and must not look the same.
     `PatientResponse.allergies` is null on a record nobody has asked the
     question of — a walk-in created at the moment of prescribing, for instance
     — and an empty array once someone has asked and been told "none". Printing
     "No known allergies" over the first case is how a real allergy gets
     dispensed against. */
  if (allergies == null) {
    return (
      <div className="border-warning/40 bg-warning-muted flex items-center gap-2.5 rounded-lg border px-3 py-2">
        <ShieldQuestion aria-hidden className="text-warning size-4 shrink-0" />
        <p className="text-caption text-text">
          <strong className="font-medium">No allergy history on file.</strong> Nobody has asked
          this patient yet — this is not the same as “no allergies”.
        </p>
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="border-border bg-surface flex items-center gap-2.5 rounded-lg border px-3 py-2">
        <ShieldCheck aria-hidden className="text-success size-4 shrink-0" />
        <p className="text-caption text-text-muted">
          Asked and recorded: no known allergies.
        </p>
      </div>
    )
  }

  /* Deliberately NOT `role="alert"` / `aria-live="assertive"`: the design rules
     reserve assertive for the pad's allergy-conflict banner. This is the
     patient's standing allergy record, read as part of the sheet — loud in
     colour, polite in the accessibility tree. */
  return (
    <section
      aria-labelledby="rx-allergy-heading"
      className="bg-allergy text-allergy-fg flex items-start gap-3 rounded-lg px-4 py-3 shadow-sm"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <h2 id="rx-allergy-heading" className="text-micro uppercase opacity-80">
          Allergies — {list.length} recorded
        </h2>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {list.map((allergy) => (
            <li
              key={allergy}
              className="border-allergy-fg/30 bg-allergy-fg/10 text-label rounded-sm border px-2 py-0.5 font-semibold"
            >
              {allergy}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

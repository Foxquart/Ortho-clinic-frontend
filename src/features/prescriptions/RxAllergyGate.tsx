import { useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Input'
import type { AllergyConflict, RxPatient } from './model'

/* -------------------------------------------------------------------------- */
/*  The standing allergy record                                                */
/* -------------------------------------------------------------------------- */

export type AllergyRecordStatus = 'loading' | 'known' | 'unknown'

/**
 * What we know about this patient's allergies, above the medicine list, before
 * anything is prescribed.
 *
 * Three states, and the difference between the last two is the whole point:
 * "no allergies recorded" is a checked, empty list on a real record. "Not
 * known" is a walk-in created thirty seconds ago whose history nobody has
 * asked for yet. Rendering those the same way is how an allergy gets missed.
 */
export function RxAllergyRecord({
  patient,
  status,
}: {
  patient: RxPatient
  status: AllergyRecordStatus
}) {
  const list = patient.allergies.map((a) => a.trim()).filter(Boolean)

  if (list.length > 0) {
    return (
      <section
        aria-labelledby="rx-allergy-record"
        className="flex items-start gap-3 rounded-lg bg-allergy px-4 py-3 text-allergy-fg shadow-sm"
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <h2 id="rx-allergy-record" className="text-micro uppercase opacity-80">
            Allergies on record — {list.length}
          </h2>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {list.map((allergy) => (
              <li
                key={allergy}
                className="rounded-sm border border-allergy-fg/30 bg-allergy-fg/10 px-2 py-0.5 text-label font-semibold"
              >
                {allergy}
              </li>
            ))}
          </ul>
        </div>
      </section>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
        <ShieldQuestion aria-hidden className="size-4 shrink-0 text-text-subtle" />
        <p className="text-caption text-text-muted">Checking allergy history…</p>
      </div>
    )
  }

  if (status === 'unknown') {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-warning/40 bg-warning-muted px-3 py-2">
        <ShieldQuestion aria-hidden className="size-4 shrink-0 text-warning" />
        <p className="text-caption text-text">
          <strong className="font-medium">No allergy history yet.</strong> This is not the same as
          “no allergies” — ask before prescribing an NSAID.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
      <ShieldCheck aria-hidden className="size-4 shrink-0 text-success" />
      <p className="text-caption text-text-muted">
        No known allergies recorded for this patient.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  The conflict banner                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A prescribed medicine matches a recorded allergy.
 *
 * Solid fill, full width, directly above the medicines, `aria-live="assertive"`
 * — the one thing in this app allowed to shout. Not dismissible, not
 * collapsible; it goes away when the conflict does, or when the doctor records
 * an override with a reason.
 */
export function RxAllergyConflictBanner({
  conflicts,
  acknowledgedReason,
  onAcknowledge,
  onRevoke,
  onFocusRow,
}: {
  conflicts: readonly AllergyConflict[]
  acknowledgedReason: string | null
  onAcknowledge: (reason: string) => void
  onRevoke: () => void
  onFocusRow: (rowKey: string) => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  if (conflicts.length === 0) return null

  return (
    <>
      <section
        role="alert"
        aria-live="assertive"
        aria-labelledby="rx-allergy-conflict"
        className="rounded-lg bg-allergy px-4 py-3 text-allergy-fg shadow-md"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id="rx-allergy-conflict" className="text-label font-semibold">
              Allergy —{' '}
              {conflicts.length === 1
                ? 'one prescribed medicine conflicts'
                : `${conflicts.length} prescribed medicines conflict`}{' '}
              with this patient&rsquo;s record
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
              {conflicts.map((conflict) => (
                <li key={`${conflict.rowKey}-${conflict.allergy}`}>
                  <button
                    type="button"
                    onClick={() => onFocusRow(conflict.rowKey)}
                    className="rounded-sm text-left text-body underline decoration-allergy-fg/40 underline-offset-4 hover:decoration-allergy-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-allergy-fg"
                  >
                    <strong className="font-semibold">{conflict.medicineName}</strong> — patient is
                    recorded as allergic to “{conflict.allergy}”
                  </button>
                </li>
              ))}
            </ul>

            {acknowledgedReason ? (
              <div className="mt-3 rounded-md border border-allergy-fg/30 bg-allergy-fg/10 px-3 py-2">
                <p className="text-caption font-semibold uppercase opacity-80">
                  Override recorded
                </p>
                <p className="mt-0.5 text-body">{acknowledgedReason}</p>
                <p className="mt-1 text-caption opacity-90">
                  This is saved with the prescription and printed on nothing — it lives in the
                  internal notes.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRevoke}
                  className="mt-1.5 -ml-2 text-allergy-fg hover:bg-allergy-fg/15 hover:text-allergy-fg"
                >
                  Withdraw the override
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  className="border-allergy-fg/40 bg-allergy-fg/10 text-allergy-fg hover:bg-allergy-fg/20"
                >
                  Prescribe anyway…
                </Button>
                <p className="text-caption opacity-90">
                  Printing is blocked until you remove the medicine or give a reason.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <AcknowledgeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        conflicts={conflicts}
        onConfirm={(reason) => {
          onAcknowledge(reason)
          setDialogOpen(false)
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  The override                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The override is a `danger` button behind a required free-text reason, never
 * a checkbox (DESIGN.md §7). A checkbox can be cleared by muscle memory; a
 * sentence cannot be written by accident.
 */
function AcknowledgeDialog({
  open,
  onOpenChange,
  conflicts,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: readonly AllergyConflict[]
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const ready = reason.trim().length >= 4

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('')
        onOpenChange(next)
      }}
    >
      <DialogContent
        title="Prescribe against a recorded allergy"
        description="This is written into the prescription's internal notes with your name on it."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!ready}
              onClick={() => onConfirm(reason.trim())}
              iconLeft={<ShieldAlert className="size-4" />}
            >
              Record override and continue
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5 rounded-md bg-allergy-muted px-3 py-2.5">
            {conflicts.map((conflict) => (
              <li key={`${conflict.rowKey}-${conflict.allergy}`} className="text-body text-text">
                <strong className="font-semibold">{conflict.medicineName}</strong> vs. recorded
                allergy “{conflict.allergy}”
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rx-allergy-reason"
              className="text-micro uppercase text-text-muted"
            >
              Why is this safe for this patient?
            </label>
            <Textarea
              id="rx-allergy-reason"
              rows={3}
              maxLength={500}
              autoFocus
              value={reason}
              placeholder="—"
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-caption text-text-subtle">
              A few words is enough — “tolerated ibuprofen at last visit, allergy was to
              aspirin”. Removing the medicine instead is always available.
            </p>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}

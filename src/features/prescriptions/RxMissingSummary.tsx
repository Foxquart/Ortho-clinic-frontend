import { useState } from 'react'
import { CheckCircle2, ChevronDown, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { describeIssue, issueFieldId, issueSection } from './padState'
import type { RowIssue, RxDraft } from './model'

const VISIBLE = 3

/**
 * What is standing between this draft and a printed prescription.
 *
 * A greyed-out button that will not say why is the single most common way to
 * strand someone in a form. This is the opposite: every blocker is named in
 * the doctor's language, and every one of them is a button that takes them to
 * the exact control that fixes it. The list is always on screen — you should
 * never have to press Print to discover what Print wants.
 */
export function RxMissingSummary({
  issues,
  draft,
  allergyBlocked,
  patientChosen,
  onFocus,
  onResolveAllergy,
}: {
  issues: readonly RowIssue[]
  draft: RxDraft
  /** An unacknowledged allergy conflict is blocking the print. */
  allergyBlocked: boolean
  /** False before anyone has been chosen or started being added. */
  patientChosen: boolean
  onFocus: (fieldId: string) => void
  onResolveAllergy: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  // Before a patient exists at all, "First name needed / Last name needed /
  // Phone number needed" is three ways of saying one thing the doctor has not
  // got to yet. Collapse them until they have committed to a walk-in.
  const shown = patientChosen
    ? issues
    : issues.filter((issue) => issueSection(issue) !== 'patient')

  const entries: { key: string; label: string; fieldId: string }[] = []

  if (!patientChosen) {
    entries.push({ key: 'patient', label: 'No patient chosen', fieldId: 'rx-patient' })
  }
  for (const issue of shown) {
    entries.push({
      key: `${issue.rowKey}-${issue.field}-${issue.message}`,
      label: describeIssue(issue, draft),
      fieldId: issueFieldId(issue),
    })
  }

  if (entries.length === 0 && !allergyBlocked) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-success">
        <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
        Everything needed is filled in. Ready to print.
      </p>
    )
  }

  const visible = expanded ? entries : entries.slice(0, VISIBLE)
  const hidden = entries.length - visible.length

  return (
    <div aria-live="polite" className="flex min-w-0 flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-caption font-medium text-provenance-blank">
        <span
          aria-hidden
          className="inline-block size-2.5 shrink-0 rounded-xs border border-dashed border-provenance-blank"
        />
        {entries.length > 0
          ? `${entries.length} thing${entries.length === 1 ? '' : 's'} still needed before printing`
          : 'One thing to settle before printing'}
      </p>

      <ul className="flex flex-wrap items-center gap-1.5">
        {allergyBlocked && (
          <li>
            <button
              type="button"
              onClick={onResolveAllergy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm bg-allergy px-2 py-0.5',
                'text-caption font-medium text-allergy-fg',
                'transition-opacity duration-instant ease-standard hover:opacity-90',
              )}
            >
              <ShieldAlert aria-hidden className="size-3 shrink-0" />
              Allergy conflict not acknowledged
            </button>
          </li>
        )}

        {visible.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              onClick={() => onFocus(entry.fieldId)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm border border-dashed border-provenance-blank',
                'bg-provenance-blank-muted px-2 py-0.5 text-caption text-text',
                'transition-colors duration-instant ease-standard',
                'hover:border-accent hover:bg-accent-muted hover:text-accent-muted-fg',
              )}
            >
              {entry.label}
            </button>
          </li>
        ))}

        {(hidden > 0 || expanded) && entries.length > VISIBLE && (
          <li>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              iconRight={
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-transform duration-fast ease-standard',
                    expanded && 'rotate-180',
                  )}
                />
              }
            >
              {expanded ? 'Show fewer' : `${hidden} more`}
            </Button>
          </li>
        )}
      </ul>
    </div>
  )
}

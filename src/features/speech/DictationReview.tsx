import { CircleDashed, Clock, Pill, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Table, TD, TH, THead, TR } from '@/components/ui/Table'
import { cn } from '@/lib/cn'
import { describeSchedule } from './parser'
import type { ParsedDictation, ParsedRow } from './parser'
import { DICTATION_HINTS } from './vocabulary'

const FOOD_LABEL = {
  before: 'before food',
  after: 'after food',
  with: 'with food',
} as const

/**
 * What the parser made of the dictation, before any of it reaches the pad.
 *
 * The design rule here is the same one that governs the pad itself: a value
 * that was never spoken renders visibly blank, not as a plausible default. A
 * doctor scanning this table must be able to see, in one pass, exactly which
 * cells they still have to fill.
 */
export function DictationReview({ parsed }: { parsed: ParsedDictation }) {
  const hasNarrative =
    parsed.diagnosis !== null ||
    parsed.chiefComplaint !== null ||
    parsed.advice !== null ||
    parsed.investigations !== null ||
    parsed.followUpDays !== null

  const nothing = parsed.rows.length === 0 && !hasNarrative && parsed.unparsed.length === 0

  if (nothing) return <DictationHints />

  return (
    <div className="flex flex-col gap-4">
      {parsed.rows.length > 0 ? (
        <Table>
          <THead>
            <TH width="30%">Medicine</TH>
            <TH width="16%">Dose</TH>
            <TH width="16%">Timing</TH>
            <TH width="12%">Days</TH>
            <TH>Notes</TH>
          </THead>
          <tbody>
            {parsed.rows.map((row, index) => (
              <RxPreviewRow key={`${row.spokenName}-${index}`} row={row} />
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-caption text-text-muted flex items-center gap-2">
          <Pill aria-hidden className="size-4" />
          No medicines were recognised in this dictation.
        </p>
      )}

      {hasNarrative && (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <NarrativeRow label="Complaint" value={parsed.chiefComplaint} />
          <NarrativeRow label="Diagnosis" value={parsed.diagnosis} />
          <NarrativeRow label="Investigations" value={parsed.investigations} />
          <NarrativeRow label="Advice" value={parsed.advice} />
          <NarrativeRow
            label="Follow-up"
            value={parsed.followUpDays === null ? null : `in ${parsed.followUpDays} days`}
          />
        </dl>
      )}

      {parsed.unparsed.length > 0 && <UnparsedNotice lines={parsed.unparsed} />}
    </div>
  )
}

function RxPreviewRow({ row }: { row: ParsedRow }) {
  const notes = [
    row.food ? FOOD_LABEL[row.food] : null,
    row.prn ? 'as needed' : null,
    row.instructions,
  ].filter((part): part is string => part !== null && part !== '')

  return (
    <TR>
      <TD>
        <span className="prov-heard block pl-2">
          <span className="text-label text-text font-medium">{row.spokenName}</span>
          <span className="text-caption text-text-subtle mt-0.5 block">“{row.sourceText}”</span>
        </span>
      </TD>
      <TD>
        <Cell value={row.dosage} mono />
      </TD>
      <TD>
        <Cell value={row.schedule ? describeSchedule(row.schedule) : null} mono />
      </TD>
      <TD>
        <Cell value={row.durationDays === null ? null : String(row.durationDays)} mono />
      </TD>
      <TD>
        {notes.length > 0 ? (
          <span className="text-caption text-text-muted">{notes.join(' · ')}</span>
        ) : (
          <Cell value={null} />
        )}
      </TD>
    </TR>
  )
}

/**
 * A value, or the absence of one.
 *
 * Blank is graphite and dashed, never red: nothing is wrong — the doctor
 * simply has not said it yet. Colouring it as an error teaches the eye to
 * ignore red, which is where real errors live (DESIGN.md §7).
 */
function Cell({ value, mono = false }: { value: string | null; mono?: boolean }) {
  if (value === null || value === '') {
    return (
      <span
        data-provenance="blank"
        className="text-caption text-text-subtle prov-blank inline-flex items-center gap-1 px-1.5 py-0.5"
      >
        <CircleDashed aria-hidden className="size-3" />
        not said
      </span>
    )
  }
  return (
    <span
      data-provenance="heard"
      data-numeric={mono || undefined}
      className={cn('text-label text-text prov-heard inline-block pl-2', mono && 'font-mono')}
    >
      {value}
    </span>
  )
}

function NarrativeRow({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null
  return (
    <>
      <dt className="text-micro text-text-subtle tracking-caps uppercase sm:pt-0.5">{label}</dt>
      <dd className="text-body text-text prov-heard mb-1 pl-2">{value}</dd>
    </>
  )
}

/**
 * Everything the parser could not place.
 *
 * This is not an error state and it is not hidden behind a disclosure. The
 * doctor said these words out loud; the system's failure to categorise them is
 * the system's problem, and the only honest response is to show them.
 */
function UnparsedNotice({ lines }: { lines: readonly string[] }) {
  return (
    <div className="border-warning/25 bg-warning-muted rounded-md border px-3 py-2">
      <p className="text-caption text-warning-muted-fg flex items-center gap-2 font-medium">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        Heard, but not understood
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`} className="text-caption text-warning-muted-fg">
            “{line}”
          </li>
        ))}
      </ul>
      <p className="text-caption text-warning-muted-fg mt-1.5">
        These went nowhere structured. They travel to the pad as notes so nothing you said is
        lost.
      </p>
    </div>
  )
}

/** What to say, shown before the first recording and after an empty one. */
export function DictationHints() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-muted flex items-center gap-2">
        <Clock aria-hidden className="size-4 shrink-0" />
        Speak the whole prescription in one go. Chain medicines with “and” — the parser splits
        them.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {DICTATION_HINTS.map((hint) => (
          <div key={hint.title} className="bg-surface-raised rounded-md px-3 py-2">
            <p className="text-micro text-text-subtle tracking-caps uppercase">{hint.title}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {hint.examples.map((example) => (
                <li key={example} className="text-caption text-text-muted font-mono">
                  {example}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-caption text-text-subtle">
        Nothing is filled in on your behalf. If you do not say a timing,{' '}
        <Badge tone="neutral">not said</Badge> is what the pad receives — and it blocks printing
        until you set it.
      </p>
    </div>
  )
}

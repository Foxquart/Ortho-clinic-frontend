import { cn } from '@/lib/cn'
import { formatDate, humanizeEnum } from '@/lib/format'
import { patientName, type FieldState, type RxDraft, type RxRow } from './model'

/**
 * The printed sheet, live, next to the pad.
 *
 * There is no compile step and no preview button: this reads the same draft
 * state the editors write into, so the page redraws on the keystroke. The point
 * is that the doctor never has to guess what the paper will say — the pad and
 * the paper are the same object seen twice.
 *
 * It mirrors `prescription_print.html` on the API side (A4 page on a sunken
 * ground, clinic line left and a large `Rx` right, a bordered patient box,
 * uppercase section headings, a bordered medicines block with a filled header)
 * so the preview is honest about the output rather than a prettier fiction.
 *
 * Purely presentational: props in, elements out. No state, no effects, no
 * clock, no DOM access — every value on the page came from the draft.
 */

/* -------------------------------------------------------------------------- */
/*  Paper                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Paper has no dark mode. Everything AROUND the page is themed with the app's
 * tokens; the page itself pins the LIGHT theme's values, because it is a
 * picture of a laser-printed A4 sheet and that sheet is white at midnight too.
 *
 * These are not new colours — they are `--c-surface`, `--c-text`,
 * `--c-text-muted`, `--c-text-subtle`, `--c-surface-hover`, `--c-border` and
 * `--c-accent` as the light theme defines them, frozen. They are declared here
 * rather than read from `var(--color-*)` precisely because those flip.
 */
const PAPER = {
  '--paper': '#fffdf8',
  '--paper-tint': '#f4efe4',
  '--paper-ink': '#100d0b',
  '--paper-ink-muted': '#443f38',
  '--paper-ink-subtle': '#544f48',
  '--paper-rule': '#e6e0d2',
  '--paper-accent': '#0f5c56',
} as React.CSSProperties

const INK = 'text-[color:var(--paper-ink)]'
const INK_MUTED = 'text-[color:var(--paper-ink-muted)]'
const INK_SUBTLE = 'text-[color:var(--paper-ink-subtle)]'
const ACCENT = 'text-[color:var(--paper-accent)]'
const RULE = 'border-[color:var(--paper-rule)]'

/* -------------------------------------------------------------------------- */
/*  Reading the draft                                                          */
/* -------------------------------------------------------------------------- */

/** Tolerant of a field that does not exist yet on an older draft shape. */
function text(field: FieldState<string> | undefined): string {
  return field?.value?.trim() ?? ''
}

/**
 * `98` -> `98 %`, but `98%` and `120/80` are left alone. The doctor may or may
 * not type the unit; the sheet should not print it twice.
 */
function withUnit(value: string, unit: string): string {
  return /[a-z%]/i.test(value) ? value : `${value} ${unit}`
}

interface Vital {
  label: string
  value: string
}

function vitalsOf(draft: RxDraft): Vital[] {
  const bp = text(draft.vitalsBp)
  const spo2 = text(draft.vitalsSpo2)
  const pulse = text(draft.vitalsPulse)
  const weight = text(draft.vitalsWeight)

  const vitals: Vital[] = []
  if (bp) vitals.push({ label: 'BP', value: bp })
  if (spo2) vitals.push({ label: 'SpO₂', value: withUnit(spo2, '%') })
  if (pulse) vitals.push({ label: 'HR', value: pulse })
  if (weight) vitals.push({ label: 'Wt', value: withUnit(weight, 'kg') })
  return vitals
}

/** The advice box is written `(1) (2) (3)` on his pad — one line, one number. */
function adviceLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * The one compact line under a medicine name. Deliberately assembled the same
 * way `toApiItem` assembles what it sends: PRN, max-per-day and food timing
 * have no backend fields, so they ride along in the instructions text and they
 * must appear on the preview exactly as they will appear on the paper.
 */
function medicineDetail(row: RxRow): string {
  const parts: string[] = []

  const dosage = text(row.dosage)
  if (dosage) parts.push(dosage)

  const frequency = text(row.frequency)
  if (frequency) parts.push(frequency)

  const days = row.durationDays?.value
  if (typeof days === 'number' && days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)

  const instructions = text(row.instructions)
  if (instructions) parts.push(instructions)

  if (row.food) parts.push(`${row.food} food`)
  if (row.prn) parts.push(row.maxPerDay ? `PRN, max ${row.maxPerDay}/day` : 'PRN (as needed)')
  else if (row.maxPerDay) parts.push(`max ${row.maxPerDay}/day`)

  return parts.join(' · ')
}

/* -------------------------------------------------------------------------- */
/*  Page furniture                                                             */
/* -------------------------------------------------------------------------- */

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className={cn('text-micro uppercase', ACCENT)}>{children}</h3>
}

/** A section that is always on the sheet, blank or not. */
function Section({ title, value }: { title: string; value: string }) {
  return (
    <section className="mt-2.5">
      <Heading>{title}</Heading>
      {value ? (
        <p className={cn('mt-0.5 text-label font-normal break-words whitespace-pre-wrap', INK)}>
          {value}
        </p>
      ) : (
        <p className={cn('mt-0.5 text-label font-normal', INK_SUBTLE)}>—</p>
      )}
    </section>
  )
}

/** A section that only exists when it was written. Absent means absent. */
function OptionalSection({ title, value }: { title: string; value: string }) {
  if (!value) return null
  return <Section title={title} value={value} />
}

/* -------------------------------------------------------------------------- */
/*  The preview                                                                */
/* -------------------------------------------------------------------------- */

export function RxLivePreview({
  draft,
  age,
  gender,
}: {
  draft: RxDraft
  /** Patient age in years, already computed. Null when unknown. */
  age: number | null
  /** Patient gender as stored, e.g. 'male'. Null when unknown. */
  gender: string | null
}): React.ReactElement {
  const name = patientName(draft.patient)
  const identity = [age === null ? '' : `${age} y`, gender ? humanizeEnum(gender) : '']
    .filter(Boolean)
    .join(' · ')
  const allergies = (draft.patient.allergies ?? []).map((a) => a.trim()).filter(Boolean)

  const vitals = vitalsOf(draft)
  const advice = adviceLines(text(draft.advice))
  // A row the doctor started but has not named yet is not a prescription line.
  const rows = (draft.rows ?? []).filter((row) => row.medicineName.trim() !== '')

  const followUp = text(draft.followUpDate)

  return (
    /*
     * A11Y: the whole sheet is hidden from assistive technology, on purpose.
     *
     * Every string on it is a verbatim echo of a form control the user is
     * sitting in — the value, the label and the ordering are all already
     * reachable, and reading them a second time (on every keystroke, since this
     * re-renders live) would double the length of the form for a screen-reader
     * user while adding no information. There is nothing here that is not over
     * there. It is also inert by construction: no focusable elements, so it
     * cannot be tabbed into by accident.
     *
     * `aria-label` is therefore deliberately NOT set — a label on an
     * `aria-hidden` subtree is dead markup, and pretending otherwise would just
     * be decoration. If this pane ever grows something the form does not carry
     * (a print-time warning, a page-count), that thing must be announced from
     * the FORM side, not by unhiding this.
     */
    <aside
      aria-hidden="true"
      data-rx-preview
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-bg-sunken p-4"
    >
      {/* Grid parent: an aspect-ratio'd grid item keeps its automatic minimum
          size, so the page holds true A4 proportions while it is short and
          simply grows taller once the prescription outruns one page. */}
      <div className="mx-auto grid w-full max-w-[210mm]">
        <article
          style={PAPER}
          className={cn(
            'flex aspect-[210/297] flex-col rounded-sm bg-[color:var(--paper)] px-[6.6%] py-[5.7%] shadow-md',
            INK,
          )}
        >
          {/* -- Letterhead ------------------------------------------------- */}
          <header
            className={cn(
              'flex items-end justify-between gap-4 border-b-2 border-b-[color:var(--paper-accent)] pb-2',
            )}
          >
            <div className="min-w-0">
              <p className={cn('text-heading font-semibold break-words', ACCENT)}>Prescription</p>
              <p className={cn('text-caption font-normal', INK_SUBTLE)}>
                Clinic letterhead is added when this prints
              </p>
            </div>
            <p className={cn('text-display leading-none tracking-[0.08em]', ACCENT)}>Rx</p>
          </header>

          <div className={cn('mt-2 flex justify-between gap-4 text-caption font-normal', INK_SUBTLE)}>
            <span>Rx no. —</span>
            <span>Date —</span>
          </div>

          {/* -- Patient, with the vitals hard right ------------------------ */}
          <div
            className={cn(
              'mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-md border bg-[color:var(--paper-tint)] px-3 py-2',
              RULE,
            )}
          >
            <div className="min-w-0">
              <p className="text-body font-semibold break-words">
                {name || <span className={INK_SUBTLE}>—</span>}
                {identity && (
                  <span className={cn('ml-2 text-label font-normal', INK_MUTED)}>{identity}</span>
                )}
              </p>
              {draft.patient.phone.trim() && (
                <p className={cn('numeric text-caption font-normal', INK_MUTED)}>
                  {draft.patient.phone.trim()}
                </p>
              )}
              {allergies.length > 0 && (
                <p className={cn('mt-0.5 text-caption font-medium break-words', INK)}>
                  <span className="uppercase">Allergic to:</span> {allergies.join(', ')}
                </p>
              )}
            </div>

            {vitals.length > 0 && (
              <dl className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
                {vitals.map((vital) => (
                  <div key={vital.label} className="flex items-baseline gap-1">
                    <dt className={cn('text-caption font-normal', INK_SUBTLE)}>{vital.label}</dt>
                    <dd className={cn('numeric text-label font-semibold break-words', INK)}>
                      {vital.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* -- The clinical body ------------------------------------------ */}
          <Section title="C/O" value={text(draft.chiefComplaint)} />
          <Section title="Clinical note" value={text(draft.notes)} />
          <Section title="Diagnosis" value={text(draft.diagnosis)} />
          <OptionalSection title="Investigations" value={text(draft.investigations)} />

          {/* -- Instructions, numbered the way his pad numbers them --------- */}
          <section className="mt-2.5">
            <Heading>Instructions</Heading>
            {advice.length === 0 ? (
              <p className={cn('mt-0.5 text-label font-normal', INK_SUBTLE)}>—</p>
            ) : (
              <ol className="mt-0.5 space-y-0.5">
                {advice.map((line, index) => (
                  <li key={`${index}-${line}`} className="flex gap-1.5">
                    <span className={cn('numeric shrink-0 text-label font-normal', INK_MUTED)}>
                      ({index + 1})
                    </span>
                    <span className={cn('min-w-0 text-label font-normal break-words', INK)}>
                      {line}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* -- Medicines ---------------------------------------------------
              The print template rules this as a real table. A preview pane is
              a fraction of A4 wide, and six columns at that width turn every
              instruction into a one-word-per-line column — so the box, the
              rules, the filled header and the zebra survive, but each line
              stacks the name over its dose rather than splitting into columns
              that cannot hold text. */}
          <section className="mt-3">
            <div className={cn('overflow-hidden rounded-sm border', RULE)}>
              <div className="flex items-baseline justify-between gap-2 bg-[color:var(--paper-accent)] px-2 py-1 text-micro uppercase text-[color:var(--paper)]">
                <span>Medicines</span>
                <span className="text-right">Dose · Frequency · Duration</span>
              </div>

              {rows.length === 0 ? (
                <p className={cn('px-2 py-2 text-label font-normal', INK_SUBTLE)}>
                  No medicines yet.
                </p>
              ) : (
                rows.map((row, index) => {
                  const detail = medicineDetail(row)
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        'flex gap-2 border-t px-2 py-1.5',
                        RULE,
                        index % 2 === 1 && 'bg-[color:var(--paper-tint)]',
                      )}
                    >
                      <span
                        className={cn('numeric w-5 shrink-0 text-right text-label', INK_MUTED)}
                      >
                        {index + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-label font-semibold break-words', INK)}>
                          {row.medicineName.trim()}
                        </p>
                        {detail ? (
                          <p className={cn('text-caption font-normal break-words', INK_MUTED)}>
                            {detail}
                          </p>
                        ) : (
                          <p className={cn('text-caption font-normal', INK_SUBTLE)}>—</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* -- The tail: only what was actually written -------------------- */}
          <OptionalSection title="Procedure" value={text(draft.procedure)} />
          <OptionalSection title="Consult" value={text(draft.consult)} />

          {followUp && (
            <p className={cn('mt-3 text-label font-semibold break-words', INK)}>
              Follow up: {formatDate(followUp, followUp)}
            </p>
          )}

          {/* -- Signature, bottom right ------------------------------------ */}
          <div className="mt-auto flex justify-end pt-8">
            <div className="w-48 max-w-full text-right">
              <div className={cn('h-8 border-b', RULE)} />
              <p className={cn('mt-1 text-label font-medium', INK_MUTED)}>Signature</p>
              <p className={cn('text-caption font-normal break-words', INK_SUBTLE)}>
                Name, qualifications and Reg. No. are printed here
              </p>
            </div>
          </div>
        </article>
      </div>
    </aside>
  )
}

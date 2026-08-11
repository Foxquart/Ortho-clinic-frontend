import { useEffect, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Skeleton } from '@/components/ui/Feedback'
import { BENGALI_FONT_STACK } from './translation'
import type { TranscriptLine, TranslationLine } from './useSpeechStream'

/**
 * Grid template for one transcript row. The first track is the line-number
 * gutter; it is what makes the English↔Bengali pairing explicit rather than
 * implied, and it survives both wrapping and the stacked layout.
 *
 * Narrow: [gutter | text] with the Bengali cell on a second grid row.
 * Wide:   [gutter | English | Bengali] on one grid row, tops aligned.
 */
const ROW_GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 md:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)]'

const SINGLE_ROW_GRID = 'grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2'

export function DualTranscript({
  finals,
  partial,
  translations,
  translateEnabled,
  translationsPossible,
  recording,
}: {
  finals: readonly TranscriptLine[]
  partial: string
  translations: Record<number, TranslationLine>
  /** Whether *this* stream asked for translation. Off ⇒ one column, not an empty one. */
  translateEnabled: boolean
  /** While true, a line with no translation is still in flight. */
  translationsPossible: boolean
  recording: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [finals.length, partial])

  const empty = finals.length === 0 && !partial
  const grid = translateEnabled ? ROW_GRID : SINGLE_ROW_GRID

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-label="Live transcript"
      className="scrollbar-subtle border-border bg-bg text-body max-h-96 min-h-40 overflow-y-auto rounded-md border leading-relaxed"
    >
      {/* Sticky header so the column a line belongs to is readable after
          scrolling past the top of a long dictation. */}
      <div className={cn(grid, 'z-sticky border-border bg-bg sticky top-0 border-b px-2 py-1.5')}>
        <span aria-hidden />
        <span className="text-micro text-text-subtle uppercase">English · spoken</span>
        {/* Below `md` the grid is two columns, so a third child wraps onto a
            new row starting in the gutter column. It is redundant there anyway:
            each row labels its own Bengali cell (see TranscriptRow's md:hidden
            label) because the two languages stack rather than sit side by side. */}
        {translateEnabled && (
          <span className="text-micro text-text-subtle hidden uppercase md:block md:pl-3">
            Bengali · translated
          </span>
        )}
      </div>

      {empty ? (
        <p className="text-text-subtle px-3 py-3">
          {recording
            ? 'Listening…'
            : translateEnabled
              ? // Layout-neutral: the two languages sit side by side on wide
                // screens and stack on narrow ones, so no directional wording.
                'Press Start recording and speak English. Settled lines appear in solid type, each paired with its Bengali translation; text still being revised appears greyed and is never translated.'
              : 'Press Start recording and speak. Settled text appears in solid type; text still being revised appears greyed.'}
        </p>
      ) : (
        <div>
          {finals.map((line) => (
            <TranscriptRow
              key={line.sequence}
              grid={grid}
              sequence={line.sequence}
              english={line.text}
              translateEnabled={translateEnabled}
              translation={translations[line.sequence]}
              translationsPossible={translationsPossible}
            />
          ))}

          {/* Partials are re-sent and rewritten as the speaker continues, so
              they must never look as settled as final text — and they are
              never translated, because the text they would translate is about
              to change. */}
          {partial && (
            <div className={cn(grid, 'border-border border-t px-2 py-1.5')}>
              <span
                aria-hidden
                className="text-caption text-text-subtle pt-0.5 text-right font-mono"
              >
                ·
              </span>
              <p lang="en" className="text-text-subtle min-w-0 italic">
                {partial}
              </p>
              {translateEnabled && (
                <p className="text-caption text-text-subtle md:border-border min-w-0 md:border-l md:pl-3">
                  Translated once the line settles.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TranscriptRow({
  grid,
  sequence,
  english,
  translateEnabled,
  translation,
  translationsPossible,
}: {
  grid: string
  sequence: number
  english: string
  translateEnabled: boolean
  translation: TranslationLine | undefined
  translationsPossible: boolean
}) {
  return (
    <div
      className={cn(
        grid,
        'border-border duration-instant hover:bg-surface-hover border-t px-2 py-1.5 transition-colors',
      )}
    >
      {/* The line number is the key, shown once for the pair. Two cells that
          carry the same number are the same utterance — no guessing, even when
          one side wraps to three lines and the other to one. */}
      <span
        aria-hidden
        data-numeric
        className="text-caption text-text-subtle pt-0.5 text-right font-mono"
      >
        {sequence + 1}
      </span>

      <p lang="en" className="text-text min-w-0 whitespace-pre-wrap">
        {english}
      </p>

      {translateEnabled && (
        <div className="md:border-border min-w-0 md:border-l md:pl-3">
          <span className="text-micro text-text-subtle mb-0.5 block uppercase md:hidden">
            Bengali
          </span>
          <BengaliCell translation={translation} translationsPossible={translationsPossible} />
        </div>
      )}
    </div>
  )
}

function BengaliCell({
  translation,
  translationsPossible,
}: {
  translation: TranslationLine | undefined
  translationsPossible: boolean
}) {
  if (translation?.status === 'done') {
    return (
      <p
        lang="bn"
        className="text-text whitespace-pre-wrap"
        // Scoped to this cell only: `--font-sans` carries Devanagari, not
        // Bengali, and this appends to it rather than replacing it.
        style={{ fontFamily: BENGALI_FONT_STACK }}
      >
        {translation.text}
      </p>
    )
  }

  if (translation?.status === 'failed') {
    // Quiet on purpose. One line failing to translate is not an error the
    // doctor caused or can fix, and the dictation is still running.
    return (
      <p
        className="text-caption text-text-subtle flex items-start gap-1.5"
        title={translation.message}
      >
        <TriangleAlert aria-hidden className="text-warning mt-0.5 size-3.5 shrink-0" />
        <span className="line-clamp-2">
          Not translated{translation.message ? ` — ${translation.message}` : '.'}
        </span>
      </p>
    )
  }

  if (translationsPossible) {
    return (
      <>
        <Skeleton className="h-3 w-2/3" />
        <span className="sr-only">Translating…</span>
      </>
    )
  }

  return <p className="text-caption text-text-subtle">No translation was returned for this line.</p>
}

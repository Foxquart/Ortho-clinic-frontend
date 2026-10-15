import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import type { TranscriptLine } from './useSpeechStream'

/** Grid template for one transcript row: a line-number gutter, then the text. */
const ROW_GRID = 'grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2'

export function DualTranscript({
  finals,
  partial,
  recording,
}: {
  finals: readonly TranscriptLine[]
  partial: string
  recording: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [finals.length, partial])

  const empty = finals.length === 0 && !partial

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-label="Live transcript"
      className="scrollbar-subtle border-border bg-bg text-body max-h-96 min-h-40 overflow-y-auto rounded-md border leading-relaxed"
    >
      {/* Sticky header so the column stays labelled after scrolling past the
          top of a long dictation. */}
      <div className={cn(ROW_GRID, 'z-sticky border-border bg-bg sticky top-0 border-b px-2 py-1.5')}>
        <span aria-hidden />
        <span className="text-micro text-text-subtle uppercase">English · spoken</span>
      </div>

      {empty ? (
        <p className="text-text-subtle px-3 py-3">
          {recording
            ? 'Listening…'
            : 'Press Start recording and speak. Settled text appears in solid type; text still being revised appears greyed.'}
        </p>
      ) : (
        <div>
          {finals.map((line) => (
            <TranscriptRow key={line.sequence} sequence={line.sequence} english={line.text} />
          ))}

          {/* Partials are re-sent and rewritten as the speaker continues, so
              they must never look as settled as final text. */}
          {partial && (
            <div className={cn(ROW_GRID, 'border-border border-t px-2 py-1.5')}>
              <span
                aria-hidden
                className="text-caption text-text-subtle pt-0.5 text-right font-mono"
              >
                ·
              </span>
              <p lang="en" className="text-text-subtle min-w-0 italic">
                {partial}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TranscriptRow({ sequence, english }: { sequence: number; english: string }) {
  return (
    <div
      className={cn(
        ROW_GRID,
        'border-border duration-instant hover:bg-surface-hover border-t px-2 py-1.5 transition-colors',
      )}
    >
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
    </div>
  )
}

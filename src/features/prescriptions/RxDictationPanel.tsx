import { useEffect, useRef } from 'react'
import { Ear, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { RxPrescriptionMic } from './RxMic'

/**
 * Dictation, held where the doctor can see it.
 *
 * Two things live here, and both exist because the alternative is losing
 * words the doctor actually said:
 *
 *  - **The live transcript.** Chunks land here as they settle. The pad does not
 *    rewrite fields under the doctor mid-sentence; they read it, then press
 *    "Place in the fields" and watch it happen once, deliberately.
 *  - **Unplaced lines.** Whatever the parser could not turn into a field —
 *    from this recording or from a hand-off — stays verbatim until it is
 *    deliberately filed into advice or notes, or deliberately discarded.
 */
export function RxDictationPanel({
  transcript,
  placing = false,
  lines,
  autoStart,
  onCapture,
  onPlace,
  onClearTranscript,
  onFile,
  onDiscard,
}: {
  transcript: string
  /** True while the AI is reading the transcript into the fields. */
  placing?: boolean
  lines: readonly string[]
  /** Arrived with `?dictate=1` — start listening without a click. */
  autoStart: boolean
  onCapture: (text: string) => void
  onPlace: () => void
  onClearTranscript: () => void
  onFile: (text: string, destination: 'advice' | 'notes') => void
  onDiscard: (index: number) => void
}) {
  const micHost = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  // `?dictate=1` means "start now". The engine owns its own start/stop, so the
  // honest way to trigger it from outside is to press its button.
  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true
    const timer = window.setTimeout(() => {
      micHost.current?.querySelector('button')?.click()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [autoStart])

  const hasSomething = transcript.trim() !== '' || lines.length > 0

  return (
    <Card>
      <CardHeader
        title="Dictation"
        description={
          hasSomething
            ? 'Said out loud, not yet on the prescription.'
            : 'Speak the whole prescription. What can be placed goes to a field; the rest waits here.'
        }
        action={
          <div ref={micHost}>
            <RxPrescriptionMic onText={onCapture} />
          </div>
        }
      />

      {hasSomething && (
        <CardBody className="flex flex-col gap-3">
          {transcript.trim() !== '' && (
            <div className="rounded-lg border border-provenance-heard/40 bg-provenance-heard-muted p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-micro uppercase text-provenance-heard">
                <Ear aria-hidden className="size-3" />
                Transcript
              </p>
              <p
                aria-live="polite"
                className="whitespace-pre-wrap text-body leading-relaxed text-text"
              >
                {transcript}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onPlace}
                  loading={placing}
                  iconLeft={<Wand2 className="size-4" />}
                >
                  {placing ? 'Reading what you said' : 'Place in the fields'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClearTranscript}>
                  Discard the transcript
                </Button>
                <p className="text-caption text-text-subtle">
                  Everything placed is marked “heard” and stays yours to correct.
                </p>
              </div>
            </div>
          )}

          {lines.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-micro uppercase text-text-subtle">
                Not placed in any field — {lines.length}
              </p>
              <ul className="flex flex-col gap-1.5">
                {lines.map((line, index) => (
                  <li
                    key={`${index}-${line}`}
                    className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-surface px-2.5 py-2"
                  >
                    <p className="min-w-40 flex-1 text-body text-text">{line}</p>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onFile(line, 'advice')}>
                        To advice
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onFile(line, 'notes')}>
                        To notes
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Discard “${line}”`}
                        onClick={() => onDiscard(index)}
                      >
                        <X aria-hidden className="size-3.5" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  )
}

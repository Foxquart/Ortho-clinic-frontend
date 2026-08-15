import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Eraser, Mic, Square, TriangleAlert, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import type { StreamStatus } from './useSpeechStream'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Surface'
import { ErrorState } from '@/components/ui/Feedback'
import { LevelMeter } from './LevelMeter'
import { DictationReview } from './DictationReview'
import { TranscriptionLab } from './TranscriptionLab'
import { useDictation } from './useDictation'
import { isEmptyDictation } from './parser'
import { useDictationAnalysis } from './extract'
import type { UseDictationAnalysis } from './extract'
import { writeDictationHandoff } from './handoff'
import { ENGLISH_ASR_LANGUAGE } from './translation'
import type { SpeechConfig } from './translation'

/**
 * The hand-off key, re-exported from `./handoff` so it can be imported from
 * either place. Defined once, in one module, because the prescription pad
 * reads it and a second copy of the string is a bug waiting to happen.
 */
export { DICTATION_HANDOFF_KEY } from './handoff'

/**
 * Dictate a prescription.
 *
 * This screen used to be a transcription lab: it turned speech into text and
 * stopped there, which made it a demo rather than a tool. Speech is how
 * prescriptions get written in this clinic, so the text now goes somewhere —
 * it is parsed into rows, shown as rows, and handed to the pad.
 *
 * The lab is still here, behind a disclosure, because "what language did the
 * server actually hear?" remains a real question when something goes wrong. It
 * is a diagnostic now, not the main event.
 */
export function SpeechScreen() {
  const navigate = useNavigate()
  const config = useQuery({
    queryKey: qk.speech.config(),
    queryFn: () => apiGet<SpeechConfig>(endpoints.speech.config),
    staleTime: 5 * 60_000,
  })

  const sampleRate = config.data?.sample_rate_hz ?? 16000

  /**
   * The settled transcript, editable.
   *
   * It is screen state rather than the hook's, for two reasons: a second
   * recording must add to the first rather than replace it, and a misheard
   * brand name is far quicker to correct here than row by row on the pad.
   */
  const [transcript, setTranscript] = useState('')
  const [labOpen, setLabOpen] = useState(false)

  const dictation = useDictation({
    sampleRate,
    // Settled chunks only. A partial is a hypothesis and never lands here.
    onFinal: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (message) => toast.error(message),
  })

  /**
   * The local parse renders instantly; the model's supersedes it once the
   * recording stops. Analysis is held off while `recording` is true — reading a
   * half-finished sentence wastes a call and produces rows the doctor is about
   * to contradict.
   */
  const analysis = useDictationAnalysis(transcript, {
    available: config.data?.extraction_available ?? false,
    enabled: !dictation.isRecording,
  })
  const parsed = analysis.parsed

  /**
   * What the transcript held before the current recording started. Discarding
   * has to actually discard: chunks that already landed in the box are rolled
   * back, not left behind for the doctor to delete by hand.
   */
  const beforeRecording = useRef('')

  const beginDictation = () => {
    beforeRecording.current = transcript
    void dictation.start({ kind: 'prescription' })
  }

  const discardRecording = () => {
    setTranscript(beforeRecording.current)
    dictation.cancel()
  }

  const recording = dictation.isRecording
  const busy = recording || dictation.status === 'connecting' || dictation.status === 'closing'
  const nothingToSend = isEmptyDictation(parsed) && parsed.unparsed.length === 0

  const send = () => {
    if (nothingToSend) {
      toast.error('There is nothing in this transcript to put on a prescription yet.')
      return
    }
    if (!writeDictationHandoff(parsed)) {
      toast.error('The browser would not hold the dictation. Copy the transcript instead.')
      return
    }
    navigate('/prescriptions/new')
  }

  return (
    <div className="max-w-content mx-auto flex flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Dictate a prescription"
        description="Say the whole thing — complaints, diagnosis, medicines, advice, follow-up. It becomes prescription rows you check and sign. Nothing is filled in on your behalf."
      />

      {config.isError && <ErrorState error={config.error} onRetry={() => config.refetch()} />}

      <Card>
        <CardHeader
          title="Say it"
          description={`English (${ENGLISH_ASR_LANGUAGE}) · ${config.data?.provider ?? '—'} · ${sampleRate} Hz`}
        />
        <CardBody className="flex flex-col gap-4">
          {/* The record control is THE control on this screen. It stays one
              size in both states so nothing jumps when recording starts. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {recording ? (
              <Button
                variant="danger"
                size="lg"
                className="h-12 px-5"
                onClick={dictation.stop}
                iconLeft={<Square className="size-5" />}
              >
                Stop recording
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="h-12 px-5"
                onClick={beginDictation}
                loading={dictation.status === 'connecting'}
                disabled={config.isPending}
                iconLeft={<Mic className="size-5" />}
              >
                Start dictating
              </Button>
            )}
            <StatusLine status={dictation.status} recording={recording} />
            <LevelMeter level={dictation.level} active={recording} />
            {recording && (
              <Button variant="secondary" className="ml-auto" onClick={discardRecording}>
                Discard this recording
              </Button>
            )}
          </div>
          <p className="text-caption text-text-subtle">
            Not translated. Not stored anywhere until you send it.
          </p>

          {dictation.error && (
            <p
              role="alert"
              className="border-danger/25 bg-danger-muted text-label text-danger flex items-start gap-2 rounded-md border px-3 py-2.5"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {dictation.error}
            </p>
          )}

          {/* The live hypothesis, kept visually apart from the settled text it
              is about to replace. */}
          <p
            aria-live="polite"
            className={cn(
              'text-heading min-h-8 font-normal italic leading-relaxed',
              dictation.partial ? 'text-text-muted' : 'text-text-subtle',
            )}
          >
            {dictation.partial || (recording ? 'Listening…' : ' ')}
          </p>

          <label htmlFor="dictation-transcript" className="text-label text-text-muted">
            Transcript
          </label>
          <Textarea
            id="dictation-transcript"
            rows={5}
            className="text-heading font-normal leading-relaxed"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="tab zerodol SP one zero one for five days after food, cap myoril one at night for three days"
          />
          <p className="text-label text-text-muted font-normal">
            Editable. Correcting a misheard brand name here fixes the row below before it ever
            reaches the pad.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
            <Button
              variant="primary"
              size="lg"
              onClick={send}
              disabled={nothingToSend}
              iconLeft={<WandSparkles className="size-4" />}
            >
              Send to the prescription pad
            </Button>
            {parsed.rows.length > 0 && (
              <span className="text-label text-text-muted">
                {parsed.rows.length} {parsed.rows.length === 1 ? 'medicine' : 'medicines'} read from
                this transcript
              </span>
            )}
            <Button
              variant="secondary"
              className="ml-auto"
              onClick={() => {
                setTranscript('')
                dictation.reset()
              }}
              disabled={transcript === '' || busy}
              iconLeft={<Eraser className="size-4" />}
            >
              Clear the transcript
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What the pad will receive"
          description="Every value here was spoken. Anything you did not say stays blank and blocks printing until you set it."
        />
        <CardBody className="flex flex-col gap-3">
          <AnalysisBanner analysis={analysis} />
          <DictationReview parsed={parsed} />
        </CardBody>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setLabOpen((open) => !open)}
          aria-expanded={labOpen}
          aria-controls="transcription-lab"
          className={cn(
            'text-label text-text flex w-full items-center gap-2 px-4 py-3 text-left font-medium',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
            'hover:bg-surface-hover rounded-xl transition-colors duration-fast ease-standard',
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-4 transition-transform duration-fast ease-standard',
              labOpen && 'rotate-90',
            )}
          />
          Transcription settings
          <span className="text-caption text-text-subtle font-normal">
            language mode, Bengali translation, file comparison
          </span>
        </button>
        {labOpen && (
          <div id="transcription-lab" className="border-border border-t">
            <CardBody>
              <TranscriptionLab config={config.data} busy={busy} />
            </CardBody>
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * The one-glance answer to "is it recording right now?".
 *
 * A badge was too small for that question. This is body-size text next to the
 * record button, and it never disappears: when nothing is happening it says so
 * in words rather than going blank.
 */
function StatusLine({ status, recording }: { status: StreamStatus; recording: boolean }) {
  let dot = 'bg-border-strong'
  let ink = 'text-text-muted'
  let text = 'Not recording'
  if (recording) {
    dot = 'bg-danger animate-pulse motion-reduce:animate-none'
    ink = 'text-danger'
    text = 'Listening…'
  } else if (status === 'connecting') {
    dot = 'bg-info'
    ink = 'text-text'
    text = 'Connecting…'
  } else if (status === 'closing') {
    dot = 'bg-warning'
    ink = 'text-text'
    text = 'Processing…'
  } else if (status === 'error') {
    dot = 'bg-danger'
    ink = 'text-danger'
    text = 'Microphone error'
  }
  return (
    <p role="status" className={cn('text-body flex items-center gap-2 font-semibold', ink)}>
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', dot)} />
      {text}
    </p>
  )
}

/**
 * Which reading of the transcript is on screen, and how to get a better one.
 *
 * The local parser and the model are not equally trustworthy, so the source is
 * always stated rather than implied. When the model dropped a value it could
 * not find in the transcript, that is shown too — a model inventing things is
 * exactly what a doctor needs to know about.
 */
function AnalysisBanner({ analysis }: { analysis: UseDictationAnalysis }) {
  const { source, model, rejected, isAnalysing, modelError, available, reanalyse } = analysis

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isAnalysing ? (
          <Badge tone="info" dot>
            Reading it properly…
          </Badge>
        ) : source === 'model' ? (
          <Badge tone="success" dot>
            Read by {model?.split('/').pop()?.replace(':free', '') ?? 'the model'}
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Pattern matching only
          </Badge>
        )}

        {source === 'local' && available && !isAnalysing && (
          <span className="text-label text-text-muted font-normal">
            {modelError
              ? 'The model could not be reached, so this is the built-in parser.'
              : 'Stop dictating and this gets read by the model.'}
          </span>
        )}
        {!available && (
          <span className="text-label text-text-muted font-normal">
            No analysis model configured — this is the built-in parser, which only
            understands common notations.
          </span>
        )}

        {available && !isAnalysing && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => reanalyse({ reasoning: true })}
            iconLeft={<WandSparkles className="size-4" />}
          >
            Read it again, more carefully
          </Button>
        )}
      </div>

      {modelError && (
        <p className="text-label text-text-muted border-border rounded-md border px-3 py-2 font-normal">
          {modelError}
        </p>
      )}

      {rejected.length > 0 && (
        <div className="border-warning/25 bg-warning-muted rounded-md border px-3 py-2.5">
          <p className="text-label text-warning-muted-fg flex items-start gap-2 font-medium">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {rejected.length === 1
              ? 'One value was discarded because it was not in what you said'
              : `${rejected.length} values were discarded because they were not in what you said`}
          </p>
          <ul className="text-label text-text-muted mt-1 list-disc space-y-1 pl-9 font-normal">
            {rejected.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

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
          action={
            recording ? (
              <Button
                variant="danger"
                onClick={dictation.stop}
                iconLeft={<Square className="size-4" />}
              >
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={beginDictation}
                loading={dictation.status === 'connecting'}
                disabled={config.isPending}
                iconLeft={<Mic className="size-4" />}
              >
                Start dictating
              </Button>
            )
          }
        />
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={dictation.status} recording={recording} />
            <LevelMeter level={dictation.level} active={recording} />
            {recording && (
              <Button variant="ghost" size="sm" onClick={discardRecording}>
                Discard this recording
              </Button>
            )}
            <span className="text-caption text-text-subtle ml-auto">
              Not translated. Not stored anywhere until you send it.
            </span>
          </div>

          {dictation.error && (
            <p
              role="alert"
              className="border-danger/25 bg-danger-muted text-caption text-danger flex items-start gap-2 rounded-md border px-3 py-2"
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
              'text-body min-h-6 italic',
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
            rows={4}
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="tab zerodol SP one zero one for five days after food, cap myoril one at night for three days"
          />
          <p className="text-caption text-text-subtle">
            Editable. Correcting a misheard brand name here fixes the row below before it ever
            reaches the pad.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={send}
              disabled={nothingToSend}
              iconLeft={<WandSparkles className="size-4" />}
            >
              Send to the prescription pad
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTranscript('')
                dictation.reset()
              }}
              disabled={transcript === '' || busy}
              iconLeft={<Eraser className="size-4" />}
            >
              Clear
            </Button>
            {parsed.rows.length > 0 && (
              <span className="text-caption text-text-subtle ml-auto">
                {parsed.rows.length} {parsed.rows.length === 1 ? 'medicine' : 'medicines'} read from
                this transcript
              </span>
            )}
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

function StatusBadge({ status, recording }: { status: string; recording: boolean }) {
  if (recording && status === 'ready') {
    return (
      <Badge tone="danger" dot>
        Recording
      </Badge>
    )
  }
  switch (status) {
    case 'connecting':
      return <Badge tone="info">Connecting…</Badge>
    case 'ready':
      return <Badge tone="success">Connected</Badge>
    case 'closing':
      return <Badge tone="warning">Finishing…</Badge>
    case 'error':
      return <Badge tone="danger">Error</Badge>
    case 'closed':
      return <Badge tone="neutral">Finished</Badge>
    default:
      return <Badge tone="neutral">Ready</Badge>
  }
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
          <span className="text-caption text-text-subtle">
            {modelError
              ? 'The model could not be reached, so this is the built-in parser.'
              : 'Stop dictating and this gets read by the model.'}
          </span>
        )}
        {!available && (
          <span className="text-caption text-text-subtle">
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
        <p className="text-caption text-text-subtle border-border rounded-md border px-3 py-2">
          {modelError}
        </p>
      )}

      {rejected.length > 0 && (
        <div className="border-warning/25 bg-warning-muted rounded-md border px-3 py-2">
          <p className="text-caption text-warning-muted-fg flex items-start gap-2 font-medium">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {rejected.length === 1
              ? 'One value was discarded because it was not in what you said'
              : `${rejected.length} values were discarded because they were not in what you said`}
          </p>
          <ul className="text-caption text-text-muted mt-1 list-disc space-y-0.5 pl-9">
            {rejected.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

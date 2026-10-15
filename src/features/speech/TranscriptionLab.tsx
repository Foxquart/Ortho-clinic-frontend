import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Info, Mic, Square, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Controls'
import { useMicrophone } from './useMicrophone'
import { useSpeechStream } from './useSpeechStream'
import type { SpeechStreamOptions } from './useSpeechStream'
import { LevelMeter } from './LevelMeter'
import { DualTranscript } from './DualTranscript'
import { ComparisonLab } from './ComparisonLab'
import { ENGLISH_ASR_LANGUAGE } from './translation'
import type { SpeechConfig } from './translation'

/**
 * The transcription diagnostic.
 *
 * This is everything the Voice screen used to be: language selection, the
 * live transcript, and the recorded-file comparison lab. None
 * of it writes a prescription, and none of it is what a doctor opens this
 * screen to do — so it lives behind a disclosure now rather than in front of
 * the dictation control.
 *
 * It keeps its own socket and its own microphone. That is deliberate: the
 * dictation path pins `en-IN`, and folding these
 * settings into it would make a prescription's language depend on whichever
 * radio button someone last touched down here.
 */
export function TranscriptionLab({
  config,
  /** True while the main dictation control holds the microphone. */
  busy,
}: {
  config: SpeechConfig | undefined
  busy: boolean
}) {
  const [language, setLanguage] = useState<LiveLanguage>('english')
  const [session, setSession] = useState<StreamSession>({ language: 'english' })

  const stream = useSpeechStream()
  const [level, setLevel] = useState(0)
  const [copied, setCopied] = useState(false)

  const sampleRate = config?.sample_rate_hz ?? 16000

  const mic = useMicrophone({ sampleRate, onFrame: stream.sendAudio, onLevel: setLevel })

  const recording = mic.state === 'recording'

  const startRecording = useCallback(async () => {
    stream.reset()
    const started: StreamSession = { language }
    setSession(started)

    const options: SpeechStreamOptions = {}
    // Pinning and identification are mutually exclusive; `server` sends neither
    // and lets the server's own configuration decide.
    if (started.language === 'english') options.languageCode = ENGLISH_ASR_LANGUAGE
    if (started.language === 'auto') options.identifyMultipleLanguages = true

    try {
      await stream.connect(options)
      await mic.start()
    } catch (error) {
      stream.disconnect()
      const message = error instanceof Error ? error.message : 'Could not start the recording.'
      toast.error(message)
    }
  }, [mic, stream, language])

  const stopRecording = useCallback(() => {
    mic.stop()
    setLevel(0)
    stream.stop()
  }, [mic, stream])

  // Collapsing this section, or leaving the screen, releases the microphone.
  useEffect(() => {
    return () => {
      mic.stop()
      stream.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasEnglish = stream.finals.length > 0

  /** Only settled lines. Partials are still being revised and are never copied. */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stream.transcript)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('The browser would not give this page access to the clipboard.')
    }
  }

  // The language cannot be changed on an open socket — it is a query
  // parameter on the handshake. Rather than fake-disable the control, it
  // stays live and says plainly that it takes effect next time.
  const pendingChange = session.language !== language && (recording || stream.finals.length > 0)

  const negotiated = stream.negotiated

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-caption text-text-subtle max-w-prose">
          A diagnostic, not a prescription path. Nothing here reaches the pad — it exists to
          answer “what did the server actually hear, and in what language?”.
        </p>
        {recording ? (
          <Button
            variant="danger"
            size="sm"
            onClick={stopRecording}
            iconLeft={<Square className="size-4" />}
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void startRecording()}
            loading={mic.state === 'starting'}
            disabled={busy}
            iconLeft={<Mic className="size-4" />}
          >
            Record for comparison
          </Button>
        )}
      </div>

      {busy && !recording && (
        <p className="bg-surface-raised text-caption text-text-muted flex items-start gap-2 rounded-md px-3 py-2">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          One microphone, one socket. Stop the dictation above before recording here.
        </p>
      )}

      <LanguageControls
        language={language}
        onLanguage={setLanguage}
        config={config}
        pendingChange={pendingChange}
        recording={recording}
      />

      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-3">
        <StreamStatusBadge status={stream.status} recording={recording} />
        <LevelMeter level={level} active={recording} />
        {negotiated && (
          <span className="text-caption text-text-subtle ml-auto font-mono">
            {negotiated.identifyMultipleLanguages
              ? 'detecting'
              : (negotiated.languageCode ?? 'server default')}
          </span>
        )}
      </div>

      {mic.error && <InlineError message={mic.error.message} />}
      {stream.error && <InlineError message={stream.error} />}

      <DualTranscript finals={stream.finals} partial={stream.partial} recording={recording} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy()}
          disabled={!hasEnglish}
          iconLeft={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        >
          {copied ? 'Copied' : 'Copy transcript'}
        </Button>
        <p className="text-caption text-text-subtle ml-auto">
          Only settled lines are copied — partial text is still being revised.
        </p>
      </div>

      <ComparisonLab config={config} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Controls                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What the live socket should listen for. Defaults to English because
 * dictating English is the stated use case — the server's own default is a
 * different setting and is reported next to the control rather than silently
 * inherited.
 */
type LiveLanguage = 'english' | 'auto' | 'server'

/** The settings a running stream was actually started with. */
interface StreamSession {
  language: LiveLanguage
}

function LanguageControls({
  language,
  onLanguage,
  config,
  pendingChange,
  recording,
}: {
  language: LiveLanguage
  onLanguage: (value: LiveLanguage) => void
  config: SpeechConfig | undefined
  pendingChange: boolean
  recording: boolean
}) {
  const serverDefault = !config
    ? 'whatever the server reports'
    : config.identify_multiple_languages
      ? `detection among ${config.language_options.join(', ')}`
      : `${config.language_code ?? 'an unnamed language'}, with detection off`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-label text-text-muted">The stream listens for</span>
          <SegmentedControl<LiveLanguage>
            label="Live stream language"
            value={language}
            onChange={onLanguage}
            options={[
              { value: 'english', label: `English (${ENGLISH_ASR_LANGUAGE})` },
              { value: 'auto', label: 'Auto-detect' },
              { value: 'server', label: 'Server default' },
            ]}
          />
          <p className="text-caption text-text-subtle max-w-prose">
            Sent as a query parameter when the socket opens. “Server default” sends nothing and
            inherits what <code className="font-mono">/speech/config</code> reports — currently{' '}
            {serverDefault}.
          </p>
        </div>
      </div>

      {pendingChange && (
        <p className="border-warning/25 bg-warning-muted text-caption text-warning-muted-fg flex items-start gap-2 rounded-md border px-3 py-2">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {recording
            ? 'These are query parameters on the socket handshake, so this change applies to the next recording, not the one running now.'
            : 'These settings apply to the next recording. The transcript below is still showing the one you already made.'}
        </p>
      )}
    </div>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-danger/25 bg-danger-muted text-caption text-danger flex items-start gap-2 rounded-md border px-3 py-2"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  )
}

function StreamStatusBadge({ status, recording }: { status: string; recording: boolean }) {
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
      return <Badge tone="neutral">Idle</Badge>
  }
}

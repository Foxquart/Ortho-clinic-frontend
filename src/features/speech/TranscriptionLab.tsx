import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Info, Mic, Square, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SegmentedControl, Switch } from '@/components/ui/Controls'
import { useMicrophone } from './useMicrophone'
import { useSpeechStream } from './useSpeechStream'
import type { SpeechStreamOptions, TranslationLine } from './useSpeechStream'
import { LevelMeter } from './LevelMeter'
import { DualTranscript } from './DualTranscript'
import { ComparisonLab } from './ComparisonLab'
import { ENGLISH_ASR_LANGUAGE, formatPairedTranscript, TRANSLATION_TARGET } from './translation'
import type { PairedLine, SpeechConfig } from './translation'

/**
 * The transcription diagnostic.
 *
 * This is everything the Voice screen used to be: language selection, the
 * English/Bengali dual transcript, and the recorded-file comparison lab. None
 * of it writes a prescription, and none of it is what a doctor opens this
 * screen to do — so it lives behind a disclosure now rather than in front of
 * the dictation control.
 *
 * It keeps its own socket and its own microphone. That is deliberate: the
 * dictation path pins `en-IN` and refuses translation, and folding these
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
  const translationAvailable = config?.translation_available ?? false
  const translationTarget = config?.translation_target_languages?.[0] ?? TRANSLATION_TARGET

  const [language, setLanguage] = useState<LiveLanguage>('english')
  const [translate, setTranslate] = useState(true)
  const [session, setSession] = useState<StreamSession>({ language: 'english', translate: true })

  /**
   * The most recent thing the server said about translation, from either the
   * socket or `POST /speech/translate`. The disabled toggle quotes this instead
   * of inventing an explanation — `/speech/config` only reports the boolean.
   */
  const [translateError, setTranslateError] = useState<string | null>(null)

  const stream = useSpeechStream()
  const [level, setLevel] = useState(0)
  const [copied, setCopied] = useState<CopyTarget | null>(null)

  const sampleRate = config?.sample_rate_hz ?? 16000

  const mic = useMicrophone({ sampleRate, onFrame: stream.sendAudio, onLevel: setLevel })

  const recording = mic.state === 'recording'
  const translateRequested = translate && translationAvailable

  const startRecording = useCallback(async () => {
    stream.reset()
    setTranslateError(null)
    const started: StreamSession = { language, translate: translateRequested }
    setSession(started)

    const options: SpeechStreamOptions = {
      translateTo: started.translate ? translationTarget : null,
    }
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
  }, [mic, stream, language, translateRequested, translationTarget])

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

  // A scoped translation failure over the socket is the server explaining a
  // capability gap, in the same words the REST endpoint would use.
  useEffect(() => {
    if (stream.translationNotice) setTranslateError(stream.translationNotice)
  }, [stream.translationNotice])

  /** Only settled lines. Partials are still being revised and are never copied. */
  const pairedLines: PairedLine[] = stream.finals.map((line) => {
    const translation: TranslationLine | undefined = stream.translations[line.sequence]
    return {
      sequence: line.sequence,
      english: line.text,
      bengali: translation?.status === 'done' ? translation.text : null,
    }
  })

  const hasEnglish = pairedLines.length > 0
  const hasBengali = pairedLines.some((line) => line.bengali !== null)

  const copy = async (target: CopyTarget) => {
    const text =
      target === 'english'
        ? pairedLines.map((l) => l.english).join(' ')
        : target === 'bengali'
          ? pairedLines
              .map((l) => l.bengali)
              .filter((t): t is string => t !== null)
              .join(' ')
          : formatPairedTranscript(pairedLines)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(target)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      toast.error('The browser would not give this page access to the clipboard.')
    }
  }

  // Neither setting can be changed on an open socket — both are query
  // parameters on the handshake. Rather than fake-disable the controls, they
  // stay live and say plainly that they take effect next time.
  const settingsDiffer = session.language !== language || session.translate !== translateRequested
  const pendingChange = settingsDiffer && (recording || stream.finals.length > 0)

  /**
   * Whether the Bengali column is real for the transcript on screen.
   *
   * `ready.translate_to` is the server's confirmation and outranks what we
   * asked for — it comes back `null` when we requested translation and the
   * server could not provide it. Until `ready` lands we fall back to the
   * request, so the column does not appear and then flicker away.
   */
  const negotiated = stream.negotiated
  const translateActive = negotiated ? negotiated.translateTo !== null : session.translate
  const activeTarget = negotiated?.translateTo ?? translationTarget
  /** The server contradicted the request: we asked to translate, it will not. */
  const translationRefused = negotiated !== null && session.translate && !translateActive

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
        translate={translate}
        onTranslate={setTranslate}
        translationAvailable={translationAvailable}
        translationTarget={translationTarget}
        translateError={translateError}
        config={config}
        pendingChange={pendingChange}
        recording={recording}
      />

      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-3">
        <StreamStatusBadge status={stream.status} recording={recording} />
        <LevelMeter level={level} active={recording} />
        {translateActive && <Badge tone="accent">Translating to {activeTarget}</Badge>}
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

      {/* The server said no to a translation we asked for. It is not a broken
          recording — the English transcript below is unaffected — so it is
          stated once, here, in the server's own words rather than repeated
          into every Bengali cell. */}
      {translationRefused && stream.translationNotice && (
        <p
          role="status"
          className="border-warning/25 bg-warning-muted text-caption text-warning-muted-fg flex items-start gap-2 rounded-md border px-3 py-2"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-medium">This recording is not being translated</span>
            <span className="mt-0.5 block">{stream.translationNotice}</span>
            <span className="mt-0.5 block">
              Dictation itself is unaffected and the English transcript below is complete.
            </span>
          </span>
        </p>
      )}

      <DualTranscript
        finals={stream.finals}
        partial={stream.partial}
        translations={stream.translations}
        translateEnabled={translateActive}
        translationsPossible={stream.translationsPossible}
        recording={recording}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy('english')}
          disabled={!hasEnglish}
          iconLeft={copied === 'english' ? <Check className="size-4" /> : <Copy className="size-4" />}
        >
          {copied === 'english' ? 'Copied' : 'Copy English'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy('bengali')}
          disabled={!hasBengali}
          iconLeft={copied === 'bengali' ? <Check className="size-4" /> : <Copy className="size-4" />}
        >
          {copied === 'bengali' ? 'Copied' : 'Copy Bengali'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy('paired')}
          disabled={!hasEnglish}
          iconLeft={copied === 'paired' ? <Check className="size-4" /> : <Copy className="size-4" />}
        >
          {copied === 'paired' ? 'Copied' : 'Copy both, paired'}
        </Button>
        <p className="text-caption text-text-subtle ml-auto">
          Only settled lines are copied — partial text is still being revised.
        </p>
      </div>

      <ComparisonLab config={config} onTranslateError={setTranslateError} />
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
  translate: boolean
}

type CopyTarget = 'english' | 'bengali' | 'paired'

function LanguageControls({
  language,
  onLanguage,
  translate,
  onTranslate,
  translationAvailable,
  translationTarget,
  translateError,
  config,
  pendingChange,
  recording,
}: {
  language: LiveLanguage
  onLanguage: (value: LiveLanguage) => void
  translate: boolean
  onTranslate: (value: boolean) => void
  translationAvailable: boolean
  translationTarget: string
  translateError: string | null
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

        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <Switch
            id="translate-live"
            checked={translate && translationAvailable}
            onCheckedChange={onTranslate}
            disabled={!translationAvailable}
            label={`Translate to ${translationTarget}`}
          />
          {translationAvailable && translate && (
            <p className="text-caption text-text-subtle max-w-xs sm:text-right">
              Only settled lines are translated, and each arrives a moment after the English it
              came from.
            </p>
          )}
        </div>
      </div>

      {/* Full width, not tucked under the switch: the server's explanation for
          a missing provider names an IAM policy and runs to a couple of
          sentences. Cramming it into a right-aligned column would turn it into
          a ragged sliver exactly when someone needs to read it. */}
      {!translationAvailable && (
        <p className="bg-surface-raised text-caption text-text-muted flex items-start gap-2 rounded-md px-3 py-2">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="max-w-prose">
            {translateError ? (
              <>
                <span className="block font-medium">
                  Translation to {translationTarget} is unavailable
                </span>
                <span className="mt-0.5 block">{translateError}</span>
              </>
            ) : (
              <>
                <code className="font-mono">/speech/config</code> reports{' '}
                <code className="font-mono">translation_available: false</code> — the server has
                no translation provider configured, so {translationTarget} cannot be produced.
              </>
            )}
          </span>
        </p>
      )}

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

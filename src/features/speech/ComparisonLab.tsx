import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileAudio, Languages, TriangleAlert, Upload } from 'lucide-react'
import { apiPost } from '@/api/http'
import { toApiError } from '@/api/errors'
import { endpoints } from '@/api/endpoints'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import type { TranscriptionResponse } from '@/api/schema'
import {
  BENGALI_ASR_LANGUAGE,
  BENGALI_FONT_STACK,
  ENGLISH_ASR_LANGUAGE,
  isTranslationUnavailable,
  translateText,
  TRANSLATION_TARGET,
} from './translation'
import type { SpeechConfig } from './translation'

function transcribeFile(audio: File, languageCode: string) {
  const form = new FormData()
  form.append('audio', audio)
  return apiPost<TranscriptionResponse>(endpoints.speech.transcribe, form, {
    params: { language_code: languageCode },
  })
}

/**
 * The comparison that decides the production language setting.
 *
 * One recording, three results, side by side, because the interesting question
 * is not "does Bengali-pinned ASR work" — it does — but "is what it produces
 * Bengali". It is not: it is English, spelled phonetically in Bengali letters.
 * Putting the three in one row is the only way that stops being an abstract
 * claim, so the middle column is labelled as transliteration everywhere it
 * appears and never sits next to the word "translation" without a contrast.
 */
export function ComparisonLab({
  config,
  onTranslateError,
}: {
  config: SpeechConfig | undefined
  /** Lifted so the live translate toggle can quote the server's real words. */
  onTranslateError: (message: string | null) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const english = useMutation({
    mutationFn: (audio: File) => transcribeFile(audio, ENGLISH_ASR_LANGUAGE),
  })
  const bengaliAsr = useMutation({
    mutationFn: (audio: File) => transcribeFile(audio, BENGALI_ASR_LANGUAGE),
  })
  const translation = useMutation({
    mutationFn: (text: string) =>
      translateText(text, config?.translation_target_languages?.[0] ?? TRANSLATION_TARGET),
    onError: (error) => onTranslateError(toApiError(error).message),
    onSuccess: () => onTranslateError(null),
  })

  const running = english.isPending || bengaliAsr.isPending || translation.isPending

  function run(audio: File) {
    translation.reset()

    // The two ASR calls are independent and start together. Translation cannot
    // — it translates the English result — so it chains off that one call
    // rather than waiting for both. Rejections are caught because the mutation
    // state already records them; an uncaught `mutateAsync` would only add an
    // unhandled rejection on top.
    const asrEnglish = english
      .mutateAsync(audio)
      .then((result) => {
        const text = result.transcript.trim()
        return text ? translation.mutateAsync(text) : null
      })
      .catch(() => null)
    const asrBengali = bengaliAsr.mutateAsync(audio).catch(() => null)

    void Promise.allSettled([asrEnglish, asrBengali])
  }

  const englishEmpty = english.isSuccess && !english.data.transcript.trim()
  const started = english.isPending || english.isSuccess || english.isError

  return (
    <Card>
      <CardHeader
        title="Compare a recording"
        description="One file, three results. This is the comparison that decides which language the live stream should be pinned to."
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="audio/wav,audio/x-wav,audio/pcm,.wav,.pcm,.raw"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            iconLeft={<Upload className="size-4" />}
          >
            Choose file
          </Button>
          <span className="text-caption text-text-muted min-w-0 flex-1 truncate">
            {file ? (
              <span className="inline-flex items-center gap-1.5">
                <FileAudio aria-hidden className="size-3.5" />
                {file.name}
              </span>
            ) : (
              `Mono, 16-bit PCM at ${config?.sample_rate_hz ?? 16000} Hz. A mismatch is rejected rather than resampled.`
            )}
          </span>
          <Button
            variant="primary"
            disabled={!file}
            loading={running}
            onClick={() => file && run(file)}
          >
            Run comparison
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <LabCell
            eyebrow="English · ASR"
            code={ENGLISH_ASR_LANGUAGE}
            description="What the doctor actually said, in the script it was said in."
          >
            {english.isPending && <ResultSkeleton />}
            {english.isError && <ErrorState error={english.error} compact />}
            {english.isSuccess && <Transcript result={english.data} />}
            {!started && <Idle />}
          </LabCell>

          <LabCell
            eyebrow="Bengali script · ASR"
            code={BENGALI_ASR_LANGUAGE}
            description="The same English words, spelled phonetically in Bengali letters. The meaning is not carried across and drug names do not survive it."
            warning="Transliteration — not a translation"
          >
            {bengaliAsr.isPending && <ResultSkeleton />}
            {bengaliAsr.isError && <ErrorState error={bengaliAsr.error} compact />}
            {bengaliAsr.isSuccess && <Transcript result={bengaliAsr.data} bengali />}
            {!started && <Idle />}
          </LabCell>

          <LabCell
            eyebrow="Bengali · translation"
            code={`${ENGLISH_ASR_LANGUAGE.slice(0, 2)} → ${config?.translation_target_languages?.[0] ?? TRANSLATION_TARGET}`}
            description="Real Bengali, machine-translated from the English transcript in the first column."
          >
            {english.isPending && <WaitingOnEnglish />}
            {englishEmpty && (
              <p className="text-caption text-text-subtle">
                Nothing to translate — the English transcript was empty.
              </p>
            )}
            {english.isError && (
              <p className="text-caption text-text-subtle">
                Not run — the English transcript it translates never arrived.
              </p>
            )}
            {translation.isPending && <ResultSkeleton />}
            {translation.isError &&
              (isTranslationUnavailable(translation.error) ? (
                <TranslationUnavailable
                  error={translation.error}
                  onRetry={() =>
                    english.data?.transcript.trim() &&
                    translation.mutate(english.data.transcript.trim())
                  }
                />
              ) : (
                <ErrorState error={translation.error} compact />
              ))}
            {translation.isSuccess && (
              <>
                <p
                  lang="bn"
                  className="text-body text-text leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: BENGALI_FONT_STACK }}
                >
                  {translation.data.translated_text}
                </p>
                <p className="text-caption text-text-subtle mt-2">
                  {translation.data.provider} · {translation.data.source_language_code} →{' '}
                  {translation.data.target_language_code}
                </p>
              </>
            )}
            {!started && <Idle />}
          </LabCell>
        </div>

        {/* The prose is one flex child, not several. Left as bare text beside
            the icon, every text node and the <em> becomes its own flex item and
            the sentence breaks into gapped columns. */}
        <p className="bg-surface-raised text-caption text-text-muted flex items-start gap-2 rounded-md px-3 py-2">
          <Languages aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {/* Named, not positional: the three cells sit in a row on wide
              screens and stack on narrow ones, so "middle" and "right" stop
              being true. */}
          <span>
            Read <b className="font-medium">Bengali script</b> and{' '}
            <b className="font-medium">Bengali translation</b> together. Both are Bengali script;
            only the translation is Bengali <em>language</em>. Pinning the live stream to{' '}
            {BENGALI_ASR_LANGUAGE} produces the transliteration.
          </span>
        </p>
      </CardBody>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function LabCell({
  eyebrow,
  code,
  description,
  warning,
  children,
}: {
  eyebrow: string
  code: string
  description: string
  warning?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-border bg-bg-sunken flex min-w-0 flex-col rounded-md border">
      <header className="border-border flex flex-col gap-1.5 border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-micro text-text-muted uppercase">{eyebrow}</h3>
          <Badge tone="neutral" className="font-mono">
            {code}
          </Badge>
        </div>
        {warning && (
          <p className="border-warning/25 bg-warning-muted text-caption text-warning-muted-fg flex items-start gap-1.5 rounded-sm border px-2 py-1">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {warning}
          </p>
        )}
        <p className="text-caption text-text-subtle">{description}</p>
      </header>
      <div className="min-w-0 flex-1 px-3 py-2.5">{children}</div>
    </section>
  )
}

function Transcript({ result, bengali }: { result: TranscriptionResponse; bengali?: boolean }) {
  return (
    <>
      <p
        lang={bengali ? 'bn' : 'en'}
        className="text-body text-text leading-relaxed whitespace-pre-wrap"
        style={bengali ? { fontFamily: BENGALI_FONT_STACK } : undefined}
      >
        {result.transcript || (
          <span className="text-caption text-text-subtle">
            Nothing was transcribed from that audio.
          </span>
        )}
      </p>
      <p className="text-caption text-text-subtle mt-2 flex flex-wrap items-center gap-2">
        <span>{result.provider}</span>
        <span>{result.language_code ?? 'language unknown'}</span>
        {result.duration_seconds != null && (
          <span data-numeric>{result.duration_seconds.toFixed(1)}s</span>
        )}
        <span data-numeric>{result.chunks?.length ?? 0} chunks</span>
      </p>
    </>
  )
}

function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  )
}

function Idle() {
  return <p className="text-caption text-text-subtle">Choose a file and run the comparison.</p>
}

function WaitingOnEnglish() {
  return (
    <p className="text-caption text-text-subtle">
      Waiting for the English transcript this one translates…
    </p>
  )
}

/**
 * The upstream-failure path, and today it is the only path this cell takes.
 *
 * `POST /speech/translate` answers **502 `upstream_error`** both when the server
 * has no translation provider and when the cloud provider refuses — right now
 * the AWS credentials lack `translate:TranslateText`. That is a missing
 * capability, not a failed action: nothing the doctor did caused it, retrying
 * will not fix it today, and the two ASR columns beside this one are complete
 * and correct. So it reads as `warning` rather than as a red "something went
 * wrong", which would misreport all three of those facts.
 *
 * It also quotes `e.message` verbatim. The shared `ErrorState` recognises 502
 * but substitutes its own generic copy, and the server's message here is the
 * actionable one — it names the IAM policy an operator has to attach.
 */
function TranslationUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = toApiError(error)
  return (
    <div
      role="status"
      className={cn(
        'border-warning/25 bg-warning-muted flex flex-col gap-2 rounded-md border p-3',
        'text-caption text-warning-muted-fg',
      )}
    >
      <p className="flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block font-medium">Translation is not available</span>
          <span className="mt-0.5 block">
            The API answered {e.status || 'no response'}
            {e.code ? ` ${e.code}` : ''}: “{e.message}”
          </span>
        </span>
      </p>
      <p>
        The two transcripts beside this one are unaffected. This is a server-side capability, so it
        will keep answering this way until the translation provider is configured — nothing here is
        caused by the recording.
      </p>
      {e.correlationId && <p className="text-text-subtle font-mono">ref {e.correlationId}</p>}
      <div>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}

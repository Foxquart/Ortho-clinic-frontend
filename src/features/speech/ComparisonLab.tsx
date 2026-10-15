import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileAudio, TriangleAlert, Upload } from 'lucide-react'
import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import type { TranscriptionResponse } from '@/api/schema'
import {
  BENGALI_ASR_LANGUAGE,
  BENGALI_FONT_STACK,
  ENGLISH_ASR_LANGUAGE,
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
 * One recording, two results, side by side, because the interesting question
 * is not "does Bengali-pinned ASR work" — it does — but "is what it produces
 * Bengali". It is not: it is English, spelled phonetically in Bengali letters.
 * Putting the two side by side is the only way that stops being an abstract
 * claim, so the second column is labelled as transliteration everywhere it
 * appears.
 */
export function ComparisonLab({ config }: { config: SpeechConfig | undefined }) {
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const english = useMutation({
    mutationFn: (audio: File) => transcribeFile(audio, ENGLISH_ASR_LANGUAGE),
  })
  const bengaliAsr = useMutation({
    mutationFn: (audio: File) => transcribeFile(audio, BENGALI_ASR_LANGUAGE),
  })

  const running = english.isPending || bengaliAsr.isPending

  // The two ASR calls are independent and start together. `mutate` (not
  // `mutateAsync`) because the mutation state already records failures.
  function run(audio: File) {
    english.mutate(audio)
    bengaliAsr.mutate(audio)
  }

  const started = english.isPending || english.isSuccess || english.isError

  return (
    <Card>
      <CardHeader
        title="Compare a recording"
        description="One file, two results. This is the comparison that decides which language the live stream should be pinned to."
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

        <div className="grid gap-3 lg:grid-cols-2">
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
        </div>
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

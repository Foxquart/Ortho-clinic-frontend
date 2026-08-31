import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { errorMessage, toApiError } from '@/api/errors'
import type { ExtractedValue, ExtractionResponse } from '@/api/schema'
import { parseDictation } from './parser'
import type { ParsedDictation, ParsedRow } from './parser'
import type { DoseSchedule } from '@/features/prescriptions/model'
import type { FoodTiming } from './vocabulary'

/**
 * Two ways to read a prescription out of dictation, and a policy for choosing.
 *
 * The local parser is instant, free and offline, but only understands the
 * notations it was written for. The model reads what the doctor actually said —
 * out of order, mixed with narrative, with corrections mid-sentence — but costs
 * a round trip and can be unavailable.
 *
 * So: the local parse renders immediately as a preview, the model runs once the
 * transcript settles, and its result supersedes the preview when it lands. If
 * the model is unconfigured or fails, the preview simply stays. The doctor is
 * always told which one they are looking at, because the two are not equally
 * trustworthy and the difference must never be invisible.
 */

export type AnalysisSource = 'local' | 'model'

export interface DictationAnalysis {
  parsed: ParsedDictation
  source: AnalysisSource
  /** Model identifier, when the model produced this. */
  model?: string
  /**
   * Values the model claimed but could not ground in the transcript, dropped
   * server-side. Surfaced, never hidden.
   */
  rejected: string[]
  durationMs?: number
}

/** Unwrap `{ value, evidence }`, tolerating nulls from either side. */
function value<T>(field: ExtractedValue<T> | null | undefined): T | null {
  if (!field || field.value === null || field.value === undefined) return null
  return field.value
}

function text(field: ExtractedValue<string> | null | undefined): string | null {
  const raw = value(field)
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function schedule(
  field: ExtractedValue<{ m: number | null; a: number | null; n: number | null }> | null | undefined,
): DoseSchedule | null {
  const raw = value(field)
  if (!raw || typeof raw !== 'object') return null
  const slot = (n: unknown): number | null =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
  const next = { m: slot(raw.m), a: slot(raw.a), n: slot(raw.n) }
  // All-null is "nothing was said about frequency", which is the same as no
  // schedule at all — collapse it so the pad sees one blank state, not two.
  return next.m === null && next.a === null && next.n === null ? null : next
}

function food(
  field: ExtractedValue<'before' | 'after' | 'with'> | null | undefined,
): FoodTiming | null {
  const raw = value(field)
  return raw === 'before' || raw === 'after' || raw === 'with' ? raw : null
}

function days(field: ExtractedValue<number> | null | undefined): number | null {
  const raw = value(field)
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null
}

/** Map the API's snake_case envelope onto the shape the pad already consumes. */
export function toParsedDictation(response: ExtractionResponse): ParsedDictation {
  const rows: ParsedRow[] = (response.rows ?? [])
    .filter((row) => typeof row.spoken_name === 'string' && row.spoken_name.trim().length > 0)
    .map((row) => ({
      spokenName: row.spoken_name.trim(),
      schedule: schedule(row.schedule),
      durationDays: days(row.duration_days),
      food: food(row.food),
      prn: row.prn === true,
      instructions: text(row.instructions),
      sourceText: (row.source_text ?? '').trim(),
    }))

  return {
    rows,
    diagnosis: text(response.diagnosis),
    chiefComplaint: text(response.chief_complaint),
    advice: text(response.advice),
    investigations: text(response.investigations),
    followUpDays: days(response.follow_up_days),
    unparsed: (response.unparsed ?? []).map((u) => String(u).trim()).filter(Boolean),
  }
}

/**
 * Ask the model to read the transcript. Throws an `ApiError` — a 502 means
 * "fall back to the parser", not "the dictation was bad".
 */
export async function extractDictation(
  transcript: string,
  options: { reasoning?: boolean; signal?: AbortSignal } = {},
): Promise<DictationAnalysis> {
  const response = await apiPost<ExtractionResponse>(
    endpoints.speech.extract,
    { transcript, reasoning: options.reasoning ?? null },
    { signal: options.signal },
  )
  return {
    parsed: toParsedDictation(response),
    source: 'model',
    model: response.model,
    rejected: response.rejected ?? [],
    durationMs: response.duration_ms,
  }
}

export interface UseDictationAnalysis extends DictationAnalysis {
  /** True while the model is reading. The preview stays visible throughout. */
  isAnalysing: boolean
  /** Why the model result is unavailable. Null when it succeeded or was never asked. */
  modelError: string | null
  /** Whether the server says a model is configured at all. */
  available: boolean
  /** Re-run, optionally with reasoning enabled. */
  reanalyse: (options?: { reasoning?: boolean }) => void
}

/**
 * Local parse now, model parse shortly after.
 *
 * `enabled` should be false while recording is still in flight — analysing a
 * half-finished sentence wastes a call and produces rows the doctor is about to
 * contradict.
 */
export function useDictationAnalysis(
  transcript: string,
  { available, enabled }: { available: boolean; enabled: boolean },
): UseDictationAnalysis {
  const local = useMemo(() => parseDictation(transcript), [transcript])

  const [result, setResult] = useState<DictationAnalysis | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  // Which transcript the current result belongs to, so a stale model answer
  // never sits on top of newer words.
  const analysedRef = useRef<string | null>(null)

  const run = useCallback(
    (text: string, reasoning?: boolean) => {
      const trimmed = text.trim()
      if (!trimmed) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsAnalysing(true)
      setModelError(null)
      analysedRef.current = trimmed

      extractDictation(trimmed, { reasoning, signal: controller.signal })
        .then((analysis) => {
          if (controller.signal.aborted) return
          setResult(analysis)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          const apiError = toApiError(error)
          // A cancelled request is not a failure worth reporting.
          if (apiError.code === 'network_error' && controller.signal.aborted) return
          setResult(null)
          setModelError(errorMessage(error))
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsAnalysing(false)
        })
    },
    [],
  )

  useEffect(() => {
    const trimmed = transcript.trim()
    if (!available || !enabled || !trimmed) return
    if (analysedRef.current === trimmed) return
    run(trimmed)
  }, [transcript, available, enabled, run])

  // Drop a model result the moment the transcript moves on from it.
  useEffect(() => {
    if (result && analysedRef.current !== transcript.trim()) {
      setResult(null)
    }
  }, [transcript, result])

  useEffect(() => () => abortRef.current?.abort(), [])

  const reanalyse = useCallback(
    (options?: { reasoning?: boolean }) => {
      analysedRef.current = null
      run(transcript, options?.reasoning)
    },
    [run, transcript],
  )

  return {
    parsed: result?.parsed ?? local,
    source: result ? 'model' : 'local',
    model: result?.model,
    rejected: result?.rejected ?? [],
    durationMs: result?.durationMs,
    isAnalysing,
    modelError,
    available,
    reanalyse,
  }
}

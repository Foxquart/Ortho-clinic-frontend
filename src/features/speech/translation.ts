import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { toApiError } from '@/api/errors'
import type { SpeechConfigResponse, TranslationResponse } from '@/api/schema'

/**
 * `GET /speech/config`. The two translation fields are optional in the schema,
 * because a server predating the translation work answers without them — and
 * "absent" reads exactly like `false`: there is no translation provider.
 */
export type SpeechConfig = SpeechConfigResponse

/** 200 body of `POST /speech/translate`. */
export type TranslateResponse = TranslationResponse

export const ENGLISH_ASR_LANGUAGE = 'en-IN'
export const BENGALI_ASR_LANGUAGE = 'bn-IN'
export const TRANSLATION_SOURCE = 'en'
export const TRANSLATION_TARGET = 'bn'

/* -------------------------------------------------------------------------- */
/*  Fonts                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Bengali is a different script from Devanagari, and `--font-sans` only carries
 * the latter — so Bengali text set in the app font renders as tofu on most
 * machines. This stack is scoped to Bengali cells and appended to (never
 * replaces) the app stack, which it picks up verbatim through `var(--font-sans)`.
 *
 * Every entry is a *system* font, in the order the platforms ship them: the
 * Noto names on Linux/Android, Nirmala UI on Windows, Bangla MN / Kohinoor on
 * macOS and iOS, then the common third-party faces a clinic machine may already
 * have. There is deliberately no `@font-face` and no CDN link — this app has to
 * keep working when the clinic's line drops.
 */
export const BENGALI_FONT_STACK =
  "'Noto Sans Bengali', 'Noto Sans Bengali UI', 'Noto Serif Bengali', 'Nirmala UI', " +
  "'Bangla MN', 'Bangla Sangam MN', 'Kohinoor Bangla', Vrinda, 'Shonar Bangla', " +
  'SolaimanLipi, Kalpurush, var(--font-sans)'

/* -------------------------------------------------------------------------- */
/*  Requests                                                                   */
/* -------------------------------------------------------------------------- */

export function translateText(
  text: string,
  target: string = TRANSLATION_TARGET,
  source: string = TRANSLATION_SOURCE,
): Promise<TranslateResponse> {
  return apiPost<TranslateResponse>(endpoints.speech.translate, {
    text,
    source_language_code: source,
    target_language_code: target,
  })
}

/**
 * True for the one failure that is a *capability* problem rather than a bug:
 * the server has no translation provider, or the cloud provider refused the
 * call. The backend raises `UpstreamError` for both, which maps to **502
 * `upstream_error`** — and today it always will, because the AWS credentials
 * are missing `translate:TranslateText`.
 *
 * It is worth separating from a generic failure because nothing the doctor did
 * caused it, retrying will not fix it, and the rest of the screen is unaffected.
 * `ErrorState` recognises this status too, but it replaces the server's message
 * with its own generic copy — and the server's message here is the actionable
 * one, naming the exact IAM policy an operator has to attach. So this screen
 * renders the case itself rather than throwing that away.
 */
export function isTranslationUnavailable(error: unknown): boolean {
  const e = toApiError(error)
  return e.status === 502 || e.code === 'upstream_error'
}

/* -------------------------------------------------------------------------- */
/*  Copy formatting                                                            */
/* -------------------------------------------------------------------------- */

export interface PairedLine {
  sequence: number
  english: string
  /** `null` when the line was never translated — pending, failed, or off. */
  bengali: string | null
}

/**
 * Paired copy keeps the mapping the screen shows. Prefixes rather than columns,
 * because the destination is usually a plain-text note where columns collapse.
 */
export function formatPairedTranscript(lines: readonly PairedLine[]): string {
  return lines
    .map((line) => `EN  ${line.english}\nBN  ${line.bengali ?? '(no translation returned)'}`)
    .join('\n\n')
}

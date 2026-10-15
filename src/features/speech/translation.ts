import type { SpeechConfigResponse } from '@/api/schema'

/** `GET /speech/config`. */
export type SpeechConfig = SpeechConfigResponse

export const ENGLISH_ASR_LANGUAGE = 'en-IN'
export const BENGALI_ASR_LANGUAGE = 'bn-IN'

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

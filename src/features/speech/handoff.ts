import type { ParsedDictation } from './parser'

/**
 * Where a parsed dictation waits while the doctor is being navigated to the
 * prescription pad.
 *
 * `sessionStorage` rather than router state on purpose: the pad has to survive
 * a reload with the hand-off intact, and a route param cannot carry an object.
 * The pad reads this key exactly once and removes it, so a refresh after the
 * doctor has started correcting rows cannot replay the transcript over their
 * edits.
 *
 * The key and the payload shape are a contract with
 * `features/prescriptions/dictation.ts`. Neither changes without the other.
 */
export const DICTATION_HANDOFF_KEY = 'ortho:dictation-draft'

/** Returns false if the browser refused to store it (private mode, quota). */
export function writeDictationHandoff(parsed: ParsedDictation): boolean {
  try {
    window.sessionStorage.setItem(DICTATION_HANDOFF_KEY, JSON.stringify(parsed))
    return true
  } catch {
    return false
  }
}

export function clearDictationHandoff(): void {
  try {
    window.sessionStorage.removeItem(DICTATION_HANDOFF_KEY)
  } catch {
    // Nothing to do, and nothing worth telling anyone.
  }
}

/**
 * Pure helpers for the pad-layout editor: reordering, the default layout and
 * custom-section keys. No React, so they are testable. The section set, limits
 * and normalisation live in `usePadLayout.ts`; this only edits a draft of it.
 *
 * Relative import on purpose: bun tests do not resolve the `@/` alias.
 */
import { BUILTIN_SECTIONS, DEFAULT_PAD_LAYOUT, type PadLayoutSection } from './usePadLayout'

/** The server caps a slug at 40 chars; keep room for a `_NN` de-dup suffix. */
const MAX_SLUG = 40

export const defaultSections = (): PadLayoutSection[] =>
  DEFAULT_PAD_LAYOUT.sections.map((s) => ({ ...s }))

/** The label a built-in ships with, or undefined for a custom section. */
export const defaultLabel = (key: string): string | undefined =>
  BUILTIN_SECTIONS.find((s) => s.key === key)?.label

/** Swap a section with its neighbour. Out of range is a no-op. */
export function shift(
  list: readonly PadLayoutSection[],
  key: string,
  by: -1 | 1,
): PadLayoutSection[] {
  const i = list.findIndex((s) => s.key === key)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

/** Drop `key` just before (or after) `targetKey`. */
export function dropNear(
  list: readonly PadLayoutSection[],
  key: string,
  targetKey: string,
  after: boolean,
): PadLayoutSection[] {
  const moved = list.find((s) => s.key === key)
  if (!moved || key === targetKey) return [...list]
  const rest = list.filter((s) => s.key !== key)
  const at = rest.findIndex((s) => s.key === targetKey) + (after ? 1 : 0)
  return [...rest.slice(0, at), moved, ...rest.slice(at)]
}

/**
 * `custom:<slug>` for a new section, from its label. The slug is `[a-z0-9_]`
 * only (server rule), so a label with no latin letters falls back to `section`,
 * and a clash with `taken` gets `_2`, `_3`, …
 */
export function customKey(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, MAX_SLUG - 4) || 'section'
  let key = `custom:${base}`
  for (let n = 2; taken.includes(key); n++) key = `custom:${base}_${n}`
  return key
}

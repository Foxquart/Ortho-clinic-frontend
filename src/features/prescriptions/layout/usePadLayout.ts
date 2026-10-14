/**
 * The doctor's pad layout: which narrative sections the pad shows, in what
 * order, under what name, plus any sections he made up himself.
 *
 * Imports are relative on purpose — bun tests import this file and bun does
 * not resolve the `@/` alias.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from '../../../api/http'
import { endpoints } from '../../../api/endpoints'

export interface PadLayoutSection {
  /** A built-in key (see {@link BUILTIN_SECTIONS}) or `custom:<slug>`. */
  key: string
  /** What the pad and the printed page call it. 1..64 chars. */
  label: string
  visible: boolean
}

export interface PadLayout {
  /** Array order is the order on the pad and the printed page. Max {@link MAX_SECTIONS}. */
  sections: PadLayoutSection[]
}

/**
 * Patient, vitals and medicines are always shown and are not part of the layout.
 * Labels must match the API's defaults exactly: the printed page uses a
 * built-in's layout label only when it differs from the default.
 */
export const BUILTIN_SECTIONS = [
  { key: 'chief_complaint', label: 'Chief complaint' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'examination_findings', label: 'Examination findings' },
  { key: 'investigations', label: 'Investigations' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'consult', label: 'Consult' },
  { key: 'advice', label: 'Advice to the patient' },
  { key: 'notes', label: 'Internal notes' },
  { key: 'follow_up', label: 'Follow-up' },
] as const

export type BuiltinSectionKey = (typeof BUILTIN_SECTIONS)[number]['key']

export const MAX_SECTIONS = 30
export const MAX_LABEL = 64
/** `custom:<slug>`, slug `[a-z0-9_]{1,40}`. */
export const CUSTOM_KEY = /^custom:[a-z0-9_]{1,40}$/

const BUILTIN_LABEL = new Map<string, string>(BUILTIN_SECTIONS.map((s) => [s.key, s.label]))

export const isCustomKey = (key: string): boolean => key.startsWith('custom:')

/** Every built-in visible, default labels, default order. What the pad uses when no layout could be loaded. */
export const DEFAULT_PAD_LAYOUT: PadLayout = {
  sections: BUILTIN_SECTIONS.map((s) => ({ key: s.key, label: s.label, visible: true })),
}

/**
 * Coerce whatever the server (or a stale cache) hands back into a layout the
 * pad can render without further checks: unknown or duplicate keys and blank
 * custom labels are dropped, built-ins the layout forgot are appended visible,
 * and the whole thing is capped at {@link MAX_SECTIONS}. Never throws, and
 * never returns {@link DEFAULT_PAD_LAYOUT} itself.
 */
export function normalizeLayout(raw: unknown): PadLayout {
  const input = (raw as { sections?: unknown } | null | undefined)?.sections
  const seen = new Set<string>()
  const sections: PadLayoutSection[] = []

  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item !== 'object') continue
    const { key, label, visible } = item as Record<string, unknown>
    if (typeof key !== 'string' || seen.has(key)) continue
    const builtinLabel = BUILTIN_LABEL.get(key)
    if (builtinLabel === undefined && !CUSTOM_KEY.test(key)) continue
    const text = typeof label === 'string' ? label.trim().slice(0, MAX_LABEL) : ''
    if (!text && builtinLabel === undefined) continue
    seen.add(key)
    sections.push({ key, label: text || builtinLabel || '', visible: visible !== false })
  }

  for (const { key, label } of BUILTIN_SECTIONS) {
    if (!seen.has(key)) sections.push({ key, label, visible: true })
  }

  // Over the cap: shed custom sections from the end — built-ins must survive.
  while (sections.length > MAX_SECTIONS) {
    const last = sections.findLastIndex((s) => isCustomKey(s.key))
    if (last < 0) break
    sections.splice(last, 1)
  }

  return { sections }
}

/** Query key shared with the layout editor; the preview refetches when it is saved. */
export const PAD_LAYOUT_KEY = ['prescription-layout'] as const

/**
 * The saved layout. `data` is undefined while loading and after a failure —
 * callers fall back to {@link DEFAULT_PAD_LAYOUT} so a layout problem can never
 * stop a doctor from prescribing.
 */
export function usePadLayout() {
  return useQuery({
    queryKey: PAD_LAYOUT_KEY,
    queryFn: async () => normalizeLayout(await apiGet<unknown>(endpoints.prescriptionLayout)),
    staleTime: 5 * 60_000,
  })
}

/** `mutate(layout)`; the cache takes the server's normalised answer. */
export function useSavePadLayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (layout: PadLayout) =>
      normalizeLayout(await apiPut<unknown>(endpoints.prescriptionLayout, layout)),
    onSuccess: (saved) => {
      queryClient.setQueryData(PAD_LAYOUT_KEY, saved)
      // The printed page follows the saved layout, so the live preview must redraw.
      void queryClient.invalidateQueries({ queryKey: ['prescription-preview'] })
    },
  })
}

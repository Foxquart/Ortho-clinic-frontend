import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type {
  AdvicePresetCreate,
  AdvicePresetResponse,
  AdvicePresetUpdate,
  MessageResponse,
  UUID,
} from '@/api/schema'

/**
 * The admin listing always asks for inactive presets too — deactivation is the
 * recommended "delete", so the retired lines must stay visible and revivable.
 *
 * A 404 here is NOT an error to shout about: it means the backend predates the
 * advice library. The screen renders a calm explanatory state for it.
 */
export function useAdvicePresetList() {
  return useQuery({
    queryKey: qk.advicePresets.list(true),
    queryFn: () =>
      apiGet<AdvicePresetResponse[]>(endpoints.advicePresets.list, {
        params: { include_inactive: true },
      }),
  })
}

function useInvalidateAdvicePresets() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.advicePresets.all() })
  }
}

export function useCreateAdvicePreset() {
  const invalidate = useInvalidateAdvicePresets()
  return useMutation({
    mutationFn: (body: AdvicePresetCreate) =>
      apiPost<AdvicePresetResponse>(endpoints.advicePresets.create, body),
    onSuccess: invalidate,
  })
}

export function useUpdateAdvicePreset() {
  const invalidate = useInvalidateAdvicePresets()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: AdvicePresetUpdate }) =>
      apiPatch<AdvicePresetResponse>(endpoints.advicePresets.byId(id), body),
    onSuccess: invalidate,
  })
}

/** Hard delete — only ever behind an explicit confirm; deactivating is the default. */
export function useDeleteAdvicePreset() {
  const invalidate = useInvalidateAdvicePresets()
  return useMutation({
    mutationFn: (id: UUID) => apiDelete<MessageResponse>(endpoints.advicePresets.byId(id)),
    onSuccess: invalidate,
  })
}

/* -------------------------------------------------------------------------- */
/*  Grouping                                                                  */
/* -------------------------------------------------------------------------- */

export interface AdviceGroup {
  /** Stable key for React — the category, or `''` for the general group. */
  key: string
  /** What the doctor reads: the category, or "General" for uncategorised lines. */
  title: string
  presets: AdvicePresetResponse[]
}

/**
 * Groups by `category` (case-preserving, first spelling wins), alphabetical,
 * with the `null` category last as "General". Within a group: `sort_order`
 * ascending, ties broken by label so the order is stable.
 */
export function groupPresets(presets: readonly AdvicePresetResponse[]): AdviceGroup[] {
  const byCategory = new Map<string, AdviceGroup>()
  const general: AdviceGroup = { key: '', title: 'General', presets: [] }

  for (const preset of presets) {
    const category = preset.category?.trim() ?? ''
    if (category === '') {
      general.presets.push(preset)
      continue
    }
    const key = category.toLowerCase()
    let group = byCategory.get(key)
    if (!group) {
      group = { key, title: category, presets: [] }
      byCategory.set(key, group)
    }
    group.presets.push(preset)
  }

  const groups = [...byCategory.values()].sort((a, b) => a.title.localeCompare(b.title))
  if (general.presets.length > 0) groups.push(general)

  for (const group of groups) {
    group.presets.sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
    )
  }
  return groups
}

/** Distinct categories, for the add/edit form's datalist. */
export function categoriesOf(presets: readonly AdvicePresetResponse[]): string[] {
  const seen = new Map<string, string>()
  for (const preset of presets) {
    const category = preset.category?.trim()
    if (category) seen.set(category.toLowerCase(), category)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/ui/Controls'
import type { AdvicePresetResponse } from '@/api/schema'
import { blank, entered, type FieldState } from './model'

/** Presets whose `category` is null group under this heading, listed last. */
const GENERAL = 'General'

/**
 * The advice text is the only source of truth: a box is checked exactly when
 * the advice contains that preset's label as its own line. Hand edits in the
 * textarea therefore drive the boxes, never the other way round.
 */
function lineSet(value: string): Set<string> {
  return new Set(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

function appendLine(value: string, label: string): string {
  const existing = value.trimEnd()
  return existing ? `${existing}\n${label}` : label
}

function removeLine(value: string, label: string): string {
  return value
    .split('\n')
    .filter((line) => line.trim() !== label)
    .join('\n')
}

interface AdviceGroup {
  name: string
  presets: AdvicePresetResponse[]
}

/**
 * The doctor's reusable advice library, as tappable checkboxes above the
 * advice field. One tap adds a line; the doctor types nothing.
 *
 * Degrades to nothing: while the list is loading, when the backend does not
 * have the library yet (404), on any error, and when the library is empty,
 * this renders null and the plain advice textarea stands exactly as before.
 */
export function RxAdvicePicker({
  field,
  onChange,
}: {
  field: FieldState<string>
  onChange: (next: FieldState<string>) => void
}) {
  const presets = useQuery({
    queryKey: qk.advicePresets.list(false),
    queryFn: () => apiGet<AdvicePresetResponse[]>(endpoints.advicePresets.list),
    staleTime: 5 * 60_000,
  })

  /** The doctor's explicit open/close choices, by category name. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const groups = useMemo<AdviceGroup[]>(() => {
    const active = (presets.data ?? []).filter((p) => p.is_active)
    const sorted = [...active].sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
    )
    const byName = new Map<string, AdvicePresetResponse[]>()
    for (const preset of sorted) {
      const name = preset.category?.trim() || GENERAL
      const list = byName.get(name)
      if (list) list.push(preset)
      else byName.set(name, [preset])
    }
    // Categories keep their sort-order sequence; General always comes last.
    return [...byName.entries()]
      .sort(([a], [b]) => (a === GENERAL ? 1 : 0) - (b === GENERAL ? 1 : 0))
      .map(([name, list]) => ({ name, presets: list }))
  }, [presets.data])

  if (groups.length === 0) return null

  const lines = lineSet(field.value)
  const isChecked = (preset: AdvicePresetResponse) => lines.has(preset.label.trim())

  const toggle = (preset: AdvicePresetResponse, checked: boolean) => {
    const label = preset.label.trim()
    const next = checked ? appendLine(field.value, label) : removeLine(field.value, label)
    // Unchecking the last line restores a genuinely blank field, not a typed
    // empty one, so the pad's blank semantics stay intact.
    onChange(next.trim() === '' ? blank('') : entered(next))
  }

  return (
    <div className="flex min-w-0 flex-col">
      <p className="mb-1 flex min-h-5 items-center text-micro uppercase text-text-muted">
        Common advice
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        {groups.map((group) => {
          const checkedCount = group.presets.filter(isChecked).length
          // Collapsed by default; a category holding a checked line stays
          // open so nothing selected can hide. The doctor's own toggle wins.
          const open = toggled[group.name] ?? checkedCount > 0
          return (
            <div key={group.name} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setToggled((t) => ({ ...t, [group.name]: !open }))}
                className={cn(
                  'flex min-h-tap w-full items-center gap-2 px-2.5 text-left lg:min-h-10',
                  'transition-colors duration-instant ease-standard hover:bg-surface-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35',
                )}
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0 text-text-subtle transition-transform duration-fast ease-standard',
                    !open && '-rotate-90',
                  )}
                />
                <span className="text-label font-semibold text-text">{group.name}</span>
                <span className="text-caption text-text-subtle">
                  ({group.presets.length}
                  {checkedCount > 0 ? `, ${checkedCount} added` : ''})
                </span>
              </button>

              {open && (
                <ul className="pb-1">
                  {group.presets.map((preset) => {
                    const id = `rx-advice-preset-${preset.id}`
                    return (
                      <li
                        key={preset.id}
                        className={cn(
                          'flex items-center gap-2.5 pl-8 pr-2.5',
                          'transition-colors duration-instant ease-standard hover:bg-surface-hover',
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={isChecked(preset)}
                          onCheckedChange={(checked) => toggle(preset, checked)}
                        />
                        <label
                          htmlFor={id}
                          className="flex min-h-tap min-w-0 flex-1 cursor-pointer items-center text-body text-text lg:min-h-10"
                        >
                          {preset.label}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-caption text-text-subtle">
        Ticking adds the line to the advice below. Edit the text freely; the boxes follow it.
      </p>
    </div>
  )
}

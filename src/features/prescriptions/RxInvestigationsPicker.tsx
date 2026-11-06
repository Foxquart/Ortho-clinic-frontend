import { useMemo, useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Controls'
import { cn } from '@/lib/cn'
import { blank, entered, type FieldState } from './model'
import {
  appendInvestigationLine,
  groupInvestigations,
  investigationLines,
  removeInvestigationLine,
  type InvestigationOption,
} from '@/features/investigations/catalog'

/**
 * The clinic's investigation catalogue, as a grouped checklist above the
 * Investigations field.
 *
 * The textarea stays the source of truth, exactly as it is for advice: a box
 * is ticked when the field has that test as its own line, so dictation, a
 * template or a hand edit keeps the boxes honest without a second store. The
 * ids travel beside the text (`investigation_ids`) so the server can tick the
 * printed boxes; they are reconciled by the pad whenever the text changes.
 *
 * A test the catalogue does not know is still allowed: type it and press
 * Enter. It is written as a line, with no id, and prints like any other.
 */
export function RxInvestigationsPicker({
  field,
  selectedIds,
  options,
  onChange,
}: {
  field: FieldState<string>
  selectedIds: readonly string[]
  options: readonly InvestigationOption[]
  onChange: (next: FieldState<string>, ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  /** The doctor's explicit open/close choices, by category name. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const matching = needle
      ? options.filter(
          (option) =>
            option.name.toLowerCase().includes(needle) ||
            (option.category ?? '').toLowerCase().includes(needle),
        )
      : options
    return groupInvestigations(matching)
  }, [needle, options])

  const lines = investigationLines(field.value)
  const selectedCount = options.filter((option) => lines.has(option.name)).length

  const commit = (text: string, ids: readonly string[]) => {
    onChange(text.trim() === '' ? blank('') : entered(text), [...ids])
  }

  const toggle = (option: InvestigationOption, checked: boolean) => {
    const nextText = checked
      ? appendInvestigationLine(field.value, option.name)
      : removeInvestigationLine(field.value, option.name)
    const nextIds = checked
      ? option.id && !selectedIds.includes(option.id)
        ? [...selectedIds, option.id]
        : selectedIds
      : option.id
        ? selectedIds.filter((id) => id !== option.id)
        : selectedIds
    commit(nextText, nextIds)
  }

  const exactMatch = options.some((option) => option.name.toLowerCase() === needle)
  const canAddFreehand = needle !== '' && !exactMatch && !lines.has(query.trim())

  const addFreehand = () => {
    const name = query.trim()
    if (!name) return
    if (!lines.has(name)) commit(appendInvestigationLine(field.value, name), selectedIds)
    setQuery('')
  }

  if (options.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col">
      <p className="text-micro text-text-muted mb-1 flex min-h-5 items-center gap-2 uppercase">
        Test catalogue
        {selectedCount > 0 && (
          <span className="text-text-subtle normal-case">({selectedCount} selected)</span>
        )}
      </p>

      <Input
        type="search"
        value={query}
        placeholder="Search tests…"
        aria-label="Search investigations"
        iconLeft={<Search />}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canAddFreehand) {
            e.preventDefault()
            addFreehand()
          }
        }}
      />

      <div className="border-border mt-2 overflow-hidden rounded-md border">
        {groups.length === 0 && !canAddFreehand ? (
          <p className="text-caption text-text-subtle px-3 py-2">
            No test matches “{query.trim()}”.
          </p>
        ) : (
          groups.map((group) => {
            const checkedCount = group.options.filter((option) => lines.has(option.name)).length
            // Searching is a request to see everything that matches; otherwise
            // a category the doctor opened stays open and a ticked test can
            // never be hidden.
            const open = needle !== '' ? true : (toggled[group.name] ?? checkedCount > 0)
            return (
              <div key={group.name} className="border-border border-b last:border-b-0">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setToggled((t) => ({ ...t, [group.name]: !open }))}
                  className={cn(
                    'min-h-tap flex w-full items-center gap-2 px-2.5 text-left lg:min-h-10',
                    'duration-instant ease-standard hover:bg-surface-hover transition-colors',
                    'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                  )}
                >
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      'text-text-subtle duration-fast ease-standard size-4 shrink-0 transition-transform',
                      !open && '-rotate-90',
                    )}
                  />
                  <span className="text-label text-text font-semibold">{group.name}</span>
                  <span className="text-caption text-text-subtle">
                    ({group.options.length}
                    {checkedCount > 0 ? `, ${checkedCount} selected` : ''})
                  </span>
                </button>

                {open && (
                  <ul className="pb-1">
                    {group.options.map((option) => {
                      const slug = option.name
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                      const id = `rx-investigation-${option.id ?? slug}`
                      return (
                        <li
                          key={id}
                          className={cn(
                            'flex items-center gap-2.5 pr-2.5 pl-8',
                            'duration-instant ease-standard hover:bg-surface-hover transition-colors',
                          )}
                        >
                          <Checkbox
                            id={id}
                            checked={lines.has(option.name)}
                            onCheckedChange={(checked) => toggle(option, checked)}
                          />
                          <label
                            htmlFor={id}
                            className="min-h-tap text-body text-text flex min-w-0 flex-1 cursor-pointer items-center py-1 lg:min-h-10"
                          >
                            {option.name}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })
        )}

        {canAddFreehand && (
          <button
            type="button"
            onClick={addFreehand}
            className={cn(
              'min-h-tap flex w-full items-center gap-2 px-2.5 text-left lg:min-h-10',
              'border-border text-body text-text border-t',
              'duration-instant ease-standard hover:bg-surface-hover transition-colors',
              'focus-visible:ring-accent/35 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
            )}
          >
            <Plus aria-hidden className="text-accent size-3.5 shrink-0" />
            Add “{query.trim()}” as written
          </button>
        )}
      </div>

      <p className="text-caption text-text-subtle mt-1">
        Ticking adds the test to Investigations below. Edit the text freely; the boxes follow it.
      </p>
    </div>
  )
}

/**
 * Allergy entry.
 *
 * `allergies` is a `string[]` on the wire with no size or per-item bound, so a
 * comma-separated text box would be a lie about the data model AND a trap: one
 * typo in the separator silently merges two allergens into one nonsense entry.
 * This commits a tag on Enter, comma or blur, and every tag is removable.
 */

import { useRef, useState } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * The allergens an orthopaedic practice hears most. They are a one-tap
 * shortcut, never a constraint — anything can be typed.
 */
const COMMON = [
  'NSAIDs',
  'Penicillin',
  'Sulfa drugs',
  'Aspirin',
  'Diclofenac',
  'Iodine contrast',
] as const

export function TagInput({
  id,
  value,
  onChange,
  describedBy,
  invalid,
  placeholder = 'Type an allergen, press Enter',
}: {
  id: string
  value: string[]
  onChange: (next: string[]) => void
  describedBy?: string
  invalid?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function add(raw: string) {
    const tag = raw.trim()
    if (!tag) return
    const exists = value.some((v) => v.toLowerCase() === tag.toLowerCase())
    if (!exists) onChange([...value, tag])
    setDraft('')
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
    inputRef.current?.focus()
  }

  const unused = COMMON.filter(
    (c) => !value.some((v) => v.toLowerCase() === c.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-8.5 w-full flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5',
          'transition-[border-color,box-shadow] duration-fast ease-standard',
          'hover:border-border-strong',
          'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
          invalid && 'border-danger ring-danger/25',
        )}
      >
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-xs bg-allergy py-0.5 pl-1.5 pr-1 text-caption font-medium text-allergy-fg"
          >
            <AlertTriangle aria-hidden className="size-3 shrink-0" />
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={(e) => {
                e.stopPropagation()
                removeAt(index)
              }}
              className="grid size-4 place-items-center rounded-xs opacity-80 transition-opacity duration-instant hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={id}
          value={draft}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => {
            // A pasted "penicillin, sulfa" should still become two tags.
            if (e.target.value.includes(',')) {
              const parts = e.target.value.split(',')
              const tail = parts.pop() ?? ''
              for (const part of parts) add(part)
              setDraft(tail)
              return
            }
            setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Never let Enter submit the form with an uncommitted allergen.
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
              removeAt(value.length - 1)
            }
          }}
          onBlur={() => add(draft)}
          className="h-6 min-w-32 flex-1 bg-transparent text-body outline-none placeholder:text-text-subtle"
        />
      </div>

      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-caption text-text-subtle">Common:</span>
          {unused.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => add(c)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5',
                'text-caption text-text-muted transition-colors duration-fast ease-standard',
                'hover:border-border-strong hover:text-text',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              )}
            >
              <Plus aria-hidden className="size-3" />
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

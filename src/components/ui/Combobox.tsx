import { useEffect, useRef, useState } from 'react'
import * as RP from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ComboboxProps<T> {
  /** Currently selected item, or null. */
  value: T | null
  onChange: (item: T) => void
  /** The current query text — owned by the caller so it can drive the query. */
  query: string
  onQueryChange: (query: string) => void
  items: readonly T[]
  getKey: (item: T) => string
  renderItem: (item: T, active: boolean) => React.ReactNode
  /** Text shown in the trigger when something is selected. */
  getLabel: (item: T) => string
  loading?: boolean
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: React.ReactNode
  /** Rendered at the bottom of the list — e.g. "Create new patient". */
  footer?: React.ReactNode
  disabled?: boolean
  invalid?: boolean
  id?: string
  className?: string
  contentClassName?: string
  'aria-describedby'?: string
}

/**
 * Server-driven combobox. It never filters locally — the backend's search
 * endpoints already rank by prefix, then substring, then trigram similarity,
 * which tolerates the misspellings a client-side `includes()` would drop.
 */
export function Combobox<T>({
  value,
  onChange,
  query,
  onQueryChange,
  items,
  getKey,
  renderItem,
  getLabel,
  loading = false,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  footer,
  disabled,
  invalid,
  id,
  className,
  contentClassName,
  ...aria
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [width, setWidth] = useState<number>()

  // Match the popover to the trigger so the list doesn't jump around.
  useEffect(() => {
    if (open && triggerRef.current) setWidth(triggerRef.current.offsetWidth)
  }, [open])

  return (
    <RP.Root open={open} onOpenChange={setOpen}>
      <RP.Trigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={aria['aria-describedby']}
          disabled={disabled}
          className={cn(
            'inline-flex h-control w-full items-center justify-between gap-2 rounded-md border border-border-field bg-surface px-2.5 text-body',
            'transition-[border-color,box-shadow] duration-fast ease-standard',
            'hover:border-border-strong',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/35',
            'disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-sunken disabled:text-text-subtle',
            'aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30',
            className,
          )}
        >
          <span className={cn('truncate text-left', !value && 'text-text-subtle')}>
            {value ? getLabel(value) : placeholder}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-text-subtle" />
        </button>
      </RP.Trigger>

      <RP.Portal>
        <RP.Content
          align="start"
          sideOffset={6}
          style={width ? { width } : undefined}
          className={cn(
            'z-60 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-overlay',
            'data-[state=open]:animate-[menu-in_130ms_var(--ease-out-quint)]',
            'origin-(--radix-popover-content-transform-origin)',
            contentClassName,
          )}
        >
          {/* shouldFilter=false: ranking is the server's job, not ours. */}
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <Search aria-hidden className="size-4 shrink-0 text-text-subtle" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={onQueryChange}
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-body outline-none placeholder:text-text-subtle"
              />
              {loading && (
                <Loader2
                  aria-hidden
                  className="size-3.5 shrink-0 animate-spin text-text-subtle motion-reduce:animate-none"
                />
              )}
            </div>

            <Command.List className="scrollbar-subtle max-h-72 overflow-y-auto p-1">
              {!loading && items.length === 0 && (
                <Command.Empty className="px-2.5 py-6 text-center text-caption text-text-muted">
                  {emptyMessage}
                </Command.Empty>
              )}

              {items.map((item) => {
                const key = getKey(item)
                const selected = value !== null && getKey(value) === key
                return (
                  <Command.Item
                    key={key}
                    value={key}
                    onSelect={() => {
                      onChange(item)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex cursor-default select-none items-start gap-2 rounded-md px-2 py-1.5 text-body outline-none',
                      'data-[selected=true]:bg-accent-muted',
                    )}
                  >
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                      {selected && <Check aria-hidden className="size-3.5 text-accent" />}
                    </span>
                    <span className="min-w-0 flex-1">{renderItem(item, selected)}</span>
                  </Command.Item>
                )
              })}
            </Command.List>

            {footer && <div className="border-t border-border p-1">{footer}</div>}
          </Command>
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  )
}

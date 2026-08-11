import * as RS from '@radix-ui/react-select'
import * as RSwitch from '@radix-ui/react-switch'
import * as RCheckbox from '@radix-ui/react-checkbox'
import * as RTabs from '@radix-ui/react-tabs'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

/* --------------------------------- Select --------------------------------- */

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  description?: string
  disabled?: boolean
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  id,
  disabled,
  invalid,
  className,
  size = 'md',
  ...aria
}: {
  value: T | undefined
  onChange: (value: T) => void
  options: readonly SelectOption<T>[]
  placeholder?: string
  id?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  size?: 'sm' | 'md'
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-label'?: string
}) {
  return (
    <RS.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <RS.Trigger
        id={id}
        aria-invalid={invalid || aria['aria-invalid'] || undefined}
        aria-describedby={aria['aria-describedby']}
        aria-label={aria['aria-label']}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-md border border-border-field bg-surface text-text',
          'transition-[border-color,box-shadow] duration-fast ease-standard',
          'hover:border-border-strong',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/35',
          'disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-sunken disabled:text-text-subtle',
          'aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30',
          'data-[placeholder]:text-text-subtle',
          size === 'sm' ? 'h-control-sm px-2 text-caption' : 'h-control px-2.5 text-body',
          className,
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-text-subtle" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-60 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-overlay',
            'data-[state=open]:animate-[menu-in_130ms_var(--ease-out-quint)]',
            'origin-(--radix-select-content-transform-origin)',
          )}
        >
          <RS.Viewport className="scrollbar-subtle">
            {options.map((opt) => (
              <RS.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                  'flex cursor-default select-none items-start gap-2 rounded-md px-2 py-1.5 text-body outline-none',
                  'data-[highlighted]:bg-accent-muted',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                )}
              >
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                  <RS.ItemIndicator>
                    <Check aria-hidden className="size-3.5 text-accent" />
                  </RS.ItemIndicator>
                </span>
                <span className="min-w-0">
                  <RS.ItemText>{opt.label}</RS.ItemText>
                  {opt.description && (
                    <span className="block text-caption text-text-muted">{opt.description}</span>
                  )}
                </span>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  )
}

/* --------------------------------- Switch --------------------------------- */

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  label,
  description,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
  label?: React.ReactNode
  description?: React.ReactNode
}) {
  const control = (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border border-transparent bg-border-strong transition-colors duration-fast ease-standard',
        'data-[state=checked]:bg-accent',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:opacity-50',
      )}
    >
      <RSwitch.Thumb
        className={cn(
          'block size-4 rounded-full bg-white shadow-sm',
          'translate-x-0.5 transition-transform duration-fast ease-out-quint',
          'data-[state=checked]:translate-x-[1.125rem]',
          'motion-reduce:transition-none',
        )}
      />
    </RSwitch.Root>
  )

  if (!label) return control

  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-body text-text">{label}</span>
        {description && <span className="block text-caption text-text-muted">{description}</span>}
      </label>
      {control}
    </div>
  )
}

/* -------------------------------- Checkbox -------------------------------- */

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  disabled,
  label,
}: {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
  label?: React.ReactNode
}) {
  const control = (
    <RCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded border border-border-strong bg-surface',
        'transition-colors duration-fast ease-standard',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:opacity-50',
      )}
    >
      <RCheckbox.Indicator className="text-accent-fg">
        {checked === 'indeterminate' ? (
          <Minus aria-hidden className="size-3" strokeWidth={3} />
        ) : (
          <Check aria-hidden className="size-3" strokeWidth={3} />
        )}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  )

  if (!label) return control
  return (
    <div className="flex items-center gap-2">
      {control}
      <label htmlFor={id} className="cursor-pointer text-body text-text">
        {label}
      </label>
    </div>
  )
}

/* ---------------------------- Segmented control --------------------------- */

/**
 * For 2–4 mutually exclusive view modes. Beyond that it becomes a Select.
 * Uses a real radio group so arrow keys work and screen readers announce it.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: React.ReactNode; icon?: React.ReactNode }[]
  size?: 'sm' | 'md'
  className?: string
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-bg-sunken p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors duration-fast ease-standard',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              size === 'sm' ? 'h-6 px-2 text-caption' : 'h-7 px-2.5 text-body',
              active
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-muted hover:bg-surface/60 hover:text-text',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------- Tabs ---------------------------------- */

export const Tabs = RTabs.Root
export const TabsContent = RTabs.Content

export function TabsList({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <RTabs.List
      className={cn('flex items-center gap-1 border-b border-border', className)}
    >
      {children}
    </RTabs.List>
  )
}

export function TabsTrigger({
  value,
  children,
  count,
}: {
  value: string
  children: React.ReactNode
  count?: number
}) {
  return (
    <RTabs.Trigger
      value={value}
      className={cn(
        'relative -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2',
        'text-body font-medium text-text-muted transition-colors duration-fast ease-standard',
        'hover:text-text',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'data-[state=active]:border-accent data-[state=active]:text-text',
      )}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-bg-sunken px-1.5 text-caption text-text-muted" data-numeric>
          {count}
        </span>
      )}
    </RTabs.Trigger>
  )
}

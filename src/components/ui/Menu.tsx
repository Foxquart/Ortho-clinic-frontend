import * as RT from '@radix-ui/react-tooltip'
import * as RDM from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

/* --------------------------------- Tooltip -------------------------------- */

export function Tooltip({
  content,
  children,
  side = 'top',
  shortcut,
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  shortcut?: string
}) {
  if (!content) return <>{children}</>
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-60 flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-2 py-1',
            'text-caption text-text shadow-overlay',
            'data-[state=delayed-open]:animate-[menu-in_120ms_var(--ease-standard)]',
          )}
        >
          {content}
          {shortcut && <span className="font-mono text-[11px] text-text-subtle">{shortcut}</span>}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  )
}

/* ------------------------------ Dropdown menu ----------------------------- */

export const Menu = RDM.Root
export const MenuTrigger = RDM.Trigger

const MENU_SURFACE = cn(
  'z-60 min-w-44 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-overlay',
  'data-[state=open]:animate-[menu-in_130ms_var(--ease-out-quint)]',
  'origin-(--radix-dropdown-menu-content-transform-origin)',
)

const ITEM = cn(
  /* 35px is a comfortable row for a pointer and a cramped one for a thumb, and
     these menus carry the destructive actions — "Deactivate patient" sits
     directly under a benign row. Below `sm` every item takes the 44px
     `--spacing-tap` floor; the desktop menu keeps its density. */
  'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-body text-text outline-none max-sm:min-h-tap',
  'data-[highlighted]:bg-accent-muted data-[highlighted]:text-text',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-subtle',
)

export function MenuContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <RDM.Portal>
      <RDM.Content align={align} sideOffset={6} className={cn(MENU_SURFACE, className)}>
        {children}
      </RDM.Content>
    </RDM.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  destructive,
  shortcut,
  icon,
}: {
  children: React.ReactNode
  onSelect?: () => void
  disabled?: boolean
  destructive?: boolean
  shortcut?: string
  icon?: React.ReactNode
}) {
  return (
    <RDM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        ITEM,
        destructive &&
          'text-danger data-[highlighted]:bg-danger-muted data-[highlighted]:text-danger-muted-fg [&_svg]:text-danger',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="font-mono text-[11px] text-text-subtle">{shortcut}</span>}
    </RDM.Item>
  )
}

export function MenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <RDM.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(e) => e.preventDefault()}
      className={ITEM}
    >
      <span className="grid size-4 place-items-center">
        <RDM.ItemIndicator>
          <Check aria-hidden className="size-3.5 text-accent" />
        </RDM.ItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
    </RDM.CheckboxItem>
  )
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <RDM.Label className="px-2 pb-1 pt-1.5 text-caption font-medium text-text-subtle">
      {children}
    </RDM.Label>
  )
}

export function MenuSeparator() {
  return <RDM.Separator className="my-1 h-px bg-border" />
}

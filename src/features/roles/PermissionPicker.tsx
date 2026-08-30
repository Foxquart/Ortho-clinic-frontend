import { useId } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Controls'
import { Tooltip } from '@/components/ui/Menu'
import type { PermissionGroup, PermissionInfo } from '@/api/schema'

const RESERVED_EXPLANATION =
  'Reserved for the vendor’s superadmin. It cannot be granted to any role — the API rejects a body that names it — and it is shown rather than hidden so it is never a mystery why the box is missing.'

/**
 * One permission. A reserved one is rendered disabled and labelled rather than
 * dropped from the list: a superadmin who cannot see why a capability is
 * absent has no way to tell a deliberate lock from a missing feature, and will
 * quite reasonably file a bug about it.
 */
function PermissionRow({
  permission,
  checked,
  disabled,
  onChange,
}: {
  permission: PermissionInfo
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()

  if (permission.reserved) {
    return (
      // The tooltip hangs off a focusable wrapper, not the checkbox: a disabled
      // control fires no pointer events and can hold no focus, so anchoring the
      // explanation to it would make the explanation unreachable.
      <Tooltip content={RESERVED_EXPLANATION}>
        <span
          tabIndex={0}
          className="focus-visible:outline-focus flex items-center gap-2 rounded px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          <Checkbox checked={false} disabled onCheckedChange={() => {}} />
          <span className="text-body text-text-subtle min-w-0 truncate">{permission.label}</span>
          <Badge tone="neutral" className="shrink-0">
            <Lock aria-hidden className="size-3" />
            Superadmin only
          </Badge>
        </span>
      </Tooltip>
    )
  }

  return (
    <span className="flex items-center gap-2 px-1 py-1">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <label
        htmlFor={id}
        className={cn(
          'text-body text-text min-w-0 cursor-pointer truncate',
          disabled && 'text-text-subtle cursor-default',
        )}
      >
        {permission.label}
      </label>
      <span className="text-caption text-text-subtle shrink-0 font-mono">{permission.key}</span>
    </span>
  )
}

/**
 * The permission catalogue as checkbox groups, in exactly the order the API
 * returned it — groups and permissions alike. Nothing here is hardcoded, so a
 * capability the backend adds tomorrow appears without a frontend release.
 */
export function PermissionPicker({
  groups,
  value,
  onChange,
  disabled = false,
}: {
  groups: PermissionGroup[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const selected = new Set(value)

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(key)
    else next.delete(key)
    onChange([...next])
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    const grantable = group.permissions.filter((p) => !p.reserved).map((p) => p.key)
    const next = new Set(selected)
    for (const key of grantable) {
      if (checked) next.add(key)
      else next.delete(key)
    }
    onChange([...next])
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const grantable = group.permissions.filter((p) => !p.reserved)
        const chosen = grantable.filter((p) => selected.has(p.key)).length
        const all = grantable.length > 0 && chosen === grantable.length
        const groupState: boolean | 'indeterminate' = all
          ? true
          : chosen > 0
            ? 'indeterminate'
            : false

        return (
          <section
            key={group.group}
            className="border-border bg-bg-sunken rounded-md border p-3"
            aria-label={group.group}
          >
            <header className="mb-2 flex items-center justify-between gap-3">
              <Checkbox
                checked={groupState}
                disabled={disabled || grantable.length === 0}
                onCheckedChange={(checked) => toggleGroup(group, checked)}
                label={<span className="font-medium">{group.group}</span>}
                id={`group-${group.group}`}
              />
              <span className="text-caption text-text-subtle shrink-0">
                {chosen} of {grantable.length}
              </span>
            </header>
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <PermissionRow
                  key={permission.key}
                  permission={permission}
                  checked={selected.has(permission.key)}
                  disabled={disabled}
                  onChange={(checked) => toggle(permission.key, checked)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Plus, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import { Tooltip } from '@/components/ui/Menu'
import { TD, TH, THead, TR, Table } from '@/components/ui/Table'
import type { RoleResponse } from '@/api/schema'
import { DeleteRoleDialog } from './DeleteRoleDialog'
import { holderSentence, isVendorRole, useRoleHolderTally, useRoleList } from './useRoles'

const VENDOR_EXPLANATION =
  'The vendor’s own operator role. It defines roles and reads monitoring, bypasses every permission check, and the API refuses any edit to it.'

/** What a role grants, said honestly — the vendor role's empty array is not zero. */
function permissionSummary(role: RoleResponse): string {
  if (isVendorRole(role)) return 'Everything, implicitly'
  const count = role.permissions.length
  if (count === 0) return 'No permissions'
  return count === 1 ? '1 permission' : `${count} permissions`
}

function RoleBadges({ role }: { role: RoleResponse }) {
  return (
    <>
      {isVendorRole(role) ? (
        <Badge tone="accent">Vendor</Badge>
      ) : (
        role.is_system && <Badge tone="info">System</Badge>
      )}
      {!role.is_active && (
        <Badge tone="neutral" dot>
          Inactive
        </Badge>
      )}
    </>
  )
}

/**
 * The row actions, shared by the card list and the table so the two renders
 * cannot drift on which role is allowed which affordance. Three cases:
 * the vendor role gets neither button and says why; a seeded role is editable
 * but never deletable; everything else gets both.
 */
function RoleActions({
  role,
  onEdit,
  onDelete,
}: {
  role: RoleResponse
  onEdit: (role: RoleResponse) => void
  onDelete: (role: RoleResponse) => void
}) {
  if (isVendorRole(role)) {
    return (
      <Tooltip content={VENDOR_EXPLANATION}>
        <span
          tabIndex={0}
          className="text-caption text-text-subtle focus-visible:outline-focus inline-flex items-center gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Lock aria-hidden className="size-3.5" />
          Locked
        </span>
      </Tooltip>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit ${role.name}`}
        onClick={() => onEdit(role)}
      >
        Edit
      </Button>
      {/* Seeded roles have no delete route that will ever succeed — a 409 is
          guaranteed — so the button is absent rather than disabled. */}
      {!role.is_system && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:text-danger"
          aria-label={`Delete ${role.name}`}
          onClick={() => onDelete(role)}
        >
          Delete
        </Button>
      )}
    </span>
  )
}

export function RolesScreen() {
  const navigate = useNavigate()
  const roles = useRoleList()
  const tally = useRoleHolderTally()
  const [deleting, setDeleting] = useState<RoleResponse | null>(null)

  const rows = roles.data ?? []
  const holders = (role: RoleResponse) =>
    tally.data?.counts[role.id] ?? (tally.data ? 0 : undefined)

  const openEditor = (role: RoleResponse) => {
    if (isVendorRole(role)) return
    void navigate(`/superadmin/roles/${role.id}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Roles"
        description="A role is a level and a set of permissions. The level decides who may manage whom; the permissions decide what the holder may do. They are independent."
        actions={
          <Button
            variant="primary"
            iconLeft={<Plus aria-hidden className="size-4" />}
            className="min-h-tap w-full sm:min-h-0 sm:w-auto"
            onClick={() => void navigate('/superadmin/roles/new')}
          >
            New role
          </Button>
        }
      />

      {roles.isError && <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />}

      {/* The tally is a second request against a second endpoint; if it fails,
          the roles are still worth showing — the screen just stops promising a
          safe delete. */}
      {tally.isError && (
        <p className="text-caption text-warning-muted-fg bg-warning-muted border-warning/30 rounded-md border px-3 py-2">
          Holder counts could not be loaded, so a delete here may still fail with a conflict.
        </p>
      )}
      {tally.data?.truncated && (
        <p className="text-caption text-text-subtle">
          More than 1,000 accounts exist — holder counts below are a floor, not an exact tally.
        </p>
      )}

      {!roles.isError && (
        <Card className="overflow-hidden">
          {roles.isPending ? (
            <SkeletonRows rows={5} className="p-2" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title="No roles are defined"
              description="Even the seeded roles are missing, which means this database has not been initialised. Nobody can be given an account until at least one role exists."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void navigate('/superadmin/roles/new')}
                >
                  Define the first role
                </Button>
              }
            />
          ) : (
            <>
              {/* Seven columns will not fit a phone, and this screen is read on
                  one about as often as any other admin surface, so below `sm`
                  each role becomes a card with its meta folded onto one line. */}
              <ul className="sm:hidden">
                {rows.map((role) => (
                  <li
                    key={role.id}
                    className="border-border flex items-center gap-2 border-b px-4 last:border-b-0"
                  >
                    <button
                      type="button"
                      disabled={isVendorRole(role)}
                      onClick={() => openEditor(role)}
                      className="min-h-tap duration-fast ease-standard hover:bg-surface-hover focus-visible:outline-focus -mx-2 flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-medium">{role.name}</span>
                        <RoleBadges role={role} />
                      </span>
                      <span className="text-caption text-text-muted block truncate">
                        <span className="font-mono">{role.key}</span> · level {role.level} ·{' '}
                        {permissionSummary(role)}
                      </span>
                      <span className="text-caption text-text-subtle block truncate">
                        {holderSentence(holders(role))}
                      </span>
                    </button>
                    <span className="shrink-0">
                      <RoleActions role={role} onEdit={openEditor} onDelete={setDeleting} />
                    </span>
                  </li>
                ))}
              </ul>

              <div className="hidden sm:block">
                <Table label="Roles">
                  <THead>
                    <TH>Role</TH>
                    <TH>Key</TH>
                    <TH align="right" width="5rem">
                      Level
                    </TH>
                    <TH className="hidden lg:table-cell">Grants</TH>
                    <TH>Held by</TH>
                    <TH width="6rem">Status</TH>
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </THead>
                  <tbody>
                    {rows.map((role) => {
                      const locked = isVendorRole(role)
                      return (
                        <TR
                          key={role.id}
                          onClick={locked ? undefined : () => openEditor(role)}
                          className={cn('h-row', !role.is_active && '[&>td]:text-text-subtle')}
                        >
                          <TD className="max-w-72">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium">{role.name}</span>
                              <RoleBadges role={role} />
                            </span>
                            {role.description && (
                              <span className="text-caption text-text-subtle block max-w-72 truncate">
                                {role.description}
                              </span>
                            )}
                          </TD>
                          <TD className="text-caption text-text-muted font-mono">{role.key}</TD>
                          <TD align="right" numeric className="font-mono">
                            {role.level}
                          </TD>
                          <TD className="text-caption text-text-muted hidden lg:table-cell">
                            {permissionSummary(role)}
                          </TD>
                          <TD className="text-caption text-text-muted whitespace-nowrap">
                            {holderSentence(holders(role))}
                          </TD>
                          <TD>
                            {role.is_active ? (
                              <Badge tone="success" dot>
                                Active
                              </Badge>
                            ) : (
                              <Badge tone="neutral" dot>
                                Inactive
                              </Badge>
                            )}
                          </TD>
                          <TD align="right" className="w-px whitespace-nowrap">
                            {/* The row navigates; the buttons must not do both. */}
                            <span
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <RoleActions role={role} onEdit={openEditor} onDelete={setDeleting} />
                            </span>
                          </TD>
                        </TR>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Card>
      )}

      {deleting && (
        <DeleteRoleDialog
          key={deleting.id}
          role={deleting}
          holderCount={holders(deleting)}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      )}
    </div>
  )
}

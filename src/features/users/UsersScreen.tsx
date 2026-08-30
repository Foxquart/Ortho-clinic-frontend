import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRound, MoreHorizontal, Plus, ShieldAlert, UserPlus } from 'lucide-react'
import { apiGet, apiPatch } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { formatAgo, formatDateTime } from '@/lib/format'
import { roleTone } from '@/lib/permissions'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Surface'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu'
import { Pagination, TD, TH, THead, TR, Table } from '@/components/ui/Table'
import { CreateUserSheet, EditUserSheet } from './UserFormSheet'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { accountLocation, reportActionError } from './formUtils'
import type { Paginated, UserResponse } from '@/api/schema'

const PAGE_SIZE = 20

/**
 * The per-row actions, shared verbatim by the phone card list and the desktop
 * table. Extracted rather than copied: "Reset password…" and "Deactivate…" are
 * exactly the kind of menu that grows a fourth item on one render and not the
 * other.
 *
 * `note` carries the reason the items are dark, when they are. A menu that
 * opens onto three greyed lines with nothing said is worse than no menu — the
 * reader assumes the app is broken rather than that the rule is deliberate.
 */
function UserActionsMenu({
  user,
  note,
  canEdit,
  canReset,
  onEdit,
  onReset,
  onDeactivate,
  onReactivate,
  className,
}: {
  user: UserResponse
  note: string | null
  canEdit: boolean
  canReset: boolean
  onEdit: (user: UserResponse) => void
  onReset: (user: UserResponse) => void
  onDeactivate: (user: UserResponse) => void
  onReactivate: (user: UserResponse) => void
  className?: string
}) {
  return (
    // The row itself opens the editor; the menu must not do both.
    <span
      className={className}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Menu>
        {/* "Reset password…" and "Deactivate…" live only behind this icon, and
            on the card list it is the one thing beside the row's own tap
            target. 26px is not a thumb target, so it becomes a 44px square. */}
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-tap min-w-tap sm:min-h-0 sm:min-w-0"
            aria-label={`Actions for ${user.full_name}`}
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {note && (
            <>
              <MenuLabel>
                <span className="block max-w-60 whitespace-normal">{note}</span>
              </MenuLabel>
              <MenuSeparator />
            </>
          )}
          <MenuItem disabled={!canEdit} onSelect={() => onEdit(user)}>
            Edit user…
          </MenuItem>
          <MenuItem
            icon={<KeyRound aria-hidden />}
            disabled={!canReset}
            onSelect={() => onReset(user)}
          >
            Reset password…
          </MenuItem>
          <MenuSeparator />
          {user.is_active ? (
            <MenuItem destructive disabled={!canEdit} onSelect={() => onDeactivate(user)}>
              Deactivate…
            </MenuItem>
          ) : (
            <MenuItem disabled={!canEdit} onSelect={() => onReactivate(user)}>
              Reactivate
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
    </span>
  )
}

export function UsersScreen() {
  const { user: me, can, isSuperadmin } = useAuth()
  const canRead = can('user.read')
  const canCreate = can('user.create')
  const canUpdate = can('user.update')
  const canResetPassword = can('user.reset_password')
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserResponse | null>(null)
  const [resetting, setResetting] = useState<UserResponse | null>(null)
  const [deactivating, setDeactivating] = useState<UserResponse | null>(null)

  const users = useQuery({
    queryKey: qk.users.list({ page, page_size: PAGE_SIZE }),
    queryFn: () =>
      apiGet<Paginated<UserResponse>>(endpoints.users.list, {
        params: { page, page_size: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    enabled: canRead,
  })

  const setActive = useMutation({
    mutationFn: ({ user, is_active }: { user: UserResponse; is_active: boolean }) =>
      apiPatch<UserResponse>(endpoints.users.byId(user.id), { is_active }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: qk.users.all() })
      toast.success(
        updated.is_active
          ? `${updated.full_name} can sign in again`
          : `${updated.full_name} can no longer sign in`,
      )
      setDeactivating(null)
    },
    // The last active superadmin cannot be deactivated — a 409 whose message
    // names what would break. Passed through as written.
    onError: reportActionError,
  })

  const rows = users.data?.items ?? []
  const isSelf = (user: UserResponse) => user.id === me?.id

  /**
   * The authority rule, mirrored so the screen never offers a button the server
   * will refuse. An actor may create, edit, deactivate, reassign or reset the
   * password of another account only when their own level is *strictly* greater
   * than the target's — greater-or-equal is not enough, which is why a doctor
   * cannot touch another doctor and only the vendor's superadmin can onboard
   * one. Strictness also gives us the three "not on yourself" rules for free:
   * your own level is never above your own level.
   */
  const myLevel = me?.role.level ?? 0
  const outranks = (target: UserResponse) => myLevel > target.role.level

  /** Why the manage actions are dark on this row, when they are. */
  const blockedReason = (target: UserResponse): string | null => {
    if (isSelf(target)) {
      return `Your own account. Change your password under ${accountLocation(isSuperadmin)}, and ask someone above you for anything else.`
    }
    if (!outranks(target)) {
      return `Only an account above ${target.role.name} (level ${target.role.level}) can manage this one. Yours is level ${myLevel}.`
    }
    return null
  }

  if (!canRead) {
    return (
      <Card>
        <EmptyState
          icon={<ShieldAlert />}
          title="You cannot see the user accounts"
          description="Viewing who can sign in needs the “View users” permission, which your role does not carry. Whoever administers this clinic can grant it."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Two ends of a row on a desk, two stacked blocks on a phone: squeezed
          into 320px the paragraph collapsed to a four-line column so the button
          beside it would keep its width. Below `sm` the sentence gets the full
          line and the button gets its own, at a full 44px. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <p className="text-body text-text-muted">
          Everyone who can sign in. Accounts are never deleted — deactivate one instead, so the
          audit trail keeps its author. You can only manage accounts below your own role.
        </p>
        {canCreate && (
          <Button
            variant="primary"
            iconLeft={<Plus aria-hidden className="size-4" />}
            className="min-h-tap w-full shrink-0 sm:min-h-0 sm:w-auto"
            onClick={() => setCreating(true)}
          >
            Add user
          </Button>
        )}
      </div>

      {users.isError && <ErrorState error={users.error} onRetry={() => void users.refetch()} />}

      <Card className="overflow-hidden">
        {users.isPending ? (
          <SkeletonRows rows={6} className="p-2" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserPlus />}
            title="No users yet"
            description="Add an account for every person who works at the clinic — the reception desk, the doctor, and at least one more administrator."
            action={
              canCreate && (
                <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                  Add the first user
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Twin renders over the same `rows`, one query behind both. Seven
                columns will not fit a phone — at 320px the table stopped after
                "Username" and the role, the status and the whole actions column
                lived off the right edge — so below `sm` each account becomes a
                card: the person's name on line one, everything else folded into
                one quiet meta line under it. */}
            <ul className="sm:hidden">
              {rows.map((user) => (
                <li
                  key={user.id}
                  className="border-border flex items-center gap-2 border-b px-4 last:border-b-0"
                >
                  <button
                    type="button"
                    disabled={!(canUpdate && outranks(user))}
                    onClick={() => setEditing(user)}
                    className="min-h-tap duration-fast ease-standard hover:bg-surface-hover focus-visible:outline-focus -mx-2 flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 truncate font-medium">{user.full_name}</span>
                      {isSelf(user) && <Badge tone="accent">You</Badge>}
                      {!user.is_active && (
                        <Badge tone="neutral" dot>
                          Deactivated
                        </Badge>
                      )}
                    </span>
                    {/* Role name straight from the server — a clinic can rename
                        its roles, so any local label map would eventually be a
                        lie — and the level beside it, because the level is what
                        decides who may manage whom. */}
                    <span className="text-caption text-text-muted block truncate">
                      <span className="font-mono">{user.username}</span> · {user.role.name} (level{' '}
                      {user.role.level}) ·{' '}
                      {user.last_login_at ? formatAgo(user.last_login_at) : 'never signed in'}
                    </span>
                    <span className="text-caption text-text-subtle block truncate">
                      {user.email}
                    </span>
                  </button>

                  {(canUpdate || canResetPassword) && (
                    <UserActionsMenu
                      className="shrink-0"
                      user={user}
                      note={blockedReason(user)}
                      canEdit={canUpdate && outranks(user)}
                      canReset={canResetPassword && outranks(user)}
                      onEdit={setEditing}
                      onReset={setResetting}
                      onDeactivate={setDeactivating}
                      onReactivate={(u) => setActive.mutate({ user: u, is_active: true })}
                    />
                  )}
                </li>
              ))}
            </ul>

            <div className="hidden sm:block">
              <Table label="Users">
                <THead>
                  <TH>Name</TH>
                  <TH>Username</TH>
                  {/* The email is the widest column and the least often read: it
                      is what pushed this table past a 768px tablet and into a
                      sideways scroll. It stays on the card, in the editor and
                      from `lg` up, where there is room for it. */}
                  <TH className="hidden lg:table-cell">Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last sign-in</TH>
                  <TH width="2.75rem">
                    <span className="sr-only">Actions</span>
                  </TH>
                </THead>
                <tbody>
                  {rows.map((user) => (
                    <TR
                      key={user.id}
                      onClick={canUpdate && outranks(user) ? () => setEditing(user) : undefined}
                      className="h-row"
                    >
                      <TD className="max-w-56 truncate font-medium">
                        <span className="flex items-center gap-2">
                          <span className="truncate">{user.full_name}</span>
                          {isSelf(user) && <Badge tone="accent">You</Badge>}
                        </span>
                      </TD>
                      <TD className="text-caption text-text-muted font-mono">{user.username}</TD>
                      <TD className="text-text-muted hidden max-w-56 truncate lg:table-cell">
                        {user.email}
                      </TD>
                      <TD>
                        {/* The tone is banded off the level rather than off a
                            role key: custom roles arrive at levels nobody here
                            anticipated, and a name is not something to switch
                            on. The level rides alongside so the hierarchy the
                            actions obey is legible in the row itself. */}
                        <span className="flex items-center gap-1.5">
                          <Badge tone={roleTone(user.role.level)}>{user.role.name}</Badge>
                          <span className="text-caption text-text-subtle whitespace-nowrap">
                            level {user.role.level}
                          </span>
                        </span>
                      </TD>
                      <TD>
                        {user.is_active ? (
                          <Badge tone="success" dot>
                            Active
                          </Badge>
                        ) : (
                          <Badge tone="neutral" dot>
                            Deactivated
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-caption text-text-muted">
                        {user.last_login_at ? (
                          <time
                            dateTime={user.last_login_at}
                            title={formatDateTime(user.last_login_at)}
                          >
                            {formatAgo(user.last_login_at)}
                          </time>
                        ) : (
                          <span className="text-text-subtle">Never</span>
                        )}
                      </TD>
                      <TD>
                        {(canUpdate || canResetPassword) && (
                          <UserActionsMenu
                            user={user}
                            note={blockedReason(user)}
                            canEdit={canUpdate && outranks(user)}
                            canReset={canResetPassword && outranks(user)}
                            onEdit={setEditing}
                            onReset={setResetting}
                            onDeactivate={setDeactivating}
                            onReactivate={(u) => setActive.mutate({ user: u, is_active: true })}
                          />
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>

            {users.data && (
              <Pagination
                page={users.data.page}
                pages={users.data.pages}
                total={users.data.total}
                pageSize={users.data.page_size}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      {canCreate && <CreateUserSheet open={creating} onOpenChange={setCreating} />}

      {canUpdate && editing && (
        <EditUserSheet
          key={editing.id}
          user={editing}
          isSelf={isSelf(editing)}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}

      {canResetPassword && resetting && (
        <ResetPasswordDialog
          key={resetting.id}
          user={resetting}
          isSelf={isSelf(resetting)}
          open
          onOpenChange={(open) => !open && setResetting(null)}
        />
      )}

      {canUpdate && deactivating && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeactivating(null)}
          destructive
          confirmLabel="Deactivate"
          loading={setActive.isPending}
          onConfirm={() => setActive.mutate({ user: deactivating, is_active: false })}
          title={`Deactivate ${deactivating.full_name}?`}
          body={
            <>
              They are signed out of every device and cannot sign in as{' '}
              <span className="text-text font-mono">{deactivating.username}</span> again until
              someone above them reactivates the account. Their history stays exactly where it is —
              nothing they wrote is removed.
            </>
          }
        />
      )}
    </div>
  )
}

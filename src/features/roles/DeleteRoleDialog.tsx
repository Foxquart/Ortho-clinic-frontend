import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, errorMessage } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { DialogClose, DialogContent, DialogRoot } from '@/components/ui/Dialog'
import type { RoleResponse } from '@/api/schema'
import { holderSentence, useDeleteRole, useUpdateRole } from './useRoles'

/**
 * Deleting a role is the one action on this screen with a foreseeable server
 * refusal: a role somebody holds is a 409, always. So the count is stated
 * before the button, the refusal is caught in place rather than thrown at a
 * toast, and the thing the operator actually wanted — stop anyone new being
 * given this role — is offered as the next click instead of a dead end.
 */
export function DeleteRoleDialog({
  role,
  holderCount,
  open,
  onOpenChange,
}: {
  role: RoleResponse
  holderCount: number | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const remove = useDeleteRole()
  const update = useUpdateRole()
  const [conflict, setConflict] = useState<string | null>(null)

  // A reopened dialog must not still be showing the previous refusal.
  useEffect(() => {
    if (open) setConflict(null)
  }, [open])

  const held = holderCount !== undefined && holderCount > 0
  const busy = remove.isPending || update.isPending

  function confirmDelete() {
    setConflict(null)
    remove.mutate(role.id, {
      onSuccess: () => {
        toast.success(`${role.name} deleted`)
        onOpenChange(false)
      },
      onError: (error) => {
        // 409 means somebody holds it — the message names the count, and it is
        // written to be read, so it is shown rather than summarised.
        if (error instanceof ApiError && error.isConflict) {
          setConflict(error.message)
          return
        }
        // 403 messages are written for the account holder. Verbatim.
        if (error instanceof ApiError && error.isForbidden) {
          setConflict(error.message)
          return
        }
        toast.error(errorMessage(error))
      },
    })
  }

  function deactivateInstead() {
    update.mutate(
      { id: role.id, body: { is_active: false } },
      {
        onSuccess: () => {
          toast.success(`${role.name} can no longer be assigned`, {
            description: 'The people who already hold it keep it until they are moved.',
          })
          onOpenChange(false)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={`Delete ${role.name}?`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            {conflict ? (
              <Button variant="primary" loading={update.isPending} onClick={deactivateInstead}>
                Deactivate instead
              </Button>
            ) : (
              <Button variant="danger" loading={busy} onClick={confirmDelete}>
                Delete role
              </Button>
            )}
          </>
        }
      >
        <div className="text-body text-text-muted flex flex-col gap-3">
          <p>
            The role and its permission set are removed for good. Accounts are untouched — this
            deletes the definition, not the people.
          </p>
          <p>
            <span className="text-text font-medium">{holderSentence(holderCount)}.</span>{' '}
            {held
              ? 'The API refuses to delete a role in use; move those accounts to another role first, or deactivate this one so nobody new can be given it.'
              : 'Nothing points at it, so the delete will go through.'}
          </p>
          {conflict && (
            <p
              role="alert"
              className="border-danger/35 bg-danger-muted text-caption text-danger-muted-fg rounded-md border px-3 py-2 font-medium"
            >
              {conflict}
            </p>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}

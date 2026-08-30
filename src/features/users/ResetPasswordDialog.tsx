import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, DialogClose, DialogContent, DialogRoot } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { accountLocation, accountPath, reportMutationError, suggestPassword } from './formUtils'
import type { MessageResponse, UserPasswordResetRequest, UserResponse } from '@/api/schema'

const schema = z.object({
  new_password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters'),
})

type FormValues = z.infer<typeof schema>

/**
 * The new password is shown in plain text on purpose: the administrator has to
 * read it back to the person it belongs to, and a masked field they cannot
 * verify is how the wrong string gets dictated down a phone line.
 */
export function ResetPasswordDialog({
  user,
  isSelf,
  open,
  onOpenChange,
}: {
  user: UserResponse
  /** The server refuses a reset of your own password here — a 403, by design. */
  isSelf: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { isSuperadmin } = useAuth()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: '' },
  })

  useEffect(() => {
    if (open) reset({ new_password: '' })
  }, [open, user.id, reset])

  const resetPassword = useMutation({
    mutationFn: (values: FormValues) =>
      apiPost<MessageResponse>(endpoints.users.resetPassword(user.id), {
        new_password: values.new_password,
      } satisfies UserPasswordResetRequest),
    onSuccess: () => {
      // Revoking their sessions changes what the list can say about them, so
      // the domain root is invalidated like any other write.
      void queryClient.invalidateQueries({ queryKey: qk.users.all() })
      toast.success(`Password reset for ${user.full_name} — they are signed out everywhere`)
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, ['new_password']),
  })

  /**
   * This endpoint is for somebody else's password. Your own goes through
   * `/auth/change-password`, which demands the current one — an administrator
   * who could silently re-key their own account is an administrator whose
   * stolen session can lock the real owner out. Rather than let the click
   * collect a 403, say where the control actually lives.
   */
  if (isSelf) {
    return (
      <DialogRoot open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="sm"
          title="Reset your own password elsewhere"
          footer={
            <DialogClose asChild>
              <Button variant="primary">Got it</Button>
            </DialogClose>
          }
        >
          <p className="text-body text-text-muted">
            This screen sets a password for somebody else. To change your own, go to{' '}
            <Link to={accountPath(isSuperadmin)} className="text-accent underline underline-offset-2">
              {accountLocation(isSuperadmin)}
            </Link>{' '}
            and use <span className="text-text font-medium">Change password</span> — it asks for your
            current password first, which is what stops anyone who finds your screen unlocked from
            taking the account.
          </p>
        </DialogContent>
      </DialogRoot>
    )
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      confirmLabel="Reset password"
      loading={resetPassword.isPending}
      onConfirm={handleSubmit((values) => resetPassword.mutate(values))}
      title={`Reset the password for ${user.full_name}?`}
      body={
        /* The password field is 32px tall and the wand beside it is a 32px
           square — right under a mouse, both short of a fingertip. The wand has
           to grow in both directions or it becomes a lozenge next to the taller
           field. */
        <div className="max-sm:[&_input]:min-h-tap flex flex-col gap-4">
          <p>
            Their current password stops working immediately. They sign in as{' '}
            <span className="text-text font-mono">{user.username}</span> with the password you set
            below, and can change it themselves under Settings › Your account.
          </p>

          {/* Said before the click, not after. A reset ends every session that
              account has open — on the front desk machine, on a phone, on a
              tablet in a consulting room — and someone doing this mid-clinic to
              help a colleague deserves to know they are about to sign them out
              of a screen they are standing in front of. */}
          <p className="border-warning/25 bg-warning-muted text-caption text-warning-muted-fg rounded-md border px-3 py-2">
            This also signs {user.full_name} out of every device. Each session they have open —
            including one they may be using right now — is revoked, and they will have to sign in
            again with the new password.
          </p>

          <Field
            label="New password"
            hint="At least 8 characters. Shown in plain text so you can pass it on accurately."
            error={errors.new_password?.message}
            required
          >
            {(a) => (
              <div className="flex items-center gap-2">
                <Input
                  {...a}
                  {...register('new_password')}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="min-h-tap min-w-tap sm:min-h-0 sm:min-w-0"
                  aria-label="Suggest a password"
                  onClick={() =>
                    setValue('new_password', suggestPassword(), {
                      shouldValidate: true,
                    })
                  }
                >
                  <Wand2 aria-hidden className="size-4" />
                </Button>
              </div>
            )}
          </Field>
        </div>
      }
    />
  )
}

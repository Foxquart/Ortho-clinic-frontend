import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { reportMutationError, suggestPassword } from './formUtils'
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
  open,
  onOpenChange,
}: {
  user: UserResponse
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
      toast.success(`Password reset for ${user.full_name}`)
      onOpenChange(false)
    },
    onError: (error) => reportMutationError(error, setError, ['new_password']),
  })

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
        <div className="flex flex-col gap-4">
          <p>
            Their current password stops working immediately. They sign in as{' '}
            <span className="font-mono text-text">{user.username}</span> with the password you
            set below, and can change it themselves under Settings › Your account.
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

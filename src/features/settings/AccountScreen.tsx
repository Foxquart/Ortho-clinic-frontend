import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { apiPost } from '@/api/http'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { Badge } from '@/components/ui/Badge'

const schema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: z.string().min(8, 'Use at least 8 characters'),
    confirm_password: z.string().min(1, 'Repeat the new password'),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'The two passwords do not match',
  })
  .refine((v) => v.new_password !== v.current_password, {
    path: ['new_password'],
    message: 'Choose a password different from the current one',
  })

type FormValues = z.infer<typeof schema>

export function AccountScreen() {
  const { user, role } = useAuth()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const changePassword = useMutation({
    mutationFn: (values: FormValues) =>
      apiPost('/auth/change-password', {
        current_password: values.current_password,
        new_password: values.new_password,
      }),
    onSuccess: () => {
      reset()
      toast.success('Password changed')
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        let matched = false
        for (const [path, message] of Object.entries(fields)) {
          if (path === 'current_password' || path === 'new_password') {
            setError(path, { message })
            matched = true
          }
        }
        if (!matched) {
          setError('current_password', {
            message: error.status === 400 ? 'That password is not correct' : error.message,
          })
        }
      }
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Your account" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-label text-text-subtle">Name</p>
            <p className="mt-0.5 text-body text-text">{user?.full_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-label text-text-subtle">Username</p>
            <p className="mt-0.5 font-mono text-body text-text">{user?.username}</p>
          </div>
          <div>
            <p className="text-label text-text-subtle">Email</p>
            <p className="mt-0.5 text-body text-text">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-label text-text-subtle">Role</p>
            <p className="mt-0.5">
              <Badge tone="accent">{role?.name ?? '—'}</Badge>
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Change password"
          description="You will stay signed in on this device."
        />
        <CardBody>
          <form
            noValidate
            onSubmit={handleSubmit((values) => changePassword.mutate(values))}
            /* The three password fields are 32px tall — right under a mouse and
               short of a fingertip. Raised from the form root rather than field
               by field; above `sm` the original density returns. */
            className="flex max-w-sm flex-col gap-4 max-sm:[&_input]:min-h-tap"
          >
            <Field label="Current password" error={errors.current_password?.message} required>
              {(a) => (
                <Input
                  {...a}
                  {...register('current_password')}
                  type="password"
                  autoComplete="current-password"
                />
              )}
            </Field>

            <Field
              label="New password"
              hint="At least 8 characters."
              error={errors.new_password?.message}
              required
            >
              {(a) => (
                <Input
                  {...a}
                  {...register('new_password')}
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </Field>

            <Field label="Repeat new password" error={errors.confirm_password?.message} required>
              {(a) => (
                <Input
                  {...a}
                  {...register('confirm_password')}
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </Field>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                className="min-h-tap w-full sm:min-h-0 sm:w-auto"
                loading={changePassword.isPending}
                disabled={!isDirty}
              >
                Change password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

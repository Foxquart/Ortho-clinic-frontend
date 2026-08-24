import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

const schema = z.object({
  username: z.string().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
})

type FormValues = z.infer<typeof schema>

export function LoginScreen() {
  const { login, isAuthenticated, isLoading, isLoggingIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })

  useEffect(() => {
    setFocus('username')
  }, [setFocus])

  if (isLoading) return null
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' && from !== '/' ? from : '/dashboard'} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' && from !== '/' ? from : '/dashboard', { replace: true })
    } catch (error) {
      // 401 here means bad credentials — never say which field was wrong.
      if (error instanceof ApiError) {
        setFormError(
          error.status === 401 && !error.message.includes('cookie')
            ? 'Username or password is incorrect.'
            : error.message,
        )
      } else {
        setFormError('Could not sign in. Please try again.')
      }
    }
  })

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-accent text-body font-bold text-accent-fg shadow-sm"
          >
            O
          </div>
          <div>
            <h1 className="text-title font-semibold tracking-tight text-text">OrthoClinic</h1>
            <p className="mt-1 text-caption text-text-muted">Sign in to continue</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm"
        >
          <Field label="Username" error={errors.username?.message} required>
            {(a) => (
              <Input
                {...a}
                {...register('username')}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputSize="lg"
                iconLeft={<User />}
                placeholder="admin"
              />
            )}
          </Field>

          <Field label="Password" error={errors.password?.message} required>
            {(a) => (
              <Input
                {...a}
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                inputSize="lg"
                iconLeft={<Lock />}
                slotRight={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="rounded p-0.5 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </button>
                }
              />
            )}
          </Field>

          {formError && (
            <p
              role="alert"
              className={cn(
                'rounded-md border border-danger/25 bg-danger-muted px-3 py-2 text-caption text-danger',
              )}
            >
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={isLoggingIn}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-caption text-text-subtle">
          Trouble signing in? Confirm the app and the API are on the same hostname.
        </p>
      </div>
    </div>
  )
}

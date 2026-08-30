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

/**
 * Where sign-in lands.
 *
 * The staff surface has two disjoint trees, so "where I was going" is only
 * honourable when the destination belongs to the tree this account can reach.
 * A superadmin whose session expired on `/superadmin/roles` must come back to
 * it; a superadmin carrying a stale `from` of `/patients` — a bookmark, a
 * shared link, an old tab — must not, because RequireClinic would bounce them
 * to `/superadmin` the instant the clinic route mounted. Honouring that `from`
 * would show a flash of the wrong console and put a dead entry in history.
 *
 * The clinic user's case is the mirror and needs no special handling beyond
 * the same prefix test: a `from` inside `/superadmin` is not theirs to return
 * to, and RequireSuperadmin would answer it with a dead end rather than a
 * redirect — a worse landing after a successful sign-in than their own home.
 *
 * `/login` and `/` are excluded because both are round trips: `/` immediately
 * redirects here, and `/login` is where we already are.
 */
function landingPath(isSuperadmin: boolean, from: string | undefined): string {
  const home = isSuperadmin ? '/superadmin' : '/dashboard'
  if (!from || from === '/login' || from === '/') return home

  const inOperatorTree = from === '/superadmin' || from.startsWith('/superadmin/')
  return inOperatorTree === isSuperadmin ? from : home
}

const schema = z.object({
  username: z.string().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
})

type FormValues = z.infer<typeof schema>

export function LoginScreen() {
  const { login, isAuthenticated, isLoading, isLoggingIn, isSuperadmin } = useAuth()
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
    /* Already signed in and back on /login — a bookmark, or the back button
       after signing in. Context is authoritative here: the session was loaded
       by `/auth/me`, not by this form. */
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={landingPath(isSuperadmin, from)} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      /* `login()` resolves with the freshly re-fetched `/auth/me`, so its
         `is_superadmin` is the one fact we can trust at this moment — the
         `isSuperadmin` off context still describes the render that ran before
         the mutation settled. */
      const me = await login(values)
      const from = (location.state as { from?: string } | null)?.from
      navigate(landingPath(me.is_superadmin, from), { replace: true })
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
    <div className="bg-bg grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden
            className="bg-accent text-body text-accent-fg grid size-11 place-items-center rounded-xl font-bold shadow-sm"
          >
            O
          </div>
          <div>
            <h1 className="text-title text-text font-semibold tracking-tight">OrthoClinic</h1>
            <p className="text-caption text-text-muted mt-1">Sign in to continue</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-6 shadow-sm"
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
                /* Not a seed username. `admin` no longer exists as an account,
                   and naming the one that replaced it would print the vendor's
                   operator login on the clinic's own sign-in screen. */
                placeholder="your username"
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
                    className="hover:text-text focus-visible:outline-focus rounded p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
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
                'border-danger/25 bg-danger-muted text-caption text-danger rounded-md border px-3 py-2',
              )}
            >
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={isLoggingIn}>
            Sign in
          </Button>
        </form>

        <p className="text-caption text-text-subtle mt-6 text-center">
          Trouble signing in? Confirm the app and the API are on the same hostname.
        </p>
      </div>
    </div>
  )
}

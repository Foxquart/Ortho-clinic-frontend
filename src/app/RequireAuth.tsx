import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { EmptyState } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { ShieldOff } from 'lucide-react'
import type { Capability } from '@/lib/permissions'

/**
 * Gate for the authenticated shell. While the first `/auth/me` is in flight we
 * render nothing rather than a spinner — the check resolves in milliseconds
 * against a warm session, and a flashed loader on every reload looks broken.
 */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}

/** Route-level capability gate. Shows a dead end, never a redirect loop. */
export function RequireCapability({ capability }: { capability: Capability }) {
  const { can } = useAuth()

  if (!can(capability)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={<ShieldOff />}
          title="You do not have access to this area"
          description="Your account role does not include this permission. An administrator can change it."
          action={
            <Button variant="secondary" asChild>
              <a href="/app">Back to dashboard</a>
            </Button>
          }
        />
      </div>
    )
  }

  return <Outlet />
}

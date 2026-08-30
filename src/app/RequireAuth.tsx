import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { EmptyState } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { ShieldOff } from 'lucide-react'
import type { Permission } from '@/lib/permissions'

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

/**
 * Where "back to where I belong" points for this user.
 *
 * The two trees are disjoint (see the guards below), so a dead-end screen
 * cannot offer one hardcoded escape hatch: `/app` is the prescription pad,
 * which a superadmin is bounced out of the instant they touch it. Handing them
 * a link that redirects is a link that looks broken.
 */
function homePath(isSuperadmin: boolean): string {
  return isSuperadmin ? '/superadmin' : '/app'
}

/** Route-level permission gate. Shows a dead end, never a redirect loop. */
export function RequireCapability({ capability }: { capability: Permission }) {
  const { can, isSuperadmin } = useAuth()

  if (!can(capability)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={<ShieldOff />}
          title="You do not have access to this area"
          description="Your account role does not include this permission. An administrator can change it."
          action={
            <Button variant="secondary" asChild>
              <a href={homePath(isSuperadmin)}>Back to dashboard</a>
            </Button>
          }
        />
      </div>
    )
  }

  return <Outlet />
}

/**
 * The two guards below split the staff surface into two disjoint trees, and
 * they are deliberately NOT symmetric. The asymmetry is the whole design, so:
 *
 * A superadmin is the vendor's operator, not a clinician. They hold no
 * permission rows at all — the flag is the grant — so every clinical screen
 * would render for them and none of it would mean anything. There is always
 * exactly one right place to put them, `/superadmin`, so the clinic→superadmin
 * bounce is a REDIRECT: silent, safe, and it makes a stale bookmark to
 * `/patients` land somewhere useful instead of on an apology.
 *
 * The other direction has no such destination. A clinic user who types
 * `/superadmin` cannot be sent "back" — we do not know where they came from
 * (a deep link has no history), and sending them to `/dashboard` from a route
 * they may have reached *through* the dashboard is how redirect loops start.
 * So that direction is a DEAD END: an explanation and a link they choose to
 * follow. A refusal the user can read beats a navigation they did not ask for.
 */

/** Gate for the superadmin tree. A dead end for everyone else. */
export function RequireSuperadmin() {
  const { isSuperadmin } = useAuth()

  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={<ShieldOff />}
          title="This is the operator console"
          description="Only the system operator can open this area. Your clinic account has no part in it — everything you need is in the app."
          action={
            <Button variant="secondary" asChild>
              <a href="/app">Back to the app</a>
            </Button>
          }
        />
      </div>
    )
  }

  return <Outlet />
}

/**
 * Gate for the clinic tree — the mirror of `RequireSuperadmin`, and what
 * actually enforces "a superadmin sees nothing else". Without it the guard
 * above would only hide the console from clinic users; a superadmin
 * deep-linking `/patients` would still be shown a clinical screen.
 */
export function RequireClinic() {
  const { isSuperadmin } = useAuth()

  if (isSuperadmin) return <Navigate to="/superadmin" replace />

  return <Outlet />
}

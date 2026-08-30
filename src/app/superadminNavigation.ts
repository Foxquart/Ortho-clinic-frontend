import { Activity, ShieldCheck, UserCog, Users } from 'lucide-react'

/**
 * The operator console's four destinations.
 *
 * Deliberately its own file rather than a fifth export in `navigation.ts`.
 * That file describes a prescribing app — its rows carry `g` chords, permission
 * gates and command-palette hints because they compete for a doctor's
 * attention. None of that applies here: the superadmin is the vendor's
 * operator, they hold every permission by flag rather than by grant (so a
 * `requires` field would always pass), and no chord or palette is mounted in
 * this shell. Sharing the type would have meant carrying four fields that are
 * dead in one of the two consumers, which `noUnusedLocals` would not catch and
 * a reader would have to disprove.
 *
 * Keep the list short on purpose. Every row added here is a screen a clinic
 * user can never see, so it has to be genuinely vendor-side work.
 */
export interface SuperadminNavItem {
  to: string
  label: string
  icon: typeof Activity
  /** Light up on an exact path match only — the index row needs this. */
  end?: boolean
  /** One line under the label in the rail. The console is used rarely enough
   *  that naming what a row does is worth the vertical space. */
  hint: string
}

export const SUPERADMIN_NAV: readonly SuperadminNavItem[] = [
  {
    to: '/superadmin',
    label: 'Overview',
    icon: Activity,
    end: true,
    hint: 'Uptime, errors, database and sessions',
  },
  {
    to: '/superadmin/users',
    label: 'Users',
    icon: Users,
    hint: 'Onboard and deactivate accounts',
  },
  {
    to: '/superadmin/roles',
    label: 'Roles',
    icon: ShieldCheck,
    hint: 'Levels and permission sets',
  },
  {
    to: '/superadmin/account',
    label: 'Your account',
    icon: UserCog,
    hint: 'Change your own password',
  },
] as const

/**
 * Which rail row owns the current URL.
 *
 * `NavLink`'s own `end` handling is not quite enough: `/superadmin/roles/:id`
 * must keep the Roles row lit, while `/superadmin/users` must not light the
 * index row that shares its prefix. Matching on a path *segment* boundary says
 * both at once, and mirrors what `isNavActive` does for the clinic rail.
 */
export function isSuperadminNavActive(item: SuperadminNavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

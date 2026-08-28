import { NavLink, Outlet } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/app/AuthProvider'
import { DEMOTED_NAV } from '@/app/navigation'
import { PageHeader } from '@/components/ui/Surface'
import type { Capability } from '@/lib/permissions'

interface SettingsTab {
  to: string
  label: string
  end?: boolean
  requires?: Capability
}

const TABS: readonly SettingsTab[] = [
  { to: '/settings', label: 'Clinic', end: true },
  { to: '/settings/account', label: 'Your account' },
  { to: '/settings/users', label: 'Users', requires: 'users.manage' },
  { to: '/settings/audit', label: 'Audit log', requires: 'audit.read' },
  { to: '/settings/site', label: 'Public site', requires: 'portfolio.manage' },
  { to: '/appointments?hours=1', label: 'Clinic hours' },
]

/**
 * Settings is also where the demoted screens live. The dashboard and the
 * schedule kept their own top-level routes — a bookmark to `/appointments` must
 * still work — so they are listed here as links out rather than as tabs that
 * pretend to be settings pages. The arrow says they leave this layout.
 */
const OUTSIDE_TABS = new Set(['/dashboard', '/appointments', '/appointments?hours=1'])

/*
 * Phone layout, decided rather than inherited.
 *
 * This is already the shape a phone needs — one column, navigation above the
 * content pane, never a side rail — so the question was only whether the six
 * destinations should keep wrapping onto three lines or collapse into a single
 * horizontally scrollable strip. Wrapping wins here. A scroll strip saves about
 * ninety vertical pixels and pays for them by hiding "Public site" and "Clinic
 * hours" past the right edge behind a swipe nobody is told about; this app's
 * reader is a surgeon who browses rather than hunts, and Settings is the screen
 * he visits least often, so every destination staying visible is worth more
 * than the pixels. What the row genuinely lacked was height: `py-2` gave a 36px
 * target, so below `sm` each tab is raised to the 44px tap minimum.
 */
const TAB_CLASS =
  '-mb-px flex min-h-tap items-center gap-1.5 border-b-2 px-3 py-2 text-body font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0'

export function SettingsLayout() {
  const { can } = useAuth()
  const tabs = TABS.filter((t) => !t.requires || can(t.requires))
  const elsewhere = DEMOTED_NAV.filter(
    (item) => OUTSIDE_TABS.has(item.to) && (!item.requires || can(item.requires)),
  )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Settings"
        description="Clinic details, print templates, accounts, the public website — and the screens that are not part of prescribing."
      />

      <nav
        aria-label="Settings sections"
        className="flex flex-wrap items-center gap-1 border-b border-border"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                TAB_CLASS,
                isActive
                  ? 'border-accent text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}

        {elsewhere.length > 0 && (
          <span aria-hidden className="mx-2 h-4 w-px shrink-0 bg-border" />
        )}

        {elsewhere.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(TAB_CLASS, 'border-transparent text-text-muted hover:text-text')}
          >
            {item.label}
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-text-subtle" />
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}

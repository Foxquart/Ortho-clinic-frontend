import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu as MenuIcon, Monitor, Moon, Sun, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu'
import { useAuth } from './AuthProvider'
import { useTheme } from './ThemeProvider'
import {
  isSuperadminNavActive,
  SUPERADMIN_NAV,
  type SuperadminNavItem,
} from './superadminNavigation'

/**
 * The operator console's chrome.
 *
 * Structurally this is `AppShell` — same rail width, same mobile drawer, same
 * account menu — because the two consoles are the same product and an operator
 * who has just left the clinic app should not have to relearn where anything
 * is. What it deliberately does NOT carry is everything bound to clinical
 * work: no command palette (it searches patients and medicines, none of which
 * exist here), no `g` chords (every chord points at a route this tree cannot
 * reach), and no global search field, which would be a box that answers
 * nothing.
 *
 * The one visual difference is a named header. Users and Roles are screens the
 * clinic tree also has, so without a standing label an operator could edit the
 * vendor's role table believing they were in a clinic's. A word costs nothing
 * and removes the doubt; a second colour system would have been a bigger claim
 * than the difference deserves.
 */
function NavRow({ item, onNavigate }: { item: SuperadminNavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  const { pathname } = useLocation()
  const isActive = isSuperadminNavActive(item, pathname)

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        /* Two lines per row, so min-h rather than the clinic rail's fixed h-10.
           The console is visited rarely; naming what each row does is worth
           more here than the density that a daily-driver rail needs. */
        'group relative flex min-h-10 flex-col justify-center rounded-md px-2.5 py-1.5',
        'duration-fast ease-standard transition-colors',
        'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        isActive
          ? 'bg-surface-raised text-text'
          : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'bg-accent absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full',
          'duration-fast transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span className="flex items-center gap-2.5">
        <Icon
          aria-hidden
          className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'text-text-subtle')}
        />
        <span className="text-body truncate font-medium">{item.label}</span>
      </span>
      <span className="text-caption text-text-subtle truncate pl-[26px]">{item.hint}</span>
    </NavLink>
  )
}

function ThemeToggle() {
  const { resolved, setChoice } = useTheme()
  const next = resolved === 'light' ? 'dark' : 'light'
  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      aria-label={`Switch to ${next} mode`}
      className="text-label text-text-muted hover:text-text hover:bg-surface-hover duration-fast flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors"
    >
      {resolved === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <span className="hidden sm:inline">{resolved === 'light' ? 'Dark' : 'Light'}</span>
    </button>
  )
}

function ThemeMenuItems() {
  const { choice, setChoice } = useTheme()
  const options = [
    { value: 'light' as const, label: 'Light', icon: <Sun /> },
    { value: 'dark' as const, label: 'Dark', icon: <Moon /> },
    { value: 'system' as const, label: 'System', icon: <Monitor /> },
  ]
  return (
    <>
      <MenuLabel>Appearance</MenuLabel>
      {options.map((o) => (
        <MenuItem key={o.value} icon={o.icon} onSelect={() => setChoice(o.value)}>
          <span className={cn(choice === o.value && 'text-accent')}>{o.label}</span>
        </MenuItem>
      ))}
    </>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, role, logout } = useAuth()
  const nav = useNavigate()

  /* No permission filtering on these rows, unlike the clinic rail. The
     superadmin flag bypasses the permission check entirely (see
     AuthProvider.can), so a `requires` gate here would be a condition that can
     never be false — and a reader would have to work that out to trust it. */

  const initials =
    (user?.full_name ?? user?.username ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'

  return (
    <div className="flex h-full flex-col gap-1 p-2">
      <Link
        to="/superadmin"
        onClick={onNavigate}
        className={cn(
          'mb-2 flex items-center gap-2 rounded-md px-2 py-2',
          'duration-fast hover:bg-surface-raised/60 transition-colors',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
      >
        <span
          aria-hidden
          className="bg-text text-bg grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-bold"
        >
          O
        </span>
        <span className="min-w-0">
          <span className="text-body text-text block truncate font-semibold tracking-tight">
            OrthoClinic
          </span>
          <span className="text-caption text-text-subtle block truncate">Operator console</span>
        </span>
      </Link>

      <nav aria-label="Operator" className="flex flex-col gap-1">
        {SUPERADMIN_NAV.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left',
                'duration-fast hover:bg-surface-raised transition-colors',
                'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              <span
                aria-hidden
                className="bg-surface-raised text-caption text-text-muted grid size-8 shrink-0 place-items-center rounded-full font-semibold"
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-label text-text block truncate font-medium">
                  {user?.full_name ?? user?.username}
                </span>
                <span className="text-caption text-text-subtle block truncate">{role?.name}</span>
              </span>
              <ChevronDown aria-hidden className="text-text-subtle size-4 shrink-0" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <ThemeMenuItems />
            <MenuSeparator />
            {/* Inside this tree, not `/settings/account` — that path lives in
                the clinic tree and RequireClinic would bounce us straight back. */}
            <MenuItem onSelect={() => nav('/superadmin/account')}>Change password</MenuItem>
            <MenuItem
              destructive
              icon={<LogOut />}
              onSelect={() => {
                void logout().then(() => nav('/login', { replace: true }))
              }}
            >
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  )
}

export function SuperadminShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  return (
    /* Same one-viewport rule as the clinic shell: the page never scrolls, only
       `main` does, so the rail and the header stay put. */
    <div className="bg-bg relative flex h-dvh overflow-hidden">
      <aside
        data-print-hide
        className="border-border bg-surface sticky top-0 hidden h-dvh w-56 shrink-0 border-r lg:block"
      >
        <Sidebar />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" data-print-hide>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="bg-overlay absolute inset-0 animate-[fade-in_140ms_var(--ease-standard)]"
          />
          <div className="border-border bg-surface absolute inset-y-0 left-0 w-64 animate-[sheet-in-right_220ms_var(--ease-out-quint)] border-r [--tw-enter:0]">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-print-hide
          className="border-border bg-bg/80 sticky top-0 z-30 flex h-[var(--app-header-h)] shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md"
        >
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            iconLeft={
              mobileNavOpen ? (
                <X aria-hidden className="size-4" />
              ) : (
                <MenuIcon aria-hidden className="size-4" />
              )
            }
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            Menu
          </Button>

          {/* The clinic shell puts the command-palette search here. Nothing in
              this console is searchable, so the space says which console this
              is instead — the one thing an operator most needs to be sure of. */}
          <span className="flex min-w-0 items-center gap-2">
            <span className="border-border bg-surface text-caption text-text-muted rounded-md border px-2 py-0.5 font-semibold tracking-wide uppercase">
              Operator
            </span>
            <span className="text-label text-text-subtle truncate">
              System administration — not a clinic account
            </span>
          </span>

          <span className="ml-auto flex items-center">
            <ThemeToggle />
          </span>
        </header>

        <main className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

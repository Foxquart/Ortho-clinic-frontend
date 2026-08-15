import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu as MenuIcon, Monitor, Moon, Search, Sun, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ROLE_LABEL, type Role } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Badge'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
} from '@/components/ui/Menu'
import { useAuth } from './AuthProvider'
import { useTheme } from './ThemeProvider'
import { isNavActive, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './navigation'
import { CommandPalette } from './CommandPalette'
import { useGoToShortcuts } from './useGoToShortcuts'
import { useFocusTargetFromUrl } from './useFocusTargetFromUrl'

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  const { pathname } = useLocation()
  /* Not `NavLink`'s own matching: `/prescriptions/new` belongs to the row above
     `/prescriptions`, and only the row itself knows that. */
  const isActive = isNavActive(item, pathname)

  return (
    <Tooltip content={item.label} side="right" shortcut={`g ${item.goKey}`}>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          /* h-10 = a 40px hit target on every nav row; the label stays
             text-body so the rail reads at arm's length. */
          'group relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-body font-medium',
          'transition-colors duration-fast ease-standard',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          isActive
            ? 'bg-surface-raised text-text'
            : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent',
            'transition-opacity duration-fast',
            isActive ? 'opacity-100' : 'opacity-0',
          )}
        />
        <Icon
          aria-hidden
          className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'text-text-subtle')}
        />
        <span className="truncate">{item.label}</span>
      </NavLink>
    </Tooltip>
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
        <MenuItem
          key={o.value}
          icon={o.icon}
          onSelect={() => setChoice(o.value)}
        >
          <span className={cn(choice === o.value && 'text-accent')}>{o.label}</span>
        </MenuItem>
      ))}
    </>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, role, can, logout } = useAuth()
  const nav = useNavigate()

  const visible = (items: readonly NavItem[]) =>
    items.filter((i) => !i.requires || can(i.requires))

  /* Two groups, no headings. Writing a prescription is what the app does; the
     three below it are the records you consult while doing it. With four rows
     total, a hairline says that better than a pair of uppercase labels would. */
  const primary = visible(PRIMARY_NAV)
  const writing = primary.filter((i) => i.to === '/app')
  const records = primary.filter((i) => i.to !== '/app')

  const initials =
    (user?.full_name ?? user?.username ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'

  return (
    <div className="flex h-full flex-col gap-1 p-2">
      <Link
        to="/app"
        onClick={onNavigate}
        className={cn(
          'mb-2 flex items-center gap-2 rounded-md px-2 py-2',
          'transition-colors duration-fast hover:bg-surface-raised/60',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-bold text-accent-fg"
        >
          O
        </span>
        <span className="truncate text-body font-semibold tracking-tight text-text">
          OrthoClinic
        </span>
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {writing.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}

        {writing.length > 0 && records.length > 0 && (
          <hr aria-hidden className="mx-2.5 my-2 border-0 border-t border-border" />
        )}

        {records.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5">
        <nav aria-label="Secondary" className="flex flex-col gap-0.5">
          {visible(SECONDARY_NAV).map((item) => (
            <NavRow key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </nav>

        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left',
                'transition-colors duration-fast hover:bg-surface-raised',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              )}
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-caption font-semibold text-text-muted"
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-medium text-text">
                  {user?.full_name ?? user?.username}
                </span>
                <span className="block truncate text-caption text-text-subtle">
                  {ROLE_LABEL[role as Role] ?? role}
                </span>
              </span>
              <ChevronDown aria-hidden className="size-4 shrink-0 text-text-subtle" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <ThemeMenuItems />
            <MenuSeparator />
            <MenuItem onSelect={() => nav('/settings/account')}>Change password</MenuItem>
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

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  useGoToShortcuts()
  useFocusTargetFromUrl()

  // ⌘K / Ctrl+K anywhere except while typing into a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop rail */}
      <aside
        data-print-hide
        className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r border-border bg-surface lg:block"
      >
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" data-print-hide>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-overlay animate-[fade-in_140ms_var(--ease-standard)]"
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface animate-[sheet-in-right_220ms_var(--ease-out-quint)] [--tw-enter:0]">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-print-hide
          className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-md"
        >
          {/* Labelled, not icon-only: the word says what the hamburger only
              implies. */}
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

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2.5 sm:max-w-72',
              'text-label text-text-subtle transition-colors duration-fast',
              'hover:border-border-strong hover:text-text-muted',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <Search aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">Search patients, medicines, actions…</span>
            <span className="ml-auto hidden shrink-0 items-center gap-0.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

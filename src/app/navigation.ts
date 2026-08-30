import {
  CalendarDays,
  FileText,
  Globe,
  LayoutDashboard,
  ListChecks,
  Mic,
  Pill,
  Settings,
  SquarePen,
  Users,
} from 'lucide-react'
import type { Permission } from '@/lib/permissions'

/**
 * The app is a digital prescription pad, so the navigation says so.
 *
 * A row earns a place in the sidebar only if it is part of prescribing: the act
 * of prescribing, the record of what was prescribed, and the lookups that
 * support both — patients, the formulary, and the advice library the doctor
 * appends to a prescription. The advice library sits next to Medicines because
 * it is formulary-adjacent: `medicine.write` and `advice.write` are separate
 * grants, so a clinic can hand them to different people, but both are curation
 * of the same prescribing vocabulary and belong beside the formulary rather
 * than buried in Settings. Everything else — the
 * public-site CMS — is real, still routed and still reachable, but it is not
 * what this software is for and it no longer competes for the doctor's eye.
 * That lives in `DEMOTED_NAV`: absent from the sidebar, present in the command
 * palette and in Settings, and still holding its original `g` chord so no
 * muscle memory breaks.
 *
 * Dictation is deliberately *not* a destination. It is how you write a
 * prescription, so it is an action (`PRESCRIBE_ACTIONS`), reachable from the
 * home screen, the palette and `g v` — never from the sidebar.
 *
 * ## Reserved chords
 *
 * | Keys  | Goes to                                                   |
 * |-------|-----------------------------------------------------------|
 * | `g n` | New prescription — home, where you pick dictate or type    |
 * | `g v` | Dictate a prescription — `/speech` with the mic already on |
 * | `g t` | Type a prescription — the pad, on the patient field        |
 * | `g r` | Prescriptions (the history)                               |
 * | `g p` | Patients                                                  |
 * | `g m` | Medicines                                                 |
 * | `g l` | Advice library                                            |
 * | `g s` | Settings                                                  |
 * | `g d` | Dashboard (demoted)                                       |
 * | `g a` | Appointments (demoted)                                    |
 * | `g w` | Public website CMS (demoted)                              |
 *
 * `g` chords never collide with a browser shortcut — they carry no modifier and
 * are ignored while a field has focus (see `useGoToShortcuts`). `⌘K`, `/`,
 * `Esc`, `⌘Enter`, `⌘S` and `?` stay reserved for what DESIGN.md §5 says they
 * are; nothing here rebinds them.
 */
export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  /** Two-key sequence after `g`, Linear-style: `g r` → prescriptions. */
  goKey: string
  /** Hide entirely when the user lacks this permission. */
  requires?: Permission
  /** Light up on an exact path match only. */
  end?: boolean
  /** Extra path prefixes that also belong to this row. */
  alsoMatch?: readonly string[]
  /** Path prefixes that belong to a different row and must not light this one. */
  notMatch?: readonly string[]
  /** One line for the command palette. Not shown in the sidebar. */
  hint?: string
}

/** An action, not a place. Carries a query string; never lives in the sidebar. */
export interface ActionItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  /** Two-key sequence after `g`, where the action is worth a chord. */
  goKey?: string
  requires?: Permission
  hint: string
}

export const PRIMARY_NAV: readonly NavItem[] = [
  {
    to: '/app',
    label: 'New prescription',
    icon: SquarePen,
    goKey: 'n',
    end: true,
    // The pad and the dictation screen are both "writing a prescription".
    alsoMatch: ['/prescriptions/new', '/speech'],
    requires: 'prescription.write',
    hint: 'Dictate or type a new prescription',
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    goKey: 'd',
    hint: 'Today at a glance: appointments and patients',
  },
  {
    to: '/appointments',
    label: 'Appointments',
    icon: CalendarDays,
    goKey: 'a',
    hint: 'The schedule and clinic hours',
  },
  {
    to: '/prescriptions',
    label: 'Prescriptions',
    icon: FileText,
    goKey: 'r',
    notMatch: ['/prescriptions/new'],
    hint: 'Everything written so far',
  },
  { to: '/patients', label: 'Patients', icon: Users, goKey: 'p', hint: 'Records and history' },
  { to: '/medicines', label: 'Medicines', icon: Pill, goKey: 'm', hint: 'The formulary' },
  {
    to: '/advice',
    label: 'Advice library',
    icon: ListChecks,
    goKey: 'l',
    requires: 'advice.write',
    hint: 'Saved instructions to append to a prescription',
  },
] as const

export const SECONDARY_NAV: readonly NavItem[] = [
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    goKey: 's',
    hint: 'Clinic, account, and the demoted screens',
  },
] as const

/**
 * Routed, guarded and linked from Settings — just not in the sidebar. Order
 * here is the order they appear at the bottom of the command palette.
 */
export const DEMOTED_NAV: readonly NavItem[] = [
  {
    to: '/settings/site',
    label: 'Public website',
    icon: Globe,
    goKey: 'w',
    requires: 'portfolio.write',
    hint: 'Pages, services, testimonials and gallery',
  },
] as const

/**
 * The two ways to start a prescription. These are the first entries in the
 * command palette and the two cards on the home screen.
 */
export const PRESCRIBE_ACTIONS: readonly ActionItem[] = [
  {
    to: '/speech?autostart=1',
    label: 'Dictate a prescription',
    icon: Mic,
    goKey: 'v',
    requires: 'speech.use',
    hint: 'Opens with the microphone already live',
  },
  {
    to: '/prescriptions/new?focus=patient',
    label: 'Type a prescription',
    icon: SquarePen,
    goKey: 't',
    requires: 'prescription.write',
    hint: 'Opens the pad on the patient field',
  },
] as const

/** Everything a `g` chord can reach, sidebar or not. */
export const GO_TO_TARGETS: readonly { goKey: string; to: string }[] = [
  ...PRIMARY_NAV,
  ...SECONDARY_NAV,
  ...DEMOTED_NAV,
  ...PRESCRIBE_ACTIONS.filter((a): a is ActionItem & { goKey: string } => Boolean(a.goKey)),
].map((item) => ({ goKey: item.goKey, to: item.to }))

function underOrEqual(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base.endsWith('/') ? base : `${base}/`)
}

/**
 * Which sidebar row owns the current URL. `NavLink`'s own matching cannot
 * express "`/prescriptions/new` belongs to the row above me", so the rows say
 * it themselves and the shell asks this instead.
 */
export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.notMatch?.some((p) => underOrEqual(pathname, p))) return false
  if (item.end ? pathname === item.to : underOrEqual(pathname, item.to)) return true
  return item.alsoMatch?.some((p) => underOrEqual(pathname, p)) ?? false
}

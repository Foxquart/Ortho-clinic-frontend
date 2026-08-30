import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthProvider'
import { AppShell } from './AppShell'
import { RequireAuth, RequireCapability, RequireClinic, RequireSuperadmin } from './RequireAuth'
import { SuperadminShell } from './SuperadminShell'
import { RouteError, NotFound } from './RouteError'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { IS_STAFF, staffUrl } from './surface'

/* Screens are split per route: the prescription pad and the speech lab are the
   two heavy ones and neither should be in the login bundle. */
const PrescribeHome = lazy(() =>
  import('@/features/dashboard/PrescribeHome').then((m) => ({ default: m.PrescribeHome })),
)
const DashboardScreen = lazy(() =>
  import('@/features/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })),
)
const PatientListScreen = lazy(() =>
  import('@/features/patients/PatientListScreen').then((m) => ({ default: m.PatientListScreen })),
)
const PatientDetailScreen = lazy(() =>
  import('@/features/patients/PatientDetailScreen').then((m) => ({
    default: m.PatientDetailScreen,
  })),
)
const PrescriptionListScreen = lazy(() =>
  import('@/features/prescriptions/PrescriptionListScreen').then((m) => ({
    default: m.PrescriptionListScreen,
  })),
)
const PrescriptionPadScreen = lazy(() =>
  import('@/features/prescriptions/PrescriptionPadScreen').then((m) => ({
    default: m.PrescriptionPadScreen,
  })),
)
const PrescriptionDetailScreen = lazy(() =>
  import('@/features/prescriptions/PrescriptionDetailScreen').then((m) => ({
    default: m.PrescriptionDetailScreen,
  })),
)
const AppointmentsScreen = lazy(() =>
  import('@/features/appointments/AppointmentsScreen').then((m) => ({
    default: m.AppointmentsScreen,
  })),
)
const MedicinesScreen = lazy(() =>
  import('@/features/medicines/MedicinesScreen').then((m) => ({ default: m.MedicinesScreen })),
)
const SpeechScreen = lazy(() =>
  import('@/features/speech/SpeechScreen').then((m) => ({ default: m.SpeechScreen })),
)
const SettingsLayout = lazy(() =>
  import('@/features/settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })),
)
const ClinicSettingsScreen = lazy(() =>
  import('@/features/settings/ClinicSettingsScreen').then((m) => ({
    default: m.ClinicSettingsScreen,
  })),
)
const AccountScreen = lazy(() =>
  import('@/features/settings/AccountScreen').then((m) => ({ default: m.AccountScreen })),
)
const UsersScreen = lazy(() =>
  import('@/features/users/UsersScreen').then((m) => ({ default: m.UsersScreen })),
)
const AuditLogScreen = lazy(() =>
  import('@/features/audit/AuditLogScreen').then((m) => ({ default: m.AuditLogScreen })),
)
const AdviceLibraryScreen = lazy(() =>
  import('@/features/advice/AdviceLibraryScreen').then((m) => ({
    default: m.AdviceLibraryScreen,
  })),
)
const SiteCmsScreen = lazy(() =>
  import('@/features/portfolio/SiteCmsScreen').then((m) => ({ default: m.SiteCmsScreen })),
)
/* Superadmin-only screens. Split out for the same reason the pad is: no clinic
   user ever loads them, and a monitoring dashboard that polls six endpoints has
   no business in a doctor's first paint. */
const SystemDashboardScreen = lazy(() =>
  import('@/features/system/SystemDashboardScreen').then((m) => ({
    default: m.SystemDashboardScreen,
  })),
)
const RolesScreen = lazy(() =>
  import('@/features/roles/RolesScreen').then((m) => ({ default: m.RolesScreen })),
)
const RoleEditorScreen = lazy(() =>
  import('@/features/roles/RoleEditorScreen').then((m) => ({ default: m.RoleEditorScreen })),
)
const PublicSite = lazy(() =>
  import('@/features/public/PublicSite').then((m) => ({ default: m.PublicSite })),
)
const LandingPage = lazy(() =>
  import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
)

function LazyBoundary() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  )
}

/** Auth context wraps everything, including the public site, so a signed-in
 *  admin previewing the patient site still has their session. */
function Root() {
  return (
    <AuthProvider>
      {/* index.html carries the marketing title and description as the floor
          for crawlers that never run the bundle. On the staff hostname that is
          the wrong document entirely: React 19 hoists these, so they replace it
          as soon as the app mounts. The noindex is belt-and-braces next to the
          X-Robots-Tag in vercel.json — that header is what a non-rendering
          crawler sees, this is what a rendering one sees. */}
      {IS_STAFF && (
        <>
          <title>OrthoClinic — staff</title>
          <meta name="description" content="Clinical workspace. Staff access only." />
          <meta name="robots" content="noindex, nofollow" />
        </>
      )}
      <Outlet />
    </AuthProvider>
  )
}

/**
 * Hard navigation to another origin. A react-router <Navigate> cannot cross
 * hostnames — it would rewrite the path in place and land on a route that does
 * not exist on this surface.
 */
function ExternalRedirect({ to }: { to: string }) {
  window.location.replace(to)
  return null
}

/**
 * Where a signed-in user's home is.
 *
 * `<Navigate>` cannot read context, and the two trees disagree about what `/`
 * means, so the bare hostname needs a component to ask. `isLoading` renders
 * nothing rather than guessing `/dashboard` and bouncing a superadmin one beat
 * later — the same reasoning as RequireAuth's silent first paint: a wrong
 * screen shown for 80ms is worse than a still one.
 */
function HomeRedirect() {
  const { isSuperadmin, isLoading } = useAuth()

  if (isLoading) return null

  return <Navigate to={isSuperadmin ? '/superadmin' : '/dashboard'} replace />
}

/*
 * THE CLINIC TREE — every screen this software exists for.
 *
 * `RequireClinic` sits between the session check and the shell rather than on
 * each route, because "a superadmin sees no clinical screen" is a property of
 * the whole tree, not of any route in it. Guarding one level up means a route
 * added below inherits the rule instead of having to remember it.
 */
const appRoutes = {
  element: <RequireAuth />,
  children: [
    {
      element: <RequireClinic />,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              element: <LazyBoundary />,
              children: [
                /* The prescription pad's own front door. Reachable, but not
                   where `/` lands — the staff surface opens on the dashboard. */
                { path: 'app', element: <PrescribeHome /> },
                { path: 'dashboard', element: <DashboardScreen /> },
                { path: 'patients', element: <PatientListScreen /> },
                { path: 'patients/:patientId', element: <PatientDetailScreen /> },
                { path: 'prescriptions', element: <PrescriptionListScreen /> },
                {
                  element: <RequireCapability capability="prescription.write" />,
                  children: [{ path: 'prescriptions/new', element: <PrescriptionPadScreen /> }],
                },
                {
                  path: 'prescriptions/:prescriptionId',
                  element: <PrescriptionDetailScreen />,
                },
                { path: 'appointments', element: <AppointmentsScreen /> },
                { path: 'medicines', element: <MedicinesScreen /> },
                {
                  /* The advice library sits beside Medicines because both are
                     curation of the same prescribing vocabulary — but they are
                     two grants, not one: `medicine.write` and `advice.write`
                     are separate, so a clinic can hand the formulary to one
                     person and the advice text to another. This gate is the
                     ONLY thing protecting the screen; it has no guard of its
                     own. */
                  element: <RequireCapability capability="advice.write" />,
                  children: [{ path: 'advice', element: <AdviceLibraryScreen /> }],
                },
                {
                  element: <RequireCapability capability="speech.use" />,
                  children: [{ path: 'speech', element: <SpeechScreen /> }],
                },
                {
                  path: 'settings',
                  element: <SettingsLayout />,
                  children: [
                    { index: true, element: <ClinicSettingsScreen /> },
                    { path: 'account', element: <AccountScreen /> },
                    {
                      element: <RequireCapability capability="user.read" />,
                      children: [{ path: 'users', element: <UsersScreen /> }],
                    },
                    {
                      element: <RequireCapability capability="audit.read" />,
                      children: [{ path: 'audit', element: <AuditLogScreen /> }],
                    },
                    {
                      element: <RequireCapability capability="portfolio.write" />,
                      children: [{ path: 'site', element: <SiteCmsScreen /> }],
                    },
                  ],
                },
                { path: '*', element: <NotFound /> },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/*
 * THE OPERATOR TREE — the vendor's console, disjoint from everything above.
 *
 * Disjoint, not merely permission-gated, because the superadmin is a different
 * kind of account rather than a very senior clinician: they hold no permission
 * rows (the flag is the grant), belong to no clinic, and have no patients. A
 * merged tree would have had to hide most of itself from them on every screen,
 * and the one screen they must have — Users — is exactly the screen the
 * backend makes them the sole occupant of: authority is `actor.level >
 * target.level` strictly, so at level 100 the superadmin is the ONLY account
 * that can create a doctor at level 60. Without a Users screen here, onboarding
 * the clinic's first doctor would be impossible from the UI.
 *
 * `users` and `account` mount the very same components the clinic tree does.
 * That is intentional: those screens already ask the API what the signed-in
 * user may do, so the answer differs without a second copy of the screen.
 */
const superadminRoutes = {
  path: '/superadmin',
  element: <RequireAuth />,
  children: [
    {
      element: <RequireSuperadmin />,
      children: [
        {
          element: <SuperadminShell />,
          children: [
            {
              element: <LazyBoundary />,
              children: [
                { index: true, element: <SystemDashboardScreen /> },
                { path: 'users', element: <UsersScreen /> },
                { path: 'roles', element: <RolesScreen /> },
                /* No separate `roles/new`: the editor treats the literal
                   segment `new` as create mode, so one route covers both and
                   there is no second place for the form to drift. */
                { path: 'roles/:roleId', element: <RoleEditorScreen /> },
                { path: 'account', element: <AccountScreen /> },
                /* Not the clinic's <NotFound />, which renders links into a
                   tree this user cannot reach. A typo inside the console is
                   answered by the console's own front page. */
                { path: '*', element: <Navigate to="/superadmin" replace /> },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/**
 * staff.<domain> — the app, and nothing else.
 *
 * `/` opens whichever home this account has — the dashboard for a clinic user,
 * the operator console for a superadmin — which is the same place LoginScreen
 * sends you after a successful sign-in, so the bare hostname and the login
 * redirect agree. Unauthenticated, RequireAuth turns it into /login, which
 * makes opening the bare hostname the whole sign-in journey: one bookmark, no
 * path to remember.
 *
 * Below it are two disjoint trees, not one tree with extra rows. See the
 * comment on `superadminRoutes` for why, and RequireAuth.tsx for why the two
 * guards that separate them are not symmetric.
 */
const staffRoutes = [
  { index: true, element: <HomeRedirect /> },
  { path: '/login', element: <LoginScreen /> },
  /* Order matters only for readability — the paths do not overlap. The operator
     tree comes first because it is the narrower claim on the URL space. */
  superadminRoutes,
  appRoutes,
]

/**
 * The public hostname — the patient-facing site. No login screen is mounted
 * here at all, so there is nothing to find and nothing to link to. A stale
 * bookmark to /login is forwarded to the staff host rather than 404'd.
 */
const publicRoutes = [
  {
    index: true,
    element: (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    ),
  },
  {
    path: '/site/*',
    element: (
      <Suspense fallback={null}>
        <PublicSite />
      </Suspense>
    ),
  },
  { path: '/login', element: <ExternalRedirect to={staffUrl('/login')} /> },
  /* One page and a CMS section: anything else is a typo or a dead inbound
     link, and the landing page is a better answer than an app-shell 404. */
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: IS_STAFF ? staffRoutes : publicRoutes,
  },
])

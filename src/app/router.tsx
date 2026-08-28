import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'
import { AppShell } from './AppShell'
import { RequireAuth, RequireCapability } from './RequireAuth'
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

/* Everything behind authentication. Identical on both surfaces in structure;
   only the staff surface ever mounts it. */
const appRoutes = {
  element: <RequireAuth />,
  children: [
    {
      element: <AppShell />,
      children: [
        {
          element: <LazyBoundary />,
          children: [
            /* The prescription pad's own front door. Reachable, but not where
               `/` lands — the staff surface opens on the dashboard. */
            { path: 'app', element: <PrescribeHome /> },
            { path: 'dashboard', element: <DashboardScreen /> },
            { path: 'patients', element: <PatientListScreen /> },
            { path: 'patients/:patientId', element: <PatientDetailScreen /> },
            { path: 'prescriptions', element: <PrescriptionListScreen /> },
            {
              element: <RequireCapability capability="prescriptions.write" />,
              children: [{ path: 'prescriptions/new', element: <PrescriptionPadScreen /> }],
            },
            {
              path: 'prescriptions/:prescriptionId',
              element: <PrescriptionDetailScreen />,
            },
            { path: 'appointments', element: <AppointmentsScreen /> },
            { path: 'medicines', element: <MedicinesScreen /> },
            {
              /* The advice library is formulary-adjacent: the same admin
                 who curates medicines curates advice, so it sits beside
                 Medicines rather than inside Settings. */
              element: <RequireCapability capability="medicines.write" />,
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
                  element: <RequireCapability capability="users.manage" />,
                  children: [{ path: 'users', element: <UsersScreen /> }],
                },
                {
                  element: <RequireCapability capability="audit.read" />,
                  children: [{ path: 'audit', element: <AuditLogScreen /> }],
                },
                {
                  element: <RequireCapability capability="portfolio.manage" />,
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
}

/**
 * staff.<domain> — the app, and nothing else.
 *
 * `/` opens the dashboard rather than rendering a landing page — the same
 * place LoginScreen sends you after a successful sign-in, so the bare hostname
 * and the login redirect agree. Unauthenticated, RequireAuth turns it into
 * /login, which makes opening the bare hostname the whole sign-in journey:
 * one bookmark, no path to remember.
 */
const staffRoutes = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <LoginScreen /> },
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

import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'
import { AppShell } from './AppShell'
import { RequireAuth, RequireCapability } from './RequireAuth'
import { RouteError, NotFound } from './RouteError'
import { LoginScreen } from '@/features/auth/LoginScreen'

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
      <Outlet />
    </AuthProvider>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        /* The public landing page — the front door. Single page, no app shell,
           reachable signed in or out. Staff sign in from here into /app. */
        index: true,
        element: (
          <Suspense fallback={null}>
            <LandingPage />
          </Suspense>
        ),
      },
      { path: '/login', element: <LoginScreen /> },
      {
        path: '/site/*',
        element: (
          <Suspense fallback={null}>
            <PublicSite />
          </Suspense>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                element: <LazyBoundary />,
                children: [
                  /* The app home (prescription pad's front door) lives at /app;
                     `/` is the public landing. The dashboard keeps its own
                     screen and its (absent) guard, one level down. */
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
      },
    ],
  },
])

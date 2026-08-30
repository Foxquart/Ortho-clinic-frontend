import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

/**
 * Retrying a 4xx just delays showing the user the truth. We retry only
 * transport failures and 5xx, and only twice — a doctor mid-consultation
 * should not wait through an exponential backoff to learn the server is down.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (error instanceof ApiError) {
    if (error.status === 0) return true
    return error.status >= 500
  }
  return false
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
})

/**
 * Query keys live in one place so an invalidation after a write can never miss
 * a screen. Every key is a tuple starting with its domain.
 */
export const qk = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    summary: () => ['dashboard', 'summary'] as const,
  },
  patients: {
    all: () => ['patients'] as const,
    list: (params: unknown) => ['patients', 'list', params] as const,
    search: (q: string) => ['patients', 'search', q] as const,
    detail: (id: string) => ['patients', 'detail', id] as const,
    summary: (id: string) => ['patients', 'summary', id] as const,
    prescriptions: (id: string) => ['patients', id, 'prescriptions'] as const,
  },
  medicines: {
    all: () => ['medicines'] as const,
    list: (params: unknown) => ['medicines', 'list', params] as const,
    search: (q: string) => ['medicines', 'search', q] as const,
    detail: (id: string) => ['medicines', 'detail', id] as const,
  },
  prescriptions: {
    all: () => ['prescriptions'] as const,
    list: (params: unknown) => ['prescriptions', 'list', params] as const,
    detail: (id: string) => ['prescriptions', 'detail', id] as const,
    print: (id: string) => ['prescriptions', id, 'print'] as const,
  },
  appointments: {
    all: () => ['appointments'] as const,
    list: (params: unknown) => ['appointments', 'list', params] as const,
    detail: (id: string) => ['appointments', 'detail', id] as const,
    slots: (date: string) => ['appointments', 'slots', date] as const,
    availability: () => ['appointments', 'availability'] as const,
  },
  clinic: {
    settings: () => ['clinic', 'settings'] as const,
    doctorProfile: () => ['clinic', 'doctor-profile'] as const,
    templates: () => ['clinic', 'templates'] as const,
    template: (id: string) => ['clinic', 'templates', id] as const,
  },
  users: {
    all: () => ['users'] as const,
    list: (params: unknown) => ['users', 'list', params] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  roles: {
    all: () => ['roles'] as const,
    list: () => ['roles', 'list'] as const,
    /** Depends on the signed-in user's own level, so it is invalidated by any change to their role. */
    assignable: () => ['roles', 'assignable'] as const,
    permissions: () => ['roles', 'permissions'] as const,
    detail: (id: string) => ['roles', 'detail', id] as const,
  },
  auditLogs: {
    list: (params: unknown) => ['audit-logs', params] as const,
  },
  portfolio: {
    pages: () => ['portfolio', 'pages'] as const,
    services: () => ['portfolio', 'services'] as const,
    testimonials: () => ['portfolio', 'testimonials'] as const,
    gallery: () => ['portfolio', 'gallery'] as const,
  },
  advicePresets: {
    all: () => ['advice-presets'] as const,
    list: (includeInactive: boolean) => ['advice-presets', { includeInactive }] as const,
  },
  speech: {
    config: () => ['speech', 'config'] as const,
  },
  monitoring: {
    all: () => ['monitoring'] as const,
    status: () => ['monitoring', 'status'] as const,
    uptime: (window: string) => ['monitoring', 'uptime', window] as const,
    metrics: (window: string) => ['monitoring', 'metrics', window] as const,
    errors: (limit: number) => ['monitoring', 'errors', limit] as const,
    security: () => ['monitoring', 'security'] as const,
    database: () => ['monitoring', 'database'] as const,
  },
  public: {
    clinic: () => ['public', 'clinic'] as const,
    doctor: () => ['public', 'doctor'] as const,
    portfolio: () => ['public', 'portfolio'] as const,
    page: (slug: string) => ['public', 'pages', slug] as const,
    availability: () => ['public', 'availability'] as const,
    slots: (date: string) => ['public', 'slots', date] as const,
  },
} as const

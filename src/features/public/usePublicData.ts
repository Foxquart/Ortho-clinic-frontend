import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, ensurePublicCsrf } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { ApiError } from '@/api/errors'
import { qk } from '@/lib/query'
import type {
  AppointmentCreateByPatientRequest,
  AppointmentDetailResponse,
  AvailableSlotResponse,
  ClinicSettingsResponse,
  DoctorProfileResponse,
  PortfolioPageResponse,
  PublicPortfolioResponse,
  WeeklyAvailabilityResponse,
} from '@/api/schema'

/* Marketing copy changes about as often as the doctor edits the CMS. A five
   minute stale window keeps navigation between pages instant without ever
   serving something meaningfully out of date. */
const CONTENT_STALE_TIME = 5 * 60_000

export function usePublicClinic() {
  return useQuery({
    queryKey: qk.public.clinic(),
    queryFn: () => apiGet<ClinicSettingsResponse>(endpoints.public.clinic),
    staleTime: CONTENT_STALE_TIME,
  })
}

export function usePublicDoctor() {
  return useQuery({
    queryKey: qk.public.doctor(),
    queryFn: () => apiGet<DoctorProfileResponse>(endpoints.public.doctor),
    staleTime: CONTENT_STALE_TIME,
  })
}

export function usePublicPortfolio() {
  return useQuery({
    queryKey: qk.public.portfolio(),
    queryFn: () => apiGet<PublicPortfolioResponse>(endpoints.public.portfolio),
    staleTime: CONTENT_STALE_TIME,
  })
}

/**
 * A single CMS page. A missing slug is a real 404 from the server, so the
 * caller can render "this page has not been written yet" rather than an error.
 */
export function usePublicPage(slug: string) {
  return useQuery({
    queryKey: qk.public.page(slug),
    queryFn: () => apiGet<PortfolioPageResponse>(endpoints.public.pageBySlug(slug)),
    staleTime: CONTENT_STALE_TIME,
  })
}

export function usePublicAvailability() {
  return useQuery({
    queryKey: qk.public.availability(),
    queryFn: () => apiGet<WeeklyAvailabilityResponse[]>(endpoints.public.availability),
    staleTime: CONTENT_STALE_TIME,
  })
}

/**
 * Bookable slots for one day. Deliberately short-lived: somebody else may take
 * a slot while this patient is typing their phone number.
 */
export function usePublicSlots(date: string | null) {
  return useQuery({
    queryKey: qk.public.slots(date ?? ''),
    queryFn: () => apiGet<AvailableSlotResponse[]>(endpoints.public.slots, { params: { date } }),
    enabled: Boolean(date),
    staleTime: 15_000,
    gcTime: 60_000,
  })
}

/**
 * The booking POST.
 *
 * An unauthenticated write still needs the double-submit CSRF token, and the
 * cookie only exists after `GET /public/csrf` — so `ensurePublicCsrf()` runs
 * first and the shared axios interceptor attaches the header. `ensurePublicCsrf`
 * short-circuits when a cookie is already present, which means it cannot repair
 * an *expired* one; if the server still answers `csrf_failed` we mint a fresh
 * token and retry exactly once.
 */
export function useBookAppointment() {
  const queryClient = useQueryClient()

  return useMutation<AppointmentDetailResponse, ApiError, AppointmentCreateByPatientRequest>({
    mutationFn: async (body) => {
      await ensurePublicCsrf()
      try {
        return await apiPost<AppointmentDetailResponse>(endpoints.public.appointments, body)
      } catch (error) {
        if (error instanceof ApiError && error.code === 'csrf_failed') {
          await apiGet<Record<string, string>>(endpoints.public.csrf)
          return await apiPost<AppointmentDetailResponse>(endpoints.public.appointments, body)
        }
        throw error
      }
    },
    onSettled: (_data, _error, variables) => {
      // Success or conflict, the day's slot list is now stale either way.
      void queryClient.invalidateQueries({
        queryKey: qk.public.slots(variables.appointment_date),
      })
    },
  })
}

/** Warm the CSRF cookie so the first submit is not paying for a round trip. */
export function prewarmCsrf(): void {
  void ensurePublicCsrf().catch(() => {
    /* The submit path retries; a failed prewarm is not worth surfacing. */
  })
}

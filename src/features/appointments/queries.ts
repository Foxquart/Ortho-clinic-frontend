/**
 * Every appointment read and write the screen makes, in one place.
 *
 * `GET /appointments` is the only list in the API with real filters, and it is
 * paginated (`Paginated<AppointmentDetailResponse>`). `GET /appointments/slots`
 * and `GET /appointments/availability` are bare arrays with no envelope — see
 * `docs/API_NOTES.md` §1 — so nothing here assumes `res.items`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import endpoints from '@/api/endpoints'
import type { ListAppointmentsParams } from '@/api/endpoints'
import type {
  AppointmentCreateRequest,
  AppointmentDetailResponse,
  AppointmentStatus,
  AvailableSlotResponse,
  MessageResponse,
  Paginated,
  PatientSearchResult,
  UUID,
  WeeklyAvailabilityCreate,
  WeeklyAvailabilityResponse,
  WeeklyAvailabilityUpdate,
} from '@/api/schema'
import { qk } from '@/lib/query'

/** The API caps `page_size` at 200. A single day never comes close. */
const DAY_PAGE_SIZE = 100
const WEEK_PAGE_SIZE = 200

export { DAY_PAGE_SIZE, WEEK_PAGE_SIZE }

export function useAppointments(params: ListAppointmentsParams, enabled = true) {
  return useQuery({
    queryKey: qk.appointments.list(params),
    queryFn: () =>
      apiGet<Paginated<AppointmentDetailResponse>>(endpoints.appointments.list, { params }),
    enabled,
  })
}

/**
 * Free half hours for a date. Deliberately never cached across an open form:
 * a slot list that is thirty seconds stale is how two patients get the same
 * time.
 */
export function useAvailableSlots(date: string | null) {
  return useQuery({
    queryKey: qk.appointments.slots(date ?? ''),
    queryFn: () =>
      apiGet<AvailableSlotResponse[]>(endpoints.appointments.slots, { params: { date } }),
    enabled: Boolean(date),
    staleTime: 0,
  })
}

export function useWeeklyAvailability() {
  return useQuery({
    queryKey: qk.appointments.availability(),
    queryFn: () =>
      apiGet<WeeklyAvailabilityResponse[]>(endpoints.appointments.availability),
    staleTime: 5 * 60_000,
  })
}

/** Server-driven patient lookup. `q` is required and capped at 100 chars. */
export function usePatientSearch(query: string) {
  const q = query.trim().slice(0, 100)
  return useQuery({
    queryKey: qk.patients.search(q),
    queryFn: () =>
      apiGet<PatientSearchResult[]>(endpoints.patients.search, {
        params: { q, limit: 10 },
      }),
    enabled: q.length > 0,
  })
}

/**
 * One invalidation for every appointment write. `qk.appointments.all()` is the
 * prefix of the list, slot and availability keys, so nothing can be missed by
 * guessing which of them a write touched.
 */
function useInvalidateAppointments() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.appointments.all() })
    void queryClient.invalidateQueries({ queryKey: qk.dashboard.summary() })
  }
}

export function useBookAppointment() {
  const invalidate = useInvalidateAppointments()
  return useMutation({
    mutationFn: (body: AppointmentCreateRequest) =>
      apiPost<AppointmentDetailResponse>(endpoints.appointments.create, body),
    onSuccess: invalidate,
  })
}

export interface StatusChange {
  appointment: AppointmentDetailResponse
  target: AppointmentStatus
}

/**
 * Status lives on its own route: `AppointmentUpdateRequest` carries only date,
 * time, reason and notes, so `PATCH /appointments/{id}` cannot set it.
 */
export function useUpdateStatus() {
  const invalidate = useInvalidateAppointments()
  return useMutation({
    mutationFn: ({ appointment, target }: StatusChange) =>
      apiPatch<AppointmentDetailResponse>(endpoints.appointments.status(appointment.id), {
        status: target,
      }),
    onSuccess: invalidate,
    // A 409 means the row on screen is stale; pull the truth either way.
    onError: invalidate,
  })
}

export function useCreateAvailability() {
  const invalidate = useInvalidateAppointments()
  return useMutation({
    mutationFn: (body: WeeklyAvailabilityCreate) =>
      apiPost<WeeklyAvailabilityResponse>(endpoints.appointments.availability, body),
    onSuccess: invalidate,
  })
}

export function useUpdateAvailability() {
  const invalidate = useInvalidateAppointments()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: WeeklyAvailabilityUpdate }) =>
      apiPatch<WeeklyAvailabilityResponse>(endpoints.appointments.availabilityById(id), body),
    onSuccess: invalidate,
  })
}

export function useDeleteAvailability() {
  const invalidate = useInvalidateAppointments()
  return useMutation({
    mutationFn: (id: UUID) =>
      apiDelete<MessageResponse>(endpoints.appointments.availabilityById(id)),
    onSuccess: invalidate,
  })
}

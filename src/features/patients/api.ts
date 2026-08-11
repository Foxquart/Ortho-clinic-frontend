/**
 * Patients data layer.
 *
 * Two facts from the API shape everything on these screens:
 *
 *  1. `GET /patients` takes NO free-text filter. Text search only exists on
 *     `GET /patients/search`, which is a bare array with no pagination and no
 *     `total`. So the list screen is really two screens sharing a table.
 *  2. `GET /patients/{id}/summary` is declared `object(additionalProperties:
 *     true)` — the OpenAPI document models nothing inside it. `PatientSummary`
 *     in `schema.ts` is a DIFFERENT thing (the five-field patient stub embedded
 *     in appointments and prescriptions), so it cannot be used here. The real
 *     body is `PatientSummaryCardResponse` from `@/api/derived`, and it is read
 *     defensively at the call site.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type { PatientSummaryCardResponse } from '@/api/derived'
import type {
  Paginated,
  PatientCreateRequest,
  PatientResponse,
  PatientSearchResult,
  PatientUpdateRequest,
  PrescriptionResponse,
  SortOrder,
} from '@/api/schema'

/** `q` is declared `minLength: 1, maxLength: 100`. Enforced before the request. */
export const SEARCH_Q_MAX = 100
/** `limit` is capped at 100 by the schema; 50 is as many rows as anyone scans. */
export const SEARCH_LIMIT = 50
/** `page_size` is capped at 200. 25 keeps the table one screen tall. */
export const PAGE_SIZE = 25

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export interface PatientListParams {
  page: number
  /** A real column on the patient row, or null to take the server default (`updated_at desc`). */
  sortBy: string | null
  sortOrder: SortOrder
}

/** `GET /patients` — the paginated browse list. `PatientResponse` items: no last visit, no prescription count. */
export function usePatientList(params: PatientListParams, enabled: boolean) {
  return useQuery({
    queryKey: qk.patients.list(params),
    queryFn: () =>
      apiGet<Paginated<PatientResponse>>(endpoints.patients.list, {
        params: {
          page: params.page,
          page_size: PAGE_SIZE,
          sort_by: params.sortBy ?? undefined,
          sort_order: params.sortOrder,
        },
      }),
    enabled,
    // Paging should not blank the table it is paging.
    placeholderData: keepPreviousData,
  })
}

/** `GET /patients/search` — server-ranked over name AND phone. Never filtered again on the client. */
export function usePatientSearch(q: string) {
  return useQuery({
    queryKey: qk.patients.search(q),
    queryFn: () =>
      apiGet<PatientSearchResult[]>(endpoints.patients.search, {
        params: { q, limit: SEARCH_LIMIT },
      }),
    enabled: q.length >= 1 && q.length <= SEARCH_Q_MAX,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  })
}

/**
 * `GET /patients/{id}/summary` — patient, prescription stubs, appointments and
 * last visit in one call. Both history arrays are COMPLETE, not a recent slice,
 * so the screen caps what it renders rather than trusting the server to.
 */
export function usePatientSummary(patientId: string) {
  return useQuery({
    queryKey: qk.patients.summary(patientId),
    queryFn: () => apiGet<PatientSummaryCardResponse>(endpoints.patients.summary(patientId)),
    enabled: patientId.length > 0,
  })
}

/**
 * `GET /patients/{id}/prescriptions` — the same prescriptions the summary
 * lists, but with their full `items` (and therefore the medicine names).
 * The summary alone cannot answer "what did I put her on last time", which is
 * the entire point of this history, so it is fetched alongside and merged in.
 */
export function usePatientPrescriptions(patientId: string) {
  return useQuery({
    queryKey: qk.patients.prescriptions(patientId),
    queryFn: () => apiGet<PrescriptionResponse[]>(endpoints.patients.prescriptions(patientId)),
    enabled: patientId.length > 0,
  })
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PatientCreateRequest) =>
      apiPost<PatientResponse>(endpoints.patients.create, body),
    onSuccess: (patient) => {
      queryClient.setQueryData(qk.patients.detail(patient.id), patient)
      void queryClient.invalidateQueries({ queryKey: qk.patients.all() })
      void queryClient.invalidateQueries({ queryKey: qk.dashboard.summary() })
    },
  })
}

export function useUpdatePatient(patientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PatientUpdateRequest) =>
      apiPatch<PatientResponse>(endpoints.patients.byId(patientId), body),
    onSuccess: (patient) => {
      queryClient.setQueryData(qk.patients.detail(patient.id), patient)
      void queryClient.invalidateQueries({ queryKey: qk.patients.all() })
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const UUID_IN_TEXT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * The API rejects a duplicate phone number with 409 and names the existing
 * record: `"A patient with phone 98… already exists (id: <uuid>)."` Pulling the
 * id out turns a dead end into a link to the patient the doctor actually wants.
 * Returns null when the message does not carry one — never guesses.
 */
export function conflictingPatientId(message: string): string | null {
  return UUID_IN_TEXT.exec(message)?.[0] ?? null
}

/** `male` → `M`. The list is dense; the detail screen spells it out. */
export function shortGender(gender: string | null | undefined): string {
  if (!gender) return '—'
  return gender.charAt(0).toUpperCase()
}

/** Allergies, minus the empty strings a hand-typed array can pick up. */
export function cleanAllergies(allergies: string[] | null | undefined): string[] {
  if (!Array.isArray(allergies)) return []
  return allergies.map((a) => a.trim()).filter((a) => a.length > 0)
}

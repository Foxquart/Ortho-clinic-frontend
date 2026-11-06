import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type {
  InvestigationCreate,
  InvestigationResponse,
  InvestigationUpdate,
  MessageResponse,
  UUID,
} from '@/api/schema'
import { toInvestigationOptions, type InvestigationOption } from './catalog'

/**
 * The clinic's investigation catalogue, as picker options for the pad.
 *
 * Ships ahead of the backend: a 404 (or any failure) is not an error state to
 * show the doctor — it means the catalogue does not exist yet, and the built-in
 * fallback list keeps the pad usable. `retry: false` is deliberate: a 404 is
 * the expected answer on an older deployment, and retrying it only delays the
 * first paint of the pane.
 */
export function useInvestigations(): {
  options: InvestigationOption[]
  rows: InvestigationResponse[] | undefined
  /** True while the first request is in flight, so the picker can wait. */
  isLoading: boolean
} {
  const query = useQuery({
    queryKey: qk.investigations.list(false),
    queryFn: () => apiGet<InvestigationResponse[]>(endpoints.investigations.list),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const options = useMemo(() => toInvestigationOptions(query.data), [query.data])

  return {
    options,
    rows: query.data,
    isLoading: query.isPending,
  }
}

/**
 * The management listing. Asks for inactive rows too: deactivation is the
 * recommended "delete", so a retired test must stay visible and revivable.
 *
 * Unlike the pad's query, this one surfaces the error — the screen has a calm
 * explanatory state for a 404.
 */
export function useInvestigationList() {
  return useQuery({
    queryKey: qk.investigations.list(true),
    queryFn: () =>
      apiGet<InvestigationResponse[]>(endpoints.investigations.list, {
        params: { include_inactive: true },
      }),
    retry: false,
  })
}

function useInvalidateInvestigations() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.investigations.all() })
  }
}

export function useCreateInvestigation() {
  const invalidate = useInvalidateInvestigations()
  return useMutation({
    mutationFn: (body: InvestigationCreate) =>
      apiPost<InvestigationResponse>(endpoints.investigations.create, body),
    onSuccess: invalidate,
  })
}

export function useUpdateInvestigation() {
  const invalidate = useInvalidateInvestigations()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: InvestigationUpdate }) =>
      apiPatch<InvestigationResponse>(endpoints.investigations.byId(id), body),
    onSuccess: invalidate,
  })
}

/** Hard delete — only ever behind an explicit confirm; deactivating is the default. */
export function useDeleteInvestigation() {
  const invalidate = useInvalidateInvestigations()
  return useMutation({
    mutationFn: (id: UUID) => apiDelete<MessageResponse>(endpoints.investigations.byId(id)),
    onSuccess: invalidate,
  })
}

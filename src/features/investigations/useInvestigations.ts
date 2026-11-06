import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type { InvestigationResponse } from '@/api/schema'
import { toInvestigationOptions, type InvestigationOption } from './catalog'

/**
 * The clinic's investigation catalogue, as picker options.
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

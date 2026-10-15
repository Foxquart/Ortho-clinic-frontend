import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type {
  BengaliPhraseCreate,
  BengaliPhraseResponse,
  BengaliPhraseUpdate,
  MissingPhrase,
  UUID,
} from '@/api/schema'

/** The whole phrasebook (no pagination server-side); the screen filters it locally. */
export function usePhraseList() {
  return useQuery({
    queryKey: qk.bengaliPhrases.list(),
    queryFn: () => apiGet<BengaliPhraseResponse[]>(endpoints.bengaliPhrases.list),
  })
}

export const MISSING_LIMIT = 50

export function useMissingPhrases() {
  return useQuery({
    queryKey: qk.bengaliPhrases.missing(MISSING_LIMIT),
    queryFn: () =>
      apiGet<MissingPhrase[]>(endpoints.bengaliPhrases.missing, {
        params: { limit: MISSING_LIMIT },
      }),
  })
}

function useInvalidatePhrases() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.bengaliPhrases.all() })
  }
}

export function useCreatePhrase() {
  const invalidate = useInvalidatePhrases()
  return useMutation({
    mutationFn: (body: BengaliPhraseCreate) =>
      apiPost<BengaliPhraseResponse>(endpoints.bengaliPhrases.create, body),
    onSuccess: invalidate,
  })
}

export function useUpdatePhrase() {
  const invalidate = useInvalidatePhrases()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: BengaliPhraseUpdate }) =>
      apiPatch<BengaliPhraseResponse>(endpoints.bengaliPhrases.byId(id), body),
    onSuccess: invalidate,
  })
}

export function useDeletePhrase() {
  const invalidate = useInvalidatePhrases()
  return useMutation({
    mutationFn: (id: UUID) => apiDelete<void>(endpoints.bengaliPhrases.byId(id)),
    onSuccess: invalidate,
  })
}

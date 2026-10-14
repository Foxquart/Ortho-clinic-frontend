import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import type {
  PrescriptionTemplateCreate,
  PrescriptionTemplateResponse,
  PrescriptionTemplateUpdate,
  UUID,
} from '@/api/schema'

/** Query key root — every template query hangs off it, so one invalidate covers all. */
const KEY = ['prescription-templates'] as const

export function useTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<PrescriptionTemplateResponse[]>(endpoints.prescriptionTemplates.list),
  })
}

export function useTemplate(id: UUID | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => apiGet<PrescriptionTemplateResponse>(endpoints.prescriptionTemplates.byId(id!)),
    enabled: !!id,
  })
}

function useInvalidateTemplates() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEY })
  }
}

export function useCreateTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: (body: PrescriptionTemplateCreate) =>
      apiPost<PrescriptionTemplateResponse>(endpoints.prescriptionTemplates.create, body),
    onSuccess: invalidate,
  })
}

export function useUpdateTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: PrescriptionTemplateUpdate }) =>
      apiPatch<PrescriptionTemplateResponse>(endpoints.prescriptionTemplates.byId(id), body),
    onSuccess: invalidate,
  })
}

/** DELETE answers 204 with no body. */
export function useDeleteTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: (id: UUID) => apiDelete<void>(endpoints.prescriptionTemplates.byId(id)),
    onSuccess: invalidate,
  })
}

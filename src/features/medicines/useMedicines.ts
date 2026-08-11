import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import type {
  MedicineCreateRequest,
  MedicineDosageForm,
  MedicineResponse,
  MedicineUpdateRequest,
  Paginated,
  UUID,
} from '@/api/schema'

/** Rows per page when browsing the catalogue. */
export const BROWSE_PAGE_SIZE = 25
/** `q` is capped at 100 chars by the API; `limit` at 100. */
export const SEARCH_LIMIT = 50
export const MAX_QUERY_LENGTH = 100

/* `GET /medicines` accepts pagination only — no `is_active` or `dosage_form`
   filter — and `GET /medicines/search` accepts none at all. So a filter can
   only be applied to records we already hold. Filtering one server page would
   lie (page 2 of "active" would skip active rows), so a filtered browse pulls
   the whole catalogue in 200-row pages and paginates it here. The cap keeps a
   pathological formulary from becoming ten requests. */
const CATALOGUE_PAGE_SIZE = 200
const CATALOGUE_MAX_PAGES = 5

export type StatusFilter = 'all' | 'active' | 'inactive'
export type DosageFormFilter = 'all' | MedicineDosageForm

export interface MedicineListView {
  rows: MedicineResponse[]
  mode: 'search' | 'browse'
  /** Rows before the client-side form/status filter — powers "3 of 24 hidden". */
  matchedTotal: number
  total: number
  page: number
  pages: number
  pageSize: number
  /** False in search mode: `/medicines/search` returns a bare, unpaged array. */
  paginated: boolean
  /** The catalogue is larger than we are willing to pull down for a filter. */
  truncated: boolean
  /** Search hit its `limit` — there may be more, less relevant, matches. */
  capped: boolean
  isPending: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

interface Catalogue {
  items: MedicineResponse[]
  truncated: boolean
}

async function fetchCatalogue(): Promise<Catalogue> {
  const items: MedicineResponse[] = []
  let page = 1
  let pages = 1

  do {
    const res = await apiGet<Paginated<MedicineResponse>>(endpoints.medicines.list, {
      params: { page, page_size: CATALOGUE_PAGE_SIZE },
    })
    items.push(...res.items)
    pages = res.pages
    page += 1
  } while (page <= pages && page <= CATALOGUE_MAX_PAGES)

  return { items, truncated: pages > CATALOGUE_MAX_PAGES }
}

function passes(
  medicine: MedicineResponse,
  dosageForm: DosageFormFilter,
  status: StatusFilter,
): boolean {
  if (dosageForm !== 'all' && medicine.dosage_form !== dosageForm) return false
  if (status === 'active' && !medicine.is_active) return false
  if (status === 'inactive' && medicine.is_active) return false
  return true
}

/**
 * One view over three shapes of the same data: ranked search results, a server
 * page of the catalogue, and the whole catalogue when a filter is on.
 */
export function useMedicineList({
  query,
  page,
  dosageForm,
  status,
}: {
  /** Already debounced and trimmed. */
  query: string
  page: number
  dosageForm: DosageFormFilter
  status: StatusFilter
}): MedicineListView {
  const searching = query.length > 0
  const filtering = dosageForm !== 'all' || status !== 'all'

  const search = useQuery({
    queryKey: qk.medicines.search(query),
    queryFn: () =>
      apiGet<MedicineResponse[]>(endpoints.medicines.search, {
        params: { q: query.slice(0, MAX_QUERY_LENGTH), limit: SEARCH_LIMIT },
      }),
    enabled: searching,
    staleTime: 20_000,
    // Hold the last result set while the next keystroke's query resolves;
    // a table that empties between letters reads as "no matches".
    placeholderData: keepPreviousData,
  })

  const browse = useQuery({
    queryKey: qk.medicines.list({ page, page_size: BROWSE_PAGE_SIZE }),
    queryFn: () =>
      apiGet<Paginated<MedicineResponse>>(endpoints.medicines.list, {
        params: { page, page_size: BROWSE_PAGE_SIZE },
      }),
    enabled: !searching && !filtering,
    // Keep the previous page on screen while the next one loads, so paging
    // never blinks the table out of existence.
    placeholderData: keepPreviousData,
  })

  const catalogue = useQuery({
    queryKey: qk.medicines.list('catalogue'),
    queryFn: fetchCatalogue,
    enabled: !searching && filtering,
  })

  const active = searching ? search : filtering ? catalogue : browse

  return useMemo<MedicineListView>(() => {
    const base = {
      isPending: active.isPending,
      isFetching: active.isFetching,
      isError: active.isError,
      error: active.error,
      refetch: () => void active.refetch(),
    }

    if (searching) {
      const found = search.data ?? []
      const rows = found.filter((m) => passes(m, dosageForm, status))
      return {
        ...base,
        rows,
        mode: 'search',
        matchedTotal: found.length,
        total: rows.length,
        page: 1,
        pages: 1,
        pageSize: rows.length,
        paginated: false,
        truncated: false,
        capped: found.length >= SEARCH_LIMIT,
      }
    }

    if (filtering) {
      const all = catalogue.data?.items ?? []
      const matched = all.filter((m) => passes(m, dosageForm, status))
      const pages = Math.max(1, Math.ceil(matched.length / BROWSE_PAGE_SIZE))
      const safePage = Math.min(page, pages)
      return {
        ...base,
        rows: matched.slice((safePage - 1) * BROWSE_PAGE_SIZE, safePage * BROWSE_PAGE_SIZE),
        mode: 'browse',
        matchedTotal: all.length,
        total: matched.length,
        page: safePage,
        pages,
        pageSize: BROWSE_PAGE_SIZE,
        paginated: true,
        truncated: catalogue.data?.truncated ?? false,
        capped: false,
      }
    }

    const envelope = browse.data
    return {
      ...base,
      rows: envelope?.items ?? [],
      mode: 'browse',
      matchedTotal: envelope?.total ?? 0,
      total: envelope?.total ?? 0,
      page: envelope?.page ?? page,
      pages: envelope?.pages ?? 1,
      pageSize: envelope?.page_size ?? BROWSE_PAGE_SIZE,
      paginated: true,
      truncated: false,
      capped: false,
    }
  }, [
    active,
    browse.data,
    catalogue.data,
    dosageForm,
    filtering,
    page,
    search.data,
    searching,
    status,
  ])
}

/** The medicine a `?highlight=<id>` deep link points at. */
export function useMedicineById(id: string | null) {
  return useQuery({
    queryKey: qk.medicines.detail(id ?? ''),
    queryFn: () => apiGet<MedicineResponse>(endpoints.medicines.byId(id as UUID)),
    enabled: Boolean(id),
    retry: false,
  })
}

/* -------------------------------------------------------------------------- */
/*  Writes — admin only. Each invalidates the medicines root plus the          */
/*  dashboard, whose medicine count these change.                             */
/* -------------------------------------------------------------------------- */

function useInvalidateMedicines() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.medicines.all() })
    void queryClient.invalidateQueries({ queryKey: qk.dashboard.summary() })
  }
}

export function useCreateMedicine() {
  const invalidate = useInvalidateMedicines()
  return useMutation({
    mutationFn: (body: MedicineCreateRequest) =>
      apiPost<MedicineResponse>(endpoints.medicines.create, body),
    onSuccess: invalidate,
  })
}

export function useUpdateMedicine() {
  const invalidate = useInvalidateMedicines()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: MedicineUpdateRequest }) =>
      apiPatch<MedicineResponse>(endpoints.medicines.byId(id), body),
    onSuccess: invalidate,
  })
}

/** Soft delete and its undo — there is no hard delete for a medicine. */
export function useSetMedicineActive() {
  const invalidate = useInvalidateMedicines()
  return useMutation({
    mutationFn: ({ id, active }: { id: UUID; active: boolean; name: string }) =>
      apiPost<MedicineResponse>(
        active ? endpoints.medicines.reactivate(id) : endpoints.medicines.deactivate(id),
      ),
    onSuccess: invalidate,
  })
}

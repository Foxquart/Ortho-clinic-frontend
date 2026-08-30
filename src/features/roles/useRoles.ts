import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { SUPERADMIN_LEVEL } from '@/lib/permissions'
import type {
  MessageResponse,
  Paginated,
  PermissionGroup,
  RoleCreateRequest,
  RoleResponse,
  RoleUpdateRequest,
  UserResponse,
  UUID,
} from '@/api/schema'

/**
 * The level the API reserves for the vendor's own operator account. It is not
 * a name check: a clinic may rename `superadmin`, but nothing may occupy 100,
 * so the level is the one stable way to recognise the row the API will 403 on.
 */
export function isVendorRole(role: RoleResponse): boolean {
  return role.level >= SUPERADMIN_LEVEL
}

/** Every role, already sorted highest level first by the server. Never re-sort. */
export function useRoleList() {
  return useQuery({
    queryKey: qk.roles.list(),
    queryFn: () => apiGet<RoleResponse[]>(endpoints.roles.list),
  })
}

export function useRole(id: UUID | null) {
  return useQuery({
    queryKey: qk.roles.detail(id ?? ''),
    queryFn: () => apiGet<RoleResponse>(endpoints.roles.byId(id as UUID)),
    enabled: id !== null,
  })
}

/**
 * The permission catalogue, grouped and ordered by the backend. Held for an
 * hour because it only changes when the API ships a new capability, and the
 * editor should not re-request it every time the superadmin opens a role.
 */
export function usePermissionCatalogue() {
  return useQuery({
    queryKey: qk.roles.permissions(),
    queryFn: () => apiGet<PermissionGroup[]>(endpoints.roles.permissions),
    staleTime: 60 * 60_000,
  })
}

/* `GET /users` caps `page_size` at 200 and there is no count-by-role endpoint,
   so the holder tally is assembled by walking the user list. Five pages covers
   a thousand accounts — orders of magnitude more than a clinic has — and the
   walk stops there rather than issuing an unbounded number of requests. Past
   that point `truncated` is true and the screen says the counts are a floor,
   because a count that silently under-reports is worse than no count: the whole
   reason it exists is to warn before a delete that would 409. */
const USER_PAGE_SIZE = 200
const USER_MAX_PAGES = 5

export interface RoleHolderTally {
  /** role id → number of accounts holding it, active and inactive alike. */
  counts: Record<string, number>
  /** True when the user list was longer than the walk was willing to fetch. */
  truncated: boolean
}

async function fetchHolderTally(): Promise<RoleHolderTally> {
  const counts: Record<string, number> = {}
  let page = 1
  let pages = 1

  do {
    const res = await apiGet<Paginated<UserResponse>>(endpoints.users.list, {
      params: { page, page_size: USER_PAGE_SIZE },
    })
    for (const user of res.items) {
      counts[user.role.id] = (counts[user.role.id] ?? 0) + 1
    }
    pages = res.pages
    page += 1
  } while (page <= pages && page <= USER_MAX_PAGES)

  return { counts, truncated: pages > USER_MAX_PAGES }
}

export function useRoleHolderTally() {
  return useQuery({
    queryKey: qk.users.list({ holderTally: true }),
    queryFn: fetchHolderTally,
  })
}

/** "4 people hold this" — the sentence the spec wants read before a delete. */
export function holderSentence(count: number | undefined): string {
  if (count === undefined) return 'Counting holders…'
  if (count === 0) return 'Nobody holds this'
  if (count === 1) return '1 person holds this'
  return `${count} people hold this`
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RoleCreateRequest) => apiPost<RoleResponse>(endpoints.roles.create, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles.all() })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: RoleUpdateRequest }) =>
      apiPatch<RoleResponse>(endpoints.roles.byId(id), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles.all() })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: UUID) => apiDelete<MessageResponse>(endpoints.roles.byId(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles.all() })
    },
  })
}

/**
 * The levels already in use, highest first, for the ladder under the level
 * input. Built from the live roles rather than a hardcoded 100/60/40 so a
 * clinic that has already defined its own roles sees where a new one lands
 * among all of them, not just among the seeded three.
 */
export function useLevelLadder(roles: RoleResponse[] | undefined) {
  return useMemo(
    () =>
      (roles ?? []).map((role) => ({
        id: role.id,
        level: role.level,
        name: role.name,
        reserved: isVendorRole(role),
      })),
    [roles],
  )
}

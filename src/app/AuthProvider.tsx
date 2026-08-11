import { createContext, use, useCallback, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, SESSION_EXPIRED_EVENT } from '@/api/http'
import { ApiError } from '@/api/errors'
import { qk } from '@/lib/query'
import { roleCan, type Capability, type Role } from '@/lib/permissions'
import type { UserResponse } from '@/api/schema'

interface LoginPayload {
  username: string
  password: string
}

interface AuthContextValue {
  user: UserResponse | null
  role: Role | undefined
  /** True only while the very first `/auth/me` is in flight. */
  isLoading: boolean
  isAuthenticated: boolean
  login: (payload: LoginPayload) => Promise<UserResponse>
  logout: () => Promise<void>
  isLoggingIn: boolean
  can: (capability: Capability) => boolean
  refresh: () => Promise<unknown>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * A 200 from `/auth/login` only proves the credentials were right. It does not
 * prove the browser kept the session cookie — a cross-hostname setup discards
 * it silently. So the source of truth for "am I signed in" is always a fresh
 * `/auth/me`, never the login response.
 */
async function fetchMe(): Promise<UserResponse | null> {
  try {
    return await apiGet<UserResponse>('/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const meQuery = useQuery({
    queryKey: qk.auth.me(),
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  })

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      await apiPost<{ user: UserResponse; message: string }>('/auth/login', payload)
      // Confirm the cookie actually stuck before we call anyone signed in.
      const me = await fetchMe()
      if (!me) {
        throw new ApiError({
          code: 'unauthorized',
          status: 401,
          message:
            'Signed in, but the browser did not keep the session cookie. ' +
            'Open the app on the same hostname as the API (localhost, not 127.0.0.1).',
        })
      }
      return me
    },
    onSuccess: (me) => {
      queryClient.setQueryData(qk.auth.me(), me)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiPost('/auth/logout')
      } catch {
        // A failed logout must still clear the client — never strand the user
        // in a signed-in shell whose requests all 401.
      }
    },
    onSettled: () => {
      queryClient.setQueryData(qk.auth.me(), null)
      queryClient.clear()
    },
  })

  // One place handles an expired session, no matter which screen tripped it.
  useEffect(() => {
    const onExpired = () => {
      queryClient.setQueryData(qk.auth.me(), null)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [queryClient])

  const user = meQuery.data ?? null
  const role = user?.role as Role | undefined

  const login = useCallback(
    (payload: LoginPayload) => loginMutation.mutateAsync(payload),
    [loginMutation],
  )
  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])
  const can = useCallback((capability: Capability) => roleCan(role, capability), [role])
  const refresh = useCallback(() => meQuery.refetch(), [meQuery])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      isLoading: meQuery.isPending,
      isAuthenticated: user !== null,
      login,
      logout,
      isLoggingIn: loginMutation.isPending,
      can,
      refresh,
    }),
    [user, role, meQuery.isPending, login, logout, loginMutation.isPending, can, refresh],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

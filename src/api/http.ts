import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { toApiError } from './errors'

/**
 * Base URL resolution.
 *
 * By default we talk to `/api/v1` on our own origin and let the Vite dev
 * server proxy it (see vite.config.ts). That keeps the `SameSite=lax` session
 * cookie first-party and makes the localhost-vs-127.0.0.1 trap impossible.
 *
 * `VITE_API_URL` overrides it for a real deployment. When it is set, the API
 * origin's hostname must match the page's hostname or the browser will discard
 * the session cookie: login returns 200 and everything after it returns 401.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1'

const SAFE_METHODS = new Set(['get', 'head', 'options'])

export const CSRF_COOKIE = 'ortho_csrf'
export const CSRF_HEADER = 'X-CSRF-Token'

/** Read a non-HttpOnly cookie by name. Returns null when absent. */
export function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  )
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function readCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE)
}

/**
 * Broadcast when a request comes back 401 so the app shell can tear down the
 * session exactly once, from one place, instead of every screen handling it.
 */
export const SESSION_EXPIRED_EVENT = 'ortho:session-expired'

/** Requests whose 401 is an expected answer rather than a lost session. */
const SILENT_401 = [/\/auth\/me$/, /\/auth\/login$/]

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // required — the API authenticates by cookie, not header
  timeout: 30_000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (!SAFE_METHODS.has(method)) {
    const token = readCsrfToken()
    if (token) config.headers.set(CSRF_HEADER, token)
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error)
    if (apiError.status === 401) {
      const url = (error as { config?: AxiosRequestConfig })?.config?.url ?? ''
      if (!SILENT_401.some((re) => re.test(url))) {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
      }
    }
    return Promise.reject(apiError)
  },
)

/* -------------------------------------------------------------------------- */
/*  Thin verb helpers — every call site returns unwrapped data or throws       */
/*  an ApiError. No screen should ever touch `response.data` directly.         */
/* -------------------------------------------------------------------------- */

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.get<T>(url, config)
  return data
}

/**
 * A binary GET — file downloads (the prescription PDF). It goes through the
 * same instance as everything else on purpose: `withCredentials` is what makes
 * the session cookie ride along, and this API authenticates by cookie rather
 * than by a bearer header. That is also why a download here cannot be a plain
 * `<a href>` or a bare `fetch` — neither is guaranteed to carry the cookie to a
 * cross-origin `VITE_API_URL`, so both work in dev and 401 in production.
 *
 * A failure still arrives as an `ApiError` from the response interceptor; note
 * its `message` falls back to the generic per-status text, because an error
 * body on a blob request comes back as a Blob rather than parsed JSON.
 */
export async function apiGetBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  const { data } = await http.get<Blob>(url, { ...config, responseType: 'blob' })
  return data
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await http.post<T>(url, body, config)
  return data
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await http.patch<T>(url, body, config)
  return data
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.delete<T>(url, config)
  return data
}

/**
 * Ensure a CSRF cookie exists before an unauthenticated write (the public
 * booking form). Authenticated writes get theirs from login.
 */
export async function ensurePublicCsrf(): Promise<void> {
  if (readCsrfToken()) return
  await http.get('/public/csrf')
}

/** Absolute URL for a path the API returned (uploads, print views). */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (API_BASE_URL.startsWith('/')) return path.startsWith('/') ? path : `/${path}`
  const origin = new URL(API_BASE_URL, window.location.origin).origin
  return new URL(path, origin).toString()
}

/**
 * WebSocket URL for the speech stream. Derived from the API base so it follows
 * the proxy in dev and the configured origin in production; the session cookie
 * rides the handshake automatically, so there is no token in the URL.
 */
export function websocketUrl(path: string): string {
  const base = API_BASE_URL.startsWith('/')
    ? new URL(API_BASE_URL, window.location.origin)
    : new URL(API_BASE_URL)
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  const prefix = base.pathname.replace(/\/$/, '')
  return `${protocol}//${base.host}${prefix}${path}`
}

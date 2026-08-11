import { AxiosError } from 'axios'

/**
 * Error codes the backend emits. Widened with `(string & {})` so an unknown
 * code from a newer backend still typechecks instead of breaking the build.
 */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'csrf_failed'
  | 'not_found'
  | 'conflict'
  | 'validation_error'
  | 'rate_limited'
  | 'upstream_error'
  | 'network_error'
  | (string & {})

export interface ApiErrorDetail {
  /** Dot-separated path, e.g. `body.first_name` — maps onto a form field. */
  location: string
  message: string
}

interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode
    message: string
    details?: ApiErrorDetail[] | null
  }
}

function isEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const err = (value as { error?: unknown }).error
  return typeof err === 'object' && err !== null && 'message' in err
}

/**
 * The single error type the UI reasons about. Every failed request — including
 * a network failure with no response at all — becomes one of these, so callers
 * never have to branch on `axios.isAxiosError`.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: ApiErrorDetail[]
  readonly correlationId: string | null

  constructor(init: {
    code: ApiErrorCode
    message: string
    status: number
    details?: ApiErrorDetail[]
    correlationId?: string | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.code = init.code
    this.status = init.status
    this.details = init.details ?? []
    this.correlationId = init.correlationId ?? null
  }

  /** Session is gone — the caller should send the user to /login. */
  get isUnauthorized() {
    return this.status === 401
  }

  /** Permission denied — the caller should hide the control, not redirect. */
  get isForbidden() {
    return this.status === 403 && this.code !== 'csrf_failed'
  }

  get isValidation() {
    return this.status === 422 || this.code === 'validation_error'
  }

  get isConflict() {
    return this.status === 409
  }

  /**
   * Field errors keyed by form path with the `body.` / `query.` prefix
   * stripped, ready to hand to react-hook-form's `setError`.
   */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const d of this.details) {
      const path = d.location.replace(/^(body|query|path|header|cookie)\./, '')
      if (path && !(path in out)) out[path] = d.message
    }
    return out
  }
}

const FALLBACK_MESSAGE: Record<number, string> = {
  400: 'That request could not be processed.',
  401: 'Your session has expired.',
  403: 'You do not have permission to do that.',
  404: 'That could not be found.',
  409: 'That conflicts with something that already exists.',
  422: 'Some fields need attention.',
  429: 'Too many requests — please wait a moment.',
  500: 'Something went wrong on the server.',
  502: 'An upstream service is unavailable. This is not your fault.',
  503: 'The service is temporarily unavailable.',
}

/** Normalize anything thrown by axios into an {@link ApiError}. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof AxiosError) {
    const response = error.response
    const correlationId =
      (response?.headers?.['x-correlation-id'] as string | undefined) ?? null

    if (!response) {
      return new ApiError({
        code: 'network_error',
        message:
          error.code === 'ECONNABORTED'
            ? 'The request timed out.'
            : 'Could not reach the server. Check that the API is running.',
        status: 0,
        correlationId,
      })
    }

    const body: unknown = response.data
    if (isEnvelope(body)) {
      return new ApiError({
        code: body.error.code,
        message: body.error.message,
        status: response.status,
        details: body.error.details ?? [],
        correlationId,
      })
    }

    return new ApiError({
      code: 'bad_request',
      message: FALLBACK_MESSAGE[response.status] ?? `Request failed (${response.status}).`,
      status: response.status,
      correlationId,
    })
  }

  return new ApiError({
    code: 'bad_request',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    status: 0,
  })
}

/**
 * A single human-readable line for a toast. Validation errors are summarised
 * by field count rather than dumping the whole list into a toast.
 */
export function errorMessage(error: unknown): string {
  const e = toApiError(error)
  if (e.isValidation && e.details.length > 0) {
    return e.details.length === 1
      ? `${e.details[0].location.split('.').pop()}: ${e.details[0].message}`
      : `${e.details.length} fields need attention.`
  }
  return e.message
}

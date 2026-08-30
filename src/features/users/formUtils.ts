import { toast } from 'sonner'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError, errorMessage } from '@/api/errors'

/** Field errors where they belong, one toast for everything else. */
export function reportMutationError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  let matched = false
  if (error instanceof ApiError) {
    for (const [path, message] of Object.entries(error.fieldErrors())) {
      if ((fields as readonly string[]).includes(path)) {
        setError(path as Path<T>, { message })
        matched = true
      }
    }
  }
  if (!matched) toast.error(errorMessage(error))
}

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A readable one-time password an admin can dictate over the phone. */
export function suggestPassword(length = 14): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('')
}

/**
 * The toast for a mutation with no form behind it. A 403 or a 409 from the
 * users API is not a bug report: the backend writes those sentences for the
 * person holding the account — "Your role (Reception) does not allow this…",
 * "that is the last active superadmin" — so the message is passed through
 * verbatim and left on screen long enough to be read rather than glimpsed.
 */
export function reportActionError(error: unknown): void {
  const explained = error instanceof ApiError && (error.isForbidden || error.isConflict)
  toast.error(errorMessage(error), explained ? { duration: 9000 } : undefined)
}

/**
 * Where "your own account" lives for the signed-in user.
 *
 * This screen mounts in both trees — `/settings/users` for a doctor onboarding
 * staff, `/superadmin/users` for the operator — and the account screen sits at
 * a different path in each. The trees are disjoint by role, though, so the flag
 * that decides which tree you are in also decides the path: there is no case
 * where a superadmin is under `/settings` or a clinic user under `/superadmin`.
 * That makes this derivable rather than something the screen must be told.
 */
export function accountPath(isSuperadmin: boolean): string {
  return isSuperadmin ? '/superadmin/account' : '/settings/account'
}

/** How to name that destination in prose, matching each shell's own wording. */
export function accountLocation(isSuperadmin: boolean): string {
  return isSuperadmin ? 'Your account' : 'Settings › Your account'
}

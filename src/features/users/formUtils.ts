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

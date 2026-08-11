import { z } from 'zod'
import { toast } from 'sonner'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError, errorMessage } from '@/api/errors'

/** An empty input means "clear this field", which the API spells as `null`. */
export function trimmedOrNull(value: string | undefined): string | null {
  const v = (value ?? '').trim()
  return v === '' ? null : v
}

/** The API hands back `null` for an unset field; a text input needs `''`. */
export function textValue(value: string | null | undefined): string {
  return value ?? ''
}

/** A bounded, optional free-text field, mirroring the backend's `maxLength`. */
export function optionalText(max: number) {
  return z.string().max(max, `Use at most ${max} characters`)
}

/** A required free-text field with the backend's 1..max bound. */
export function requiredText(max: number, message: string) {
  return z.string().trim().min(1, message).max(max, `Use at most ${max} characters`)
}

/**
 * Map a 422 onto the form. Returns false when the server complained about
 * something this form does not render, so the caller can fall back to a toast.
 */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError)) return false
  let matched = false
  for (const [path, message] of Object.entries(error.fieldErrors())) {
    if ((fields as readonly string[]).includes(path)) {
      setError(path as Path<T>, { message })
      matched = true
    }
  }
  return matched
}

/** Field errors where they belong, one toast for everything else. */
export function reportMutationError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  if (!applyApiFieldErrors(error, setError, fields)) toast.error(errorMessage(error))
}

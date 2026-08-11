import { z } from 'zod'
import { toast } from 'sonner'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError, errorMessage } from '@/api/errors'

export function trimmedOrNull(value: string | undefined): string | null {
  const v = (value ?? '').trim()
  return v === '' ? null : v
}

export function textValue(value: string | null | undefined): string {
  return value ?? ''
}

export function optionalText(max: number) {
  return z.string().max(max, `Use at most ${max} characters`)
}

export function requiredText(max: number, message: string) {
  return z.string().trim().min(1, message).max(max, `Use at most ${max} characters`)
}

/** `sort_order` is a plain integer with no declared bounds. */
export const sortOrderField = z
  .string()
  .refine((v) => v.trim() === '' || /^\d{1,4}$/.test(v.trim()), 'Enter a whole number')

export function sortOrderValue(value: string): number {
  const v = value.trim()
  return v === '' ? 0 : Number(v)
}

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

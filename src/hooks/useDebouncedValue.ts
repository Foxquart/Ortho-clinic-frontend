import { useEffect, useState } from 'react'

/**
 * Debounce a fast-changing value (a search box) before it becomes a request.
 * 180ms is under the threshold where typing feels laggy but still collapses
 * a burst of keystrokes into one call.
 */
export function useDebouncedValue<T>(value: T, delay = 180): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

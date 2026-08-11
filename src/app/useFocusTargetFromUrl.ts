import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Field labels a `?focus=` value is allowed to name, lower-cased. */
const FOCUSABLE_FIELDS: Record<string, string> = {
  patient: 'patient',
}

function isFieldLike(el: HTMLElement): boolean {
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function findField(name: string): HTMLElement | null {
  const main = document.querySelector('main')
  if (!main) return null

  // Preferred contract: the screen marks its own field.
  const marked = main.querySelector<HTMLElement>(`[data-focus="${CSS.escape(name)}"]`)
  if (marked) return marked

  // Fallback: find the field by the visible label it is wired to. Works for any
  // control built with `<Field>`, whose ids come from `useId()` and so cannot be
  // targeted directly.
  const wanted = FOCUSABLE_FIELDS[name]
  if (!wanted) return null
  for (const label of main.querySelectorAll('label[for]')) {
    if (!(label instanceof HTMLLabelElement)) continue
    if (label.textContent?.trim().toLowerCase().startsWith(wanted)) {
      return label.control instanceof HTMLElement ? label.control : null
    }
  }
  return null
}

/**
 * `?focus=patient` puts the caret where the user was already headed.
 *
 * Home's "Type" card links to the pad with this, so choosing to type lands on
 * the patient field rather than at the top of a form. It is deliberately
 * defensive: routes are lazy, so the screen may mount several frames after the
 * URL changes, and it gives up quietly if the field never appears or if the
 * screen has already claimed focus for itself.
 */
export function useFocusTargetFromUrl() {
  const { key, pathname, search } = useLocation()

  useEffect(() => {
    const name = new URLSearchParams(search).get('focus')
    if (!name) return

    let attempts = 0
    let timer = 0

    const tryFocus = () => {
      // If the screen has already put focus in a field of its own, leave it alone.
      const active = document.activeElement
      if (attempts > 0 && active instanceof HTMLElement && isFieldLike(active)) return

      const target = findField(name)
      if (target) {
        target.focus()
        return
      }
      if (++attempts < 12) timer = window.setTimeout(tryFocus, 50)
    }

    timer = window.setTimeout(tryFocus, 0)
    return () => window.clearTimeout(timer)
    // `key` changes on every navigation, including back to the same URL.
  }, [key, pathname, search])
}

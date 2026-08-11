import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GO_TO_TARGETS } from './navigation'

/** True when the keystroke belongs to whatever the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[role="dialog"], [cmdk-root]') !== null
  )
}

/**
 * Linear-style two-key navigation: press `g`, then a destination key within a
 * second. Deliberately does nothing while a field has focus, so typing "g" in
 * a diagnosis box never teleports the doctor away from an unsaved form.
 *
 * The chords cover more than the sidebar: `g d` and `g a` still reach the
 * dashboard and the schedule now that those rows are gone, and `g v` starts
 * dictation. The full table is in `navigation.ts`.
 */
export function useGoToShortcuts() {
  const navigate = useNavigate()
  const pending = useRef<number | null>(null)

  useEffect(() => {
    const map = new Map(GO_TO_TARGETS.map((target) => [target.goKey, target.to]))

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const key = e.key.toLowerCase()

      if (pending.current !== null) {
        window.clearTimeout(pending.current)
        pending.current = null
        const to = map.get(key)
        if (to) {
          e.preventDefault()
          navigate(to)
        }
        return
      }

      if (key === 'g') {
        pending.current = window.setTimeout(() => {
          pending.current = null
        }, 1000)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (pending.current !== null) window.clearTimeout(pending.current)
    }
  }, [navigate])
}

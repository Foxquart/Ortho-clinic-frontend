import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The design system defines its own optical type scale (`text-body`,
 * `text-caption`, …) alongside semantic text colours (`text-accent-fg`,
 * `text-text-muted`, …). Both are `text-*`, and tailwind-merge has no way to
 * know which is which for names outside Tailwind's default scale — so it puts
 * them in one group and the last one wins.
 *
 * That silently deleted colours: `cn('bg-accent text-accent-fg', 'text-body')`
 * resolved to `text-body` alone, and the label fell back to the inherited body
 * colour. In dark mode that is near-white on a blue fill and looks fine; in
 * light mode it is near-black on blue. The bug was invisible in exactly one of
 * the two themes.
 *
 * Declaring the scale as font sizes lets the two groups coexist.
 */
const TYPE_SCALE = ['display', 'title', 'heading', 'body', 'label', 'caption', 'micro']

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: TYPE_SCALE }],
    },
  },
})

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

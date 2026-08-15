/**
 * Small shared building blocks for the landing page: CTA buttons (with an
 * opt-in magnetic pull), lifestyle icon resolver, and a star rating.
 * Nothing here owns scroll animation — that is centralised in `LandingPage`
 * so the reduced-motion decision lives in exactly one place.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  ArrowUpRight,
  Bike,
  BookOpen,
  Camera,
  Coffee,
  Compass,
  Heart,
  Mic,
  Sparkles,
  Star,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { scrollToAnchor } from './smoothScroll'

/* -------------------------------------------------------------------------- */
/*  Magnetic pull                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pulls the element a little toward the pointer, then springs back on leave.
 * Additive and self-cancelling: disabled on coarse pointers and under reduced
 * motion, and it never affects layout (transform only), so the control stays
 * fully usable if the effect never runs.
 */
function useMagnetic(ref: React.RefObject<HTMLElement | null>): void {
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!fine || reduce) return

      const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' })
      const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' })

      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28)
        yTo((e.clientY - (r.top + r.height / 2)) * 0.4)
      }
      const reset = () => {
        xTo(0)
        yTo(0)
      }

      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerleave', reset)
      el.addEventListener('blur', reset)
      return () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerleave', reset)
        el.removeEventListener('blur', reset)
      }
    },
    { scope: ref },
  )
}

/* -------------------------------------------------------------------------- */
/*  CTA buttons                                                               */
/* -------------------------------------------------------------------------- */

type CtaTone = 'primary' | 'secondary' | 'ghost'
type CtaSize = 'md' | 'lg'

const TONE: Record<CtaTone, string> = {
  primary:
    'bg-[color:var(--lp-accent)] text-[color:var(--lp-accent-fg)] hover:bg-[color:var(--lp-accent-strong)] shadow-sm hover:shadow-md',
  secondary:
    'border border-border-strong text-text bg-surface/70 hover:bg-surface-hover hover:border-border-strong',
  ghost: 'text-text hover:bg-surface-hover',
}

const SIZE: Record<CtaSize, string> = {
  md: 'h-control px-4 text-label',
  lg: 'h-control-lg px-6 text-label',
}

function ctaClass(tone: CtaTone, size: CtaSize, className?: string): string {
  return cn(
    'group relative inline-flex select-none items-center justify-center gap-2 rounded-sm font-semibold whitespace-nowrap',
    'transition-[background-color,border-color,box-shadow,transform] duration-fast ease-out-quint',
    'active:scale-[0.98] motion-reduce:active:scale-100',
    TONE[tone],
    SIZE[size],
    className,
  )
}

/**
 * An anchor that smooth-scrolls to an in-page section. Keeps a real `href` so
 * it works (as a plain jump) without JavaScript and is keyboard-operable.
 */
export function ScrollButton({
  target,
  tone = 'primary',
  size = 'lg',
  magnetic = false,
  className,
  children,
  ...rest
}: {
  target: string
  tone?: CtaTone
  size?: CtaSize
  magnetic?: boolean
  children: ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>) {
  const ref = useRef<HTMLAnchorElement>(null)
  useMagnetic(magnetic ? ref : { current: null })

  return (
    <a
      ref={ref}
      href={`#${target}`}
      onClick={(e) => {
        e.preventDefault()
        scrollToAnchor(target)
      }}
      className={ctaClass(tone, size, className)}
      {...rest}
    >
      {children}
    </a>
  )
}

/* -------------------------------------------------------------------------- */
/*  Lifestyle icons                                                           */
/* -------------------------------------------------------------------------- */

const LIFESTYLE_ICONS: Record<string, LucideIcon> = {
  speaking: Mic,
  workshop: Users,
  lecture: BookOpen,
  travel: Compass,
  coffee: Coffee,
  cycling: Bike,
  photography: Camera,
  reading: BookOpen,
  family: Heart,
  kitchen: Sparkles,
  stethoscope: Stethoscope,
}

/** Maps a lifestyle tag to a Lucide glyph. */
export function LifestyleIcon({
  name,
  className,
}: {
  name: string | null
  className?: string
}) {
  const Icon = (name && LIFESTYLE_ICONS[name.toLowerCase()]) || Stethoscope
  return <Icon aria-hidden className={className} strokeWidth={1.5} />
}

/* -------------------------------------------------------------------------- */
/*  Service icon (kept for backward compatibility with CMS data)              */
/* -------------------------------------------------------------------------- */

const SERVICE_ICONS: Record<string, LucideIcon> = {
  bone: Stethoscope,
  activity: Stethoscope,
  camera: Camera,
  scan: Stethoscope,
  shield: Stethoscope,
  heart: Heart,
  stethoscope: Stethoscope,
}

/** Maps the CMS `icon_name` to a Lucide glyph, with a calm default. */
export function ServiceIcon({
  name,
  className,
}: {
  name: string | null
  className?: string
}) {
  const Icon = (name && SERVICE_ICONS[name.toLowerCase()]) || Stethoscope
  return <Icon aria-hidden className={className} strokeWidth={1.5} />
}

/* -------------------------------------------------------------------------- */
/*  Star rating                                                              */
/* -------------------------------------------------------------------------- */

export function StarRating({ rating }: { rating: number }) {
  const value = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            'size-4',
            i < value ? 'fill-[var(--lp-accent)] text-[color:var(--lp-accent)]' : 'text-border-strong',
          )}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tiny inline arrow link                                                    */
/* -------------------------------------------------------------------------- */

export function ArrowLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-1 text-label font-semibold text-[color:var(--lp-accent)] hover:text-[color:var(--lp-accent-strong)] transition-colors duration-fast"
    >
      {children}
      <ArrowUpRight
        aria-hidden
        className="size-4 transition-transform duration-fast group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
    </a>
  )
}

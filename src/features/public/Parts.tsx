/**
 * The public site's small shared vocabulary: containers, section rhythm,
 * headings, prose and the two honest fallbacks (loading, empty).
 *
 * The admin app is a dense tool; this is a page people read on a phone while
 * deciding whether to trust a surgeon. Same tokens, more air and larger type.
 */
import {
  Activity,
  Bone,
  Camera,
  HeartPulse,
  Scan,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { paragraphs } from './content'

/* -------------------------------------------------------------------------- */
/*  Type scale                                                                */
/* -------------------------------------------------------------------------- */

/** Hero headline. Fluid so a 360px phone never gets a two-word-per-line title. */
export const HERO_TYPE =
  'text-[clamp(2.125rem,6.2vw,3.375rem)] leading-[1.06] tracking-tighter font-semibold'
/** Page `h1` on an inner page. */
export const PAGE_TITLE_TYPE =
  'text-[clamp(1.875rem,4.6vw,2.75rem)] leading-[1.1] tracking-tighter font-semibold'
/** Section `h2`. */
export const SECTION_TITLE_TYPE =
  'text-[clamp(1.375rem,3.2vw,1.875rem)] leading-[1.15] tracking-tight font-semibold'
/** Standfirst under a title. */
export const LEDE_TYPE = 'text-[clamp(1rem,1.5vw,1.1875rem)] leading-[1.62]'
/** Reading text. Deliberately larger than the app's 15px body. */
export const PROSE_TYPE = 'text-[1.0625rem] leading-[1.7]'

/* -------------------------------------------------------------------------- */
/*  Layout                                                                    */
/* -------------------------------------------------------------------------- */

export function Container({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('max-w-content mx-auto w-full px-5 sm:px-8', className)}>{children}</div>
  )
}

export function Section({
  id,
  tone = 'plain',
  className,
  children,
}: {
  id?: string
  /** `sunken` gives an alternating band without inventing a new colour. */
  tone?: 'plain' | 'sunken'
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'py-14 sm:py-20',
        tone === 'sunken' && 'border-border bg-bg-sunken border-y',
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  )
}

export function SectionHead({
  eyebrow,
  title,
  description,
  align = 'start',
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'start' | 'center'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' && 'mx-auto max-w-2xl text-center',
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className={cn(SECTION_TITLE_TYPE, 'text-text')}>{title}</h2>
      {description && (
        <p
          className={cn(LEDE_TYPE, 'text-text-muted max-w-prose', align === 'center' && 'mx-auto')}
        >
          {description}
        </p>
      )}
    </div>
  )
}

/**
 * The `h1` block at the top of an inner page. Title and subtitle come from the
 * CMS; `fallbackTitle` only covers the window before the page loads (and a
 * slug the doctor has not written yet), so the tab and the heading are never
 * blank.
 */
export function PageIntro({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className={cn(PAGE_TITLE_TYPE, 'text-text')}>{title}</h1>
      {subtitle && <p className={cn(LEDE_TYPE, 'text-text-muted')}>{subtitle}</p>}
      {children}
    </div>
  )
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn('text-micro tracking-caps text-accent uppercase', className)}>{children}</p>
  )
}

/** Renders a CMS body as paragraphs. Never dangerouslySetInnerHTML. */
export function Prose({ body, className }: { body: string; className?: string }) {
  const parts = paragraphs(body)
  if (parts.length === 0) return null
  return (
    <div className={cn('flex flex-col gap-4', PROSE_TYPE, 'text-text-muted', className)}>
      {parts.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Link buttons                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every call to action on this site is a real link, not a button that calls
 * `navigate()` — patients middle-click, long-press and share these.
 *
 * Styling comes entirely from the shared `Button` via `asChild`; these two
 * wrappers only supply the link element and, on `lg`, the 44px touch minimum.
 * The admin kit's `lg` is 40px, which is right for a mouse at a desk and one
 * notch short for a thumb on a phone — and a phone is what this surface is.
 */
export type LinkSize = 'md' | 'lg'

/** `lg` is the tap-sized variant; `md` keeps the kit's own geometry. */
const TAP_SIZE: Record<LinkSize, string> = {
  md: '',
  lg: 'min-h-tap px-5',
}

export function ButtonLink({
  to,
  tone = 'secondary',
  size = 'md',
  iconRight,
  className,
  children,
}: {
  to: string
  tone?: ButtonVariant
  size?: LinkSize
  iconRight?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Button
      asChild
      variant={tone}
      size={size}
      iconRight={iconRight}
      className={cn('no-underline', TAP_SIZE[size], className)}
    >
      <Link to={to}>{children}</Link>
    </Button>
  )
}

/** Same treatment for a `tel:`, `mailto:` or external destination. */
export function ButtonAnchor({
  href,
  tone = 'secondary',
  size = 'md',
  external = false,
  className,
  children,
}: {
  href: string
  tone?: ButtonVariant
  size?: LinkSize
  external?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Button
      asChild
      variant={tone}
      size={size}
      className={cn('no-underline', TAP_SIZE[size], className)}
    >
      <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
        {children}
      </a>
    </Button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cards and small pieces                                                    */
/* -------------------------------------------------------------------------- */

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-border bg-surface rounded-xl border p-6 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * The CMS stores a free-text `icon_name`. We map the ones the clinic actually
 * uses and fall back to a neutral medical mark — never to a random icon that
 * would imply a treatment the service is not.
 */
const SERVICE_ICONS: Record<string, typeof Stethoscope> = {
  bone: Bone,
  activity: Activity,
  camera: Camera,
  scan: Scan,
  shield: Shield,
  heart: HeartPulse,
  syringe: Syringe,
  sparkles: Sparkles,
  stethoscope: Stethoscope,
}

export function ServiceIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && SERVICE_ICONS[name.toLowerCase()]) || Stethoscope
  return (
    <span
      aria-hidden
      className={cn(
        'bg-accent-muted text-accent grid size-11 shrink-0 place-items-center rounded-lg [&_svg]:size-5.5',
        className,
      )}
    >
      <Icon />
    </span>
  )
}

export function Stars({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${filled} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden
          className={cn(
            'size-4',
            index < filled ? 'fill-warning text-warning' : 'text-border-strong',
          )}
        />
      ))}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  States                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A block of shimmer sized like the content that is coming. Public pages are
 * the one place a visitor has no patience at all, so nothing shifts on arrival.
 */
export function LoadingBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="bg-border/60 h-4 animate-pulse rounded-sm motion-reduce:animate-none"
          style={{ width: `${94 - ((index * 17) % 38)}%` }}
        />
      ))}
    </div>
  )
}

/**
 * An empty collection is a fact about the clinic, not a failure. Say what is
 * missing plainly and keep a way forward on screen.
 */
export function SiteEmpty({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-body text-text font-medium">{title}</p>
      {description && <p className="text-body text-text-muted max-w-md">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/**
 * Errors on a marketing page are told from the visitor's point of view: they
 * do not care about status codes, they care whether they can still reach the
 * clinic. Contact details are passed in by the caller when we have them.
 */
export function SiteError({
  title = 'We could not load this just now',
  description = 'Please try again in a moment.',
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'border-border bg-surface flex flex-col items-start gap-2 rounded-xl border px-6 py-8',
        className,
      )}
    >
      <p className="text-body text-text font-medium">{title}</p>
      <p className="text-body text-text-muted">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-body text-accent mt-2 rounded-sm font-medium underline-offset-4 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  )
}

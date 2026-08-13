/**
 * Services — a cinematic bento for what the clinic treats: one large feature
 * tile carrying a real photograph, then the remaining services as an editorial
 * hairline list with accent index numerals. Deliberately NOT three equal cards.
 *
 * Content is the CMS `services` collection (react-query cached). Loading paints
 * a same-shape skeleton so nothing shifts; an empty collection degrades to a
 * short note rather than a broken grid.
 *
 * Motion: `data-reveal` / `data-reveal-group` / `data-reveal-item` are the hooks
 * the page's GSAP reads. Nothing here sets an opacity baseline.
 */
import { ArrowUpRight } from 'lucide-react'
import { img } from '@/features/landing/imagery'
import { ServiceIcon } from '@/features/landing/primitives'
import { sortedServices } from '@/features/public/content'
import { usePublicPortfolio } from '@/features/public/usePublicData'
import type { ServiceResponse } from '@/api/schema'

export function ServicesSection() {
  const portfolio = usePublicPortfolio()
  const services = sortedServices(portfolio.data?.services)
  const [feature, ...rest] = services

  return (
    <section id="services" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="mb-12 flex flex-col gap-5 md:mb-16 md:flex-row md:items-end md:justify-between md:gap-12">
          <h2 data-reveal className="lp-h2 max-w-[18ch]">
            Care for every joint, at every stage.
          </h2>
          <p data-reveal className="lp-lead max-w-[42ch]">
            From the first scan to the last session of rehabilitation, one team follows the whole
            arc of your recovery.
          </p>
        </div>

        {portfolio.isPending ? (
          <ServicesSkeleton />
        ) : !feature ? (
          <p className="text-body text-text-muted rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            Treatment details are being added. Call the clinic and we will guide you.
          </p>
        ) : (
          <div
            data-reveal-group
            className={rest.length > 0 ? 'grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-5' : 'grid'}
          >
            <FeatureTile service={feature} />
            {rest.length > 0 && (
              <div className="flex flex-col">
                {rest.map((service, i) => (
                  <ServiceRow key={service.id} service={service} index={i + 2} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Feature tile — real photograph, service laid over a filmic scrim          */
/* -------------------------------------------------------------------------- */

function FeatureTile({ service }: { service: ServiceResponse }) {
  return (
    <article
      data-reveal-item
      className="group relative isolate flex min-h-[26rem] overflow-hidden rounded-3xl sm:min-h-[30rem]"
    >
      <div className="lp-media lp-scrim absolute inset-0">
        <img
          src={img('strength', { w: 1100, h: 1300 })}
          alt="A patient rebuilding strength during supervised rehabilitation."
          loading="lazy"
          className="size-full object-cover"
        />
      </div>
      <div className="relative z-10 flex flex-1 flex-col justify-between gap-10 p-7 sm:p-9">
        <div className="flex items-center justify-between">
          <span className="grid size-12 place-items-center rounded-xl border border-[color:var(--lp-accent-line)] bg-[color:var(--lp-accent-tint)] text-[color:var(--lp-accent)] backdrop-blur-sm">
            <ServiceIcon name={service.icon_name} className="size-6" />
          </span>
          <span className="lp-numeral text-caption font-semibold text-[color:var(--lp-accent)]">
            01
          </span>
        </div>
        <div>
          <h3 className="text-text text-[1.75rem] leading-tight font-semibold tracking-tight text-balance sm:text-[2.1rem]">
            {service.title}
          </h3>
          {service.description && (
            <p className="text-body text-text-muted mt-3 max-w-[40ch] leading-relaxed line-clamp-3">
              {service.description}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/*  List row — accent numeral + icon + title, split by a hairline             */
/* -------------------------------------------------------------------------- */

function ServiceRow({ service, index }: { service: ServiceResponse; index: number }) {
  return (
    <article
      data-reveal-item
      className="group flex items-start gap-4 border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0 sm:gap-5 sm:py-6"
    >
      <span className="lp-numeral text-body text-text-subtle w-8 shrink-0 pt-1 tabular-nums">
        {String(index).padStart(2, '0')}
      </span>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--lp-accent-tint)] text-[color:var(--lp-accent)]">
        <ServiceIcon name={service.icon_name} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-heading text-text font-semibold tracking-tight">{service.title}</h3>
          <ArrowUpRight
            aria-hidden
            className="text-text-subtle duration-base size-4 shrink-0 transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[color:var(--lp-accent)]"
          />
        </div>
        {service.description && (
          <p className="text-body text-text-muted mt-1.5 leading-relaxed line-clamp-2">
            {service.description}
          </p>
        )}
      </div>
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/*  Loading — mirrors the bento so the layout does not shift when data lands   */
/* -------------------------------------------------------------------------- */

function ServicesSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-5">
      <div className="bg-surface min-h-[26rem] animate-pulse rounded-3xl motion-reduce:animate-none sm:min-h-[30rem]" />
      <div className="flex flex-col">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex items-start gap-4 border-t border-border py-6 first:border-t-0 first:pt-0 sm:gap-5"
          >
            <div className="bg-surface size-11 shrink-0 animate-pulse rounded-xl motion-reduce:animate-none" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="bg-surface h-4 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
              <div className="bg-surface-hover h-3 w-4/5 animate-pulse rounded motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

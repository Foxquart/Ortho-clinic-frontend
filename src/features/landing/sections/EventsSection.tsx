/**
 * Events — where the doctor will be, out in the world.
 *
 * An editorial split: one tall feature photograph of a talk on the left, and
 * a hairline list of upcoming appearances on the right. Dates, venues and
 * cities are curated prototype content; the shape mirrors what a CMS `events`
 * collection would feed later.
 *
 * MOTION CONTRACT (see landing.css): `data-reveal` and `data-reveal-group` /
 * `data-reveal-item` are the hooks the page's GSAP reads. Nothing here sets an
 * opacity baseline.
 */
import { ArrowUpRight } from 'lucide-react'
import { img } from '@/features/landing/imagery'

interface Appearance {
  date: string
  month: string
  title: string
  venue: string
  city: string
  kind: string
}

const APPEARANCES: Appearance[] = [
  {
    date: '21',
    month: 'Sep',
    title: 'Smile design, honestly',
    venue: 'Indian Orthodontic Society Conference',
    city: 'Mumbai',
    kind: 'Keynote',
  },
  {
    date: '04',
    month: 'Oct',
    title: 'What dentistry taught me about patience',
    venue: 'TEDx Salon',
    city: 'Pune',
    kind: 'Talk',
  },
  {
    date: '18',
    month: 'Oct',
    title: 'Clear aligners, clear expectations',
    venue: 'Dental Study Circle',
    city: 'Bangalore',
    kind: 'Workshop',
  },
  {
    date: '09',
    month: 'Nov',
    title: 'The first consultation, without fear',
    venue: 'Community Health Sunday',
    city: 'Kolkata',
    kind: 'Open session',
  },
]

export function EventsSection() {
  return (
    <section id="events" className="scroll-mt-[var(--nav-h)] py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="mb-12 md:mb-16">
          <p data-reveal className="lp-kicker mb-5">
            Out and about
          </p>
          <h2 data-reveal className="lp-h2 max-w-[18ch]">
            Where you will find me next.
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          {/* Feature photograph */}
          <figure data-reveal className="lp-media relative aspect-[4/5] overflow-hidden rounded-3xl sm:aspect-auto sm:min-h-[34rem]">
            <img
              src={img('speaking', { w: 1100, h: 1400 })}
              alt="Speaking to a full auditorium at an evening conference."
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
            <div className="lp-scrim pointer-events-none absolute inset-0" />
            <figcaption className="absolute inset-x-0 bottom-0 z-10 p-7 sm:p-8">
              <p className="lp-serif text-[color:var(--lp-accent-fg)] text-2xl leading-snug text-balance sm:text-3xl">
                Most weekends there is a stage, a whiteboard, or a long table of
                students somewhere.
              </p>
            </figcaption>
          </figure>

          {/* Appearances list */}
          <div data-reveal-group className="flex flex-col justify-center">
            {APPEARANCES.map((event) => (
              <article
                key={`${event.date}-${event.title}`}
                data-reveal-item
                className="group flex items-start gap-5 border-t border-border py-6 first:border-t-0 first:pt-0 last:pb-0 sm:gap-7"
              >
                <div className="w-12 shrink-0 pt-0.5 text-center">
                  <div className="lp-serif text-text text-3xl leading-none tabular-nums">
                    {event.date}
                  </div>
                  <div className="text-caption text-text-subtle mt-1 uppercase tracking-[0.14em]">
                    {event.month}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-heading text-text font-semibold tracking-tight">
                      {event.title}
                    </h3>
                    <ArrowUpRight
                      aria-hidden
                      className="size-4 shrink-0 text-text-subtle transition-[color,transform] duration-base group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[color:var(--lp-accent)]"
                    />
                  </div>
                  <p className="text-body text-text-muted mt-1">
                    {event.venue}, {event.city}
                  </p>
                  <p className="text-caption mt-1.5 font-medium uppercase tracking-[0.14em] text-[color:var(--lp-accent)]">
                    {event.kind}
                  </p>
                </div>
              </article>
            ))}

            <p data-reveal-item className="text-body text-text-muted mt-8 max-w-[46ch]">
              Inviting a speaker for your conference, college, or community
              evening?{' '}
              <a
                href="#book"
                className="font-semibold text-[color:var(--lp-accent)] underline-offset-4 transition-colors duration-fast hover:text-[color:var(--lp-accent-strong)] hover:underline"
              >
                Book a time and tell me about it
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

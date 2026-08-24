/**
 * The record — training, post, broadcast and published work.
 *
 * This is the section that replaces the old "upcoming events" list, and it
 * does a different job. A visiting-speaker page needs a diary; a surgeon's
 * page needs evidence. So this is a career spine on the right of a feature
 * photograph, and underneath it the two things Dr. Deb Roy has that almost no
 * competing practice in Agartala can show: an hour of state television on a
 * single condition, and a peer-reviewed paper.
 *
 * Both are linked out deliberately rather than described. They are checkable,
 * which is the whole point of putting them here — search engines and AI
 * assistants both weigh a third-party-anchored claim far above a self-reported
 * one, and a patient deciding who to trust does the same thing.
 *
 * MOTION CONTRACT (see landing.css): `data-reveal`, `data-reveal-group` /
 * `data-reveal-item` and `data-reveal-clip` are the hooks the page's GSAP
 * reads. Nothing here sets an opacity baseline, and the feature photograph's
 * clip reveal is a `gsap.from`, so its resting DOM state is unclipped.
 */
import { FileText, Radio } from 'lucide-react'
import { img } from '@/features/landing/imagery'
import { ArrowLink, CtaArrowUpRight, DraftChip } from '@/features/landing/primitives'
import { MEDIA, MILESTONES, PUBLICATIONS, published } from '@/features/landing/profile'

export function RecordSection() {
  const milestones = published(MILESTONES)
  const media = published(MEDIA)
  const papers = published(PUBLICATIONS)

  return (
    <section id="record" className="scroll-mt-[var(--lp-anchor-offset)] py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="mb-12 md:mb-16">
          <p data-reveal className="lp-kicker mb-5">
            The record
          </p>
          <h2 data-reveal className="lp-h2 max-w-[18ch]">
            Twenty-two years, nearly all of them in Tripura.
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          {/* Feature photograph */}
          {/* `data-reveal-clip`, not a fade: a photograph this size fading up
              reads as a slow image load. The wipe reads as an entrance. The
              aspect ratio does the mobile work — the figure is a grid child
              with no intrinsic width, so it can never exceed the column. */}
          <figure
            data-reveal-clip
            className="lp-media relative aspect-[4/5] w-full overflow-hidden rounded-3xl sm:aspect-auto sm:min-h-[34rem]"
          >
            <img
              src={img('teaching', { w: 1100, h: 1400 })}
              alt="Teaching rounds in a hospital corridor."
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
            <div className="lp-scrim pointer-events-none absolute inset-0" />
            <figcaption className="absolute inset-x-0 bottom-0 z-10 p-7 sm:p-8">
              <p className="lp-serif text-[color:var(--lp-accent-fg)] text-2xl leading-snug text-balance sm:text-3xl">
                A government hospital in the morning, a small clinic in the
                evening, and the same patients moving between the two.
              </p>
            </figcaption>
          </figure>

          {/* Career spine */}
          <div data-reveal-group className="flex flex-col justify-center">
            {milestones.map((milestone) => (
              <article
                key={milestone.title}
                data-reveal-item
                className="flex items-start gap-5 border-t border-border py-6 first:border-t-0 first:pt-0 last:pb-0 sm:gap-7"
              >
                <div className="w-16 shrink-0 pt-1">
                  <div className="lp-serif text-text text-2xl leading-none tabular-nums">
                    {milestone.when}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-heading text-text font-semibold tracking-tight">
                    {milestone.title}
                  </h3>
                  <p className="text-body text-text-muted mt-1">{milestone.detail}</p>
                  {milestone.draft && <DraftChip className="mt-2.5" />}
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Broadcast + published work — the checkable half */}
        {media.map((item) => (
          <figure key={item.url} data-reveal className="mt-14">
            {/* `loading="lazy"` is the one change from YouTube's own embed
                code, and it is not optional here: the player pulls well over a
                megabyte, and most of this page's traffic is mid-range Android
                on Tripura mobile data. Lazy keeps it off the critical path
                until someone scrolls to it. */}
            <div className="lp-media aspect-video w-full overflow-hidden rounded-3xl">
              <iframe
                src={item.embedUrl}
                title={`${item.title} — ${item.outlet}`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="size-full border-0"
              />
            </div>

            <figcaption className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <div className="text-caption font-semibold uppercase tracking-[0.14em] text-[color:var(--lp-accent)]">
                  <Radio aria-hidden strokeWidth={1.5} className="mr-2 inline size-4 align-[-0.2em]" />
                  {item.outlet}
                </div>
                <h3 className="lp-serif text-text mt-2 text-2xl leading-snug text-balance">
                  {item.title}
                </h3>
                {item.note && <p className="text-body text-text-muted mt-1.5">{item.note}</p>}
                {/* The way out of the iframe. An embed can be blocked, refuse
                    to play, or simply be scrolled past, and a claim about an
                    hour of state television is only worth having if it stays
                    checkable when the player does not load. On its own line
                    rather than wrapped around the title: the title runs to
                    two lines on a phone, and a drawn underline across a
                    wrapped inline box is a mess. */}
                <ArrowLink
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 min-h-11"
                >
                  Open on YouTube
                </ArrowLink>
              </div>

              <div className="text-caption text-text-subtle flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {new Date(item.date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                {item.length && <span aria-hidden>·</span>}
                {item.length && <span>{item.length}</span>}
                <span aria-hidden>·</span>
                <span>In {item.language}</span>
              </div>
            </figcaption>
          </figure>
        ))}

        {papers.length > 0 && (
          <div data-reveal-group className="mt-10 grid gap-4 md:grid-cols-2 md:gap-5">
            {papers.map((paper) => (
              <a
                key={paper.doi}
                href={paper.doi}
                target="_blank"
                rel="noreferrer"
                data-reveal-item
                className="group border-border bg-surface flex flex-col rounded-3xl border p-6 transition-colors duration-base hover:border-[color:var(--lp-accent-line)] sm:p-7"
              >
                <div className="flex items-center gap-2.5 text-[color:var(--lp-accent)]">
                  <FileText aria-hidden strokeWidth={1.5} className="size-5" />
                  <span className="text-caption font-semibold uppercase tracking-[0.14em]">
                    Published research
                  </span>
                </div>
                <h3 className="text-heading text-text mt-4 font-semibold leading-snug text-pretty">
                  {paper.title}
                </h3>
                <p className="text-body text-text-muted mt-2.5">
                  {paper.journal}, {paper.year}
                </p>
                <div className="text-caption text-text-subtle mt-5">{paper.citation}</div>
                <span className="text-label mt-5 inline-flex items-center gap-1.5 font-semibold text-[color:var(--lp-accent)]">
                  Read the paper
                  <CtaArrowUpRight />
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Manifesto — the editorial hinge of the page. A quiet, image-free statement
 * that reframes the site: the clinic is the job, but this page is about the
 * person. Large serif, generous measure, nothing else competing for attention.
 *
 * MOTION CONTRACT (see landing.css): the `data-reveal` blocks are animated by
 * the PAGE-level GSAP, only inside the reduced-motion "no-preference" branch.
 */
export function ManifestoSection() {
  return (
    <section aria-label="A note from Arjun" className="py-[var(--section-pad)]">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p data-reveal className="lp-serif text-text text-[clamp(1.9rem,4.2vw,3.2rem)] leading-[1.15] tracking-[-0.005em] text-balance">
            The clinic is where I work.{' '}
            <span className="lp-em">This page is where I live.</span>
          </p>
          <p data-reveal className="lp-lead mt-8 max-w-[52ch]">
            I spend my days straightening teeth and my evenings on a bicycle, behind
            a camera, or in front of a room full of students. If you are here for
            the first, you are welcome. If you are here for any of the rest, you
            are even more welcome.
          </p>
        </div>
      </div>
    </section>
  )
}

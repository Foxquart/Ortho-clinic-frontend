/**
 * Footer — the quiet base of the landing page, and the page's NAP block.
 *
 * Name, address and phone in plain text, matching the Google Business Profile
 * character for character. That matching is the whole job: Google reconciles a
 * practice from agreeing name-address-phone triples across the web, and right
 * now his listings agree on neither the clinic's name nor his own. This footer
 * is the reference copy every directory entry should be corrected against —
 * which is why the address is rendered as a real `<address>` element rather
 * than as decorative text.
 *
 * Everything reads from the public clinic settings with the static values in
 * `profile.ts` as the fallback, so the footer is never blank and the address is
 * legible to a crawler that does not wait for the API.
 */
import { Link } from 'react-router-dom'
import { Monogram } from '@/features/landing/LandingNav'
import { CtaArrow, ScrollButton } from '@/features/landing/primitives'
import { CLINIC, DOCTOR, PRESENCE } from '@/features/landing/profile'

/**
 * Two halves of one footer-link recipe, kept apart on purpose.
 *
 * `LINK_ROW` is the hit area. Text links are where a footer quietly fails a
 * phone: `text-label` sets a 13px line box, which is a ~19px target inside a
 * 44px thumb. So every link gets a 44px minimum row on mobile and drops back
 * to its natural height from `md` up, where a mouse is precise and the footer
 * wants its editorial density back.
 *
 * `LINK_DRAW` is the underline, and it goes on an inner span rather than on
 * the anchor — which is the whole reason these are two constants. The rule
 * pins its rule to the bottom of its own box, so putting it on a 44px-tall
 * anchor would float the underline a dozen pixels below the words. On the span
 * it sits where an underline belongs, and `LINK_ROW`'s `group` drives it from
 * the whole anchor (see the `.group:hover` trigger in landing.css) so the
 * arrow and the padding are live too.
 */
const LINK_ROW = 'group inline-flex w-fit items-center min-h-11 md:min-h-0'
const LINK_DRAW = 'lp-link-draw'

const NAV_LINKS: { target: string; label: string }[] = [
  { target: 'record', label: 'The record' },
  { target: 'life', label: 'Life' },
  { target: 'reviews', label: 'Reviews' },
  { target: 'book', label: 'Book' },
]

export function LandingFooter() {
  /* Static, not from the CMS. A NAP block only works if it matches the Google
     Business Profile character for character, so it is version-controlled and
     reviewed rather than whatever the clinic-settings record currently says. */
  const addressLines = [CLINIC.street, `${CLINIC.city}, ${CLINIC.state} ${CLINIC.postalCode}`]

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-5 py-14 sm:px-8 md:flex-row md:items-start md:justify-between">
        {/* Wordmark + note */}
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Monogram />
            {/* Full name, matching the nav wordmark and the hero H1. This one sits
               beside the NAP block, which is exactly where a crawler reconciles the
               practice — the three statements of the entity must be identical. */}
            <span className="lp-serif text-2xl leading-none text-text">{DOCTOR.name}</span>
          </div>
          <p className="mt-4 text-body leading-relaxed text-text-muted">
            {DOCTOR.specialty} in {DOCTOR.city}. Bones, joints, and the long
            unglamorous business of getting people walking again.
          </p>
          <a
            href={PRESENCE.doordarshan}
            target="_blank"
            rel="noreferrer"
            className={`${LINK_ROW} mt-3 gap-1.5 text-label font-medium text-text-subtle transition-colors duration-fast hover:text-text`}
          >
            <span className={LINK_DRAW}>An hour on arthritis, Doordarshan Tripura</span>
            <CtaArrow className="size-3.5 shrink-0" />
          </a>
        </div>

        {/* In-page navigation */}
        <nav aria-label="Footer" className="flex flex-col items-start gap-1 md:gap-0.5">
          {NAV_LINKS.map((link) => (
            <ScrollButton
              key={link.target}
              target={link.target}
              tone="ghost"
              size="md"
              className={`${LINK_ROW} h-auto justify-start px-0 font-medium text-text-muted hover:bg-transparent hover:text-text md:py-1`}
            >
              <span className={LINK_DRAW}>{link.label}</span>
            </ScrollButton>
          ))}
        </nav>

        {/* The NAP block, and the one door back to the product */}
        <div className="flex flex-col gap-2 text-body text-text-muted">
          <span className="text-text font-medium">{CLINIC.name}</span>
          <address className="not-italic leading-relaxed">
            {addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
          {CLINIC.phone && (
            <a
              href={`tel:${CLINIC.phone.replace(/\s+/g, '')}`}
              className={`${LINK_ROW} transition-colors duration-fast hover:text-text`}
            >
              <span className={LINK_DRAW}>{CLINIC.phone}</span>
            </a>
          )}
          <span className="text-text-subtle">{CLINIC.hours}</span>
          {/* Stays quiet — this is the staff door, not a patient CTA — but it
              gets the same underline draw and the same 44px row as everything
              else. Quiet is a colour decision, not an excuse for a link you
              cannot hit. */}
          <Link
            to="/login"
            className={`${LINK_ROW} mt-1 gap-1.5 text-label font-medium text-text-subtle transition-colors duration-fast hover:text-text`}
          >
            <span className={LINK_DRAW}>Staff sign in</span>
            <CtaArrow className="size-3.5 shrink-0" />
          </Link>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <p className="mx-auto max-w-content px-5 py-5 text-caption text-text-subtle sm:px-8">
          © {DOCTOR.name}, {DOCTOR.city}. This site is not for emergencies — for
          urgent injuries, go to your nearest hospital.
        </p>
      </div>
    </footer>
  )
}

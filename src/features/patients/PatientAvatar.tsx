/**
 * A patient's avatar.
 *
 * ## Why a drawing and not a photograph
 *
 * These are real patients. Shipping their photographs would put identifiable
 * medical-context images into every list in the app, and generating faces for
 * them would be inventing people who exist. So the avatar is a flat mark, not a
 * likeness: it distinguishes rows at a glance and claims nothing about anyone.
 *
 * ## Why gender at all
 *
 * It is a recorded clinical field, not an inference. When `gender` is on the
 * record the mark reflects it; when it is absent, or is anything other than the
 * two values the API stores, the neutral mark is used. Nothing here guesses
 * from a name — a name does not tell you someone's gender, and guessing wrong
 * in a medical record is worse than not showing a mark at all.
 *
 * ## Availability
 *
 * `PatientResponse` carries `gender`; `PatientSummary` — what appointments and
 * the dashboard embed — does not (verified against the live API, which omits
 * the key entirely). So `gender` is optional here, and where it is missing the
 * mark falls back to the patient's initials.
 *
 * That fallback is deliberate rather than lazy. A neutral silhouette repeated
 * down every row of a list distinguishes nothing — it is worse than the initials
 * it would replace. Initials at least tell two patients apart. The component
 * therefore always shows the most identifying thing it honestly has, and never
 * fetches a patient record just to pick a picture.
 */
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

export type PatientGender = string | null | undefined

const SIZE = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
} as const

/** Normalises whatever the record holds to the three marks we actually draw. */
function markFor(gender: PatientGender): 'female' | 'male' | 'unknown' {
  const value = (gender ?? '').trim().toLowerCase()
  if (value === 'female' || value === 'f') return 'female'
  if (value === 'male' || value === 'm') return 'male'
  return 'unknown'
}

/**
 * Flat, two-tone, built from primitives rather than drawn freehand — a circle,
 * an arc and two rectangles. At 32px anything more detailed turns to mud, and a
 * mark that reads instantly at list density is worth more than one that looks
 * good only at 96px.
 */
function Mark({ kind }: { kind: 'female' | 'male' }) {
  return (
    <svg viewBox="0 0 40 40" className="size-full" aria-hidden focusable="false">
      {kind === 'female' ? (
        <>
          {/* Hair first and WIDE. At 32px the two marks are told apart by
              outline, not by detail — a cap that only differs at the crown is
              invisible at list size, so the difference is carried by the
              overall silhouette. */}
          <path
            d="M20 5c-6.6 0-11 4.6-11 11.4 0 3.9.7 7 1.6 9.4.4 1 .1 1.9-.6 2.4-.5.4-.4 1.2.3 1.2h4.2V17.8a11 11 0 0 0 8-3.6 12 12 0 0 0 6.2 3.6v11.6h4.2c.7 0 .8-.8.3-1.2-.7-.5-1-1.4-.6-2.4.9-2.4 1.6-5.5 1.6-9.4C34 9.6 26.6 5 20 5z"
            fill="currentColor"
            opacity="0.62"
          />
          <circle cx="20" cy="18" r="6.6" fill="currentColor" />
          <path d="M7.5 40c0-6.9 5.6-12.5 12.5-12.5S32.5 33.1 32.5 40z" fill="currentColor" opacity="0.9" />
        </>
      ) : (
        <>
          {/* A close crop that follows the skull: narrow, flat across the top,
              nothing below the ear line. Read against the female mark it is a
              visibly smaller outline. */}
          <path
            d="M12.4 17.2C12.4 11.6 15.8 8 20 8s7.6 3.6 7.6 9.2c0 .5-.6.7-.8.2-1-2.4-3.5-3.6-6.8-3.6s-5.8 1.2-6.8 3.6c-.2.5-.8.3-.8-.2z"
            fill="currentColor"
            opacity="0.62"
          />
          <circle cx="20" cy="18" r="6.6" fill="currentColor" />
          <path d="M7.5 40c0-6.9 5.6-12.5 12.5-12.5S32.5 33.1 32.5 40z" fill="currentColor" opacity="0.9" />
        </>
      )}
    </svg>
  )
}

export function PatientAvatar({
  name,
  gender,
  size = 'md',
  className,
}: {
  /** Used for the initials fallback when `gender` is absent. */
  name: string
  /** From the patient record. Omit where the payload does not carry it. */
  gender?: PatientGender
  size?: keyof typeof SIZE
  className?: string
}) {
  const kind = markFor(gender)

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full',
        /* One ground for every mark. Tinting by sex would turn a recorded
           clinical field into a colour code the reader has to learn, and
           pink/blue on a medical record is exactly the cliché to avoid. */
        'bg-accent-muted text-accent-muted-fg/70',
        SIZE[size],
        className,
      )}
    >
      {kind === 'unknown' ? (
        <span className={cn('font-semibold', size === 'sm' ? 'text-caption' : 'text-label')}>
          {initials(name)}
        </span>
      ) : (
        <Mark kind={kind} />
      )}
    </span>
  )
}

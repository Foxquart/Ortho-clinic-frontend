/**
 * Where "Book an appointment" goes, decided by the device.
 *
 * A patient on a phone wants to reach a person; a patient on a laptop is
 * happy to fill in a form. So on a handheld the CTA becomes WhatsApp (or a
 * phone call, if only a number is published) and on a laptop it stays the
 * in-page booking form.
 *
 * ## Why `(pointer: coarse)` and not a width alone
 *
 * A 900px browser window on a laptop is not a phone, and `tel:` on a machine
 * with no dialler is a dead end. The pointer query is the capability question
 * — "is this a finger?" — and the width bound keeps a coarse-pointer tablet in
 * desk mode, where the split layout already applies. The two together are the
 * closest thing to "is this a phone" that the platform actually exposes.
 *
 * ## It degrades to the form, always
 *
 * `CONTACT.whatsapp` and `CONTACT.phone` are both `null` until the practice
 * confirms a number (see `profile.ts` — a wrong number on a surgeon's site is
 * worse than none). With neither set this resolves to the booking form on
 * every device, which is the behaviour the page shipped with. Nothing here
 * invents a number.
 */
import { useEffect, useState } from 'react'
import { CONTACT } from './profile'

/** Coarse pointer AND under the `lg` breakpoint where the desk layout begins. */
const HANDHELD_QUERY = '(pointer: coarse) and (max-width: 1023.98px)'

export type BookingChannel = 'whatsapp' | 'phone' | 'form'

export interface BookingTarget {
  /** A real `href`, so long-press, middle-click and "copy link" all behave. */
  href: string
  /** True when following it leaves the page — the caller must not preventDefault. */
  external: boolean
  channel: BookingChannel
  /**
   * Appended to a control's visible label to build its accessible name, e.g.
   * "Book an appointment" + " on WhatsApp". Empty for the form, where the
   * visible label already describes what happens.
   */
  labelSuffix: string
}

const FORM_TARGET: BookingTarget = {
  href: '#book',
  external: false,
  channel: 'form',
  labelSuffix: '',
}

/** Pure resolver, so the decision can be reasoned about without a DOM. */
export function resolveBookingTarget(handheld: boolean): BookingTarget {
  if (!handheld) return FORM_TARGET

  if (CONTACT.whatsapp) {
    const text = encodeURIComponent(CONTACT.whatsappMessage)
    return {
      href: `https://wa.me/${CONTACT.whatsapp}?text=${text}`,
      external: true,
      channel: 'whatsapp',
      labelSuffix: ' on WhatsApp',
    }
  }

  if (CONTACT.phone) {
    return {
      href: `tel:${CONTACT.phone}`,
      external: true,
      channel: 'phone',
      labelSuffix: ' by phone',
    }
  }

  return FORM_TARGET
}

function isHandheld(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(HANDHELD_QUERY).matches
}

/**
 * Live booking target. Re-resolves on rotation and on window resize, so a
 * tablet turned landscape past `lg` gets the form without a reload.
 */
export function useBookingTarget(): BookingTarget {
  const [handheld, setHandheld] = useState(isHandheld)

  useEffect(() => {
    const mq = window.matchMedia(HANDHELD_QUERY)
    const sync = () => setHandheld(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return resolveBookingTarget(handheld)
}

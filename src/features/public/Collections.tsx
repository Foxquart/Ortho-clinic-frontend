import { CalendarClock } from 'lucide-react'
import { resolveApiUrl } from '@/api/http'
import type {
  DoctorProfileResponse,
  GalleryImageResponse,
  ServiceResponse,
  TestimonialResponse,
  WeeklyAvailabilityResponse,
} from '@/api/schema'
import { cn } from '@/lib/cn'
import {
  ButtonAnchor,
  ButtonLink,
  LoadingBlock,
  Panel,
  PROSE_TYPE,
  ServiceIcon,
  SiteEmpty,
  Stars,
} from './Parts'
import { text, weeklyHours } from './content'
import { BOOK_PATH } from './routes'

/* -------------------------------------------------------------------------- */
/*  Services                                                                  */
/* -------------------------------------------------------------------------- */

export function ServicesGrid({
  services,
  loading,
}: {
  services: ServiceResponse[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Panel key={index}>
            <div className="bg-border/60 mb-4 size-11 animate-pulse rounded-lg motion-reduce:animate-none" />
            <LoadingBlock lines={3} />
          </Panel>
        ))}
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <SiteEmpty
        title="No treatments are listed yet"
        description="The clinic has not published its list of services. Call or book a consultation and we will talk you through what is available."
        action={
          <ButtonLink to={BOOK_PATH} tone="secondary" size="md">
            Book a consultation
          </ButtonLink>
        }
      />
    )
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <li key={service.id}>
          <Panel className="duration-base ease-out-quint hover:border-border-strong flex h-full flex-col gap-4 transition-[box-shadow,border-color] hover:shadow-md">
            <ServiceIcon name={service.icon_name} />
            <div className="flex flex-col gap-2">
              <h3 className="text-heading text-text">{service.title}</h3>
              {text(service.description) && (
                <p className="text-body text-text-muted leading-relaxed">{service.description}</p>
              )}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Testimonials                                                              */
/* -------------------------------------------------------------------------- */

export function TestimonialGrid({
  testimonials,
  loading,
}: {
  testimonials: TestimonialResponse[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Panel key={index}>
            <LoadingBlock lines={4} />
          </Panel>
        ))}
      </div>
    )
  }

  if (testimonials.length === 0) {
    return (
      <SiteEmpty
        title="No patient stories have been published yet"
        description="We only show reviews that patients have given us permission to publish, so this page stays empty until then."
      />
    )
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {testimonials.map((testimonial) => (
        <li key={testimonial.id}>
          <figure className="border-border bg-surface flex h-full flex-col gap-4 rounded-xl border p-6 shadow-sm">
            <Stars rating={testimonial.rating} />
            <blockquote className={cn(PROSE_TYPE, 'text-text flex-1')}>
              “{testimonial.content}”
            </blockquote>
            <figcaption className="text-label text-text-muted">
              <span className="text-text font-semibold">{testimonial.author_name}</span>
              {text(testimonial.author_role) && <span> · {testimonial.author_role}</span>}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Gallery                                                                   */
/* -------------------------------------------------------------------------- */

export function GalleryGrid({
  images,
  loading,
}: {
  images: GalleryImageResponse[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="bg-border/60 aspect-[4/3] animate-pulse rounded-xl motion-reduce:animate-none"
          />
        ))}
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <SiteEmpty
        title="No photographs have been published yet"
        description="Rather than fill this page with stock photography, we leave it empty until the clinic adds its own pictures."
        action={
          <ButtonLink to={BOOK_PATH} tone="secondary" size="md">
            Book a visit instead
          </ButtonLink>
        }
      />
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image) => {
        const caption = text(image.caption)
        const alt = text(image.alt_text) ?? caption ?? ''
        return (
          <li key={image.id}>
            <figure className="border-border bg-surface overflow-hidden rounded-xl border shadow-sm">
              <img
                src={resolveApiUrl(image.image_url)}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="bg-bg-sunken aspect-[4/3] w-full object-cover"
              />
              {caption && (
                <figcaption className="border-border text-caption text-text-muted border-t px-4 py-3">
                  {caption}
                </figcaption>
              )}
            </figure>
          </li>
        )
      })}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Weekly hours                                                              */
/* -------------------------------------------------------------------------- */

export function HoursList({
  availability,
  loading,
  className,
}: {
  availability: WeeklyAvailabilityResponse[]
  loading?: boolean
  className?: string
}) {
  if (loading) return <LoadingBlock lines={7} className={className} />

  if (availability.length === 0) {
    return (
      <p className={cn('text-body text-text-muted', className)}>
        Consulting hours have not been published yet. Please call the clinic to arrange a time.
      </p>
    )
  }

  const rows = weeklyHours(availability)

  return (
    <dl className={cn('flex flex-col', className)}>
      {rows.map((row) => (
        <div
          key={row.day}
          className="border-border flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0"
        >
          <dt className="text-body text-text font-medium">{row.label}</dt>
          <dd
            className={cn(
              'text-body text-right',
              row.blocks.length > 0 ? 'text-text-muted' : 'text-text-subtle',
            )}
          >
            {row.blocks.length > 0 ? row.blocks.join(', ') : 'Closed'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* -------------------------------------------------------------------------- */
/*  Doctor credentials                                                        */
/* -------------------------------------------------------------------------- */

export function DoctorCredentials({
  doctor,
  className,
}: {
  doctor: DoctorProfileResponse
  className?: string
}) {
  const rows: { label: string; value: string }[] = []
  if (text(doctor.specialization))
    rows.push({ label: 'Specialisation', value: doctor.specialization as string })
  if (text(doctor.qualifications))
    rows.push({ label: 'Qualifications', value: doctor.qualifications as string })
  if (typeof doctor.experience_years === 'number')
    rows.push({
      label: 'Experience',
      value: `${doctor.experience_years} ${doctor.experience_years === 1 ? 'year' : 'years'}`,
    })
  if (text(doctor.registration_number))
    rows.push({ label: 'Registration', value: doctor.registration_number as string })

  if (rows.length === 0) return null

  return (
    <dl className={cn('flex flex-col', className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="border-border flex flex-col gap-0.5 border-b py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-6"
        >
          <dt className="text-label text-text-muted sm:w-36 sm:shrink-0">{row.label}</dt>
          <dd className="text-body text-text">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* -------------------------------------------------------------------------- */
/*  Booking call to action                                                    */
/* -------------------------------------------------------------------------- */

export function BookingCta({
  phone,
  doctorName,
}: {
  phone: string | null
  doctorName: string | null
}) {
  return (
    <div className="border-border bg-accent-muted flex flex-col items-start gap-5 rounded-xl border p-8 sm:p-10">
      <span
        aria-hidden
        className="bg-accent text-accent-fg grid size-11 place-items-center rounded-lg [&_svg]:size-5.5"
      >
        <CalendarClock />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-text text-[clamp(1.375rem,3.2vw,1.875rem)] leading-[1.15] font-semibold tracking-tight">
          Ready to book?
        </h2>
        <p className="text-body text-text-muted max-w-prose leading-relaxed">
          Choose a date, pick a free time{doctorName ? ` with ${doctorName}` : ''}, and leave your
          name and phone number. No account, no payment online.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink to={BOOK_PATH} tone="primary" size="lg">
          Book an appointment
        </ButtonLink>
        {phone && (
          <ButtonAnchor href={`tel:${phone.replace(/\s+/g, '')}`} tone="secondary" size="lg">
            Call {phone}
          </ButtonAnchor>
        )}
      </div>
    </div>
  )
}

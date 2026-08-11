import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  ButtonAnchor,
  Container,
  LoadingBlock,
  PageIntro,
  Panel,
  Prose,
  Section,
  SiteEmpty,
} from './Parts'
import { BookingCta, HoursList } from './Collections'
import { pageSections, readableWorkingHours, text } from './content'
import {
  usePublicAvailability,
  usePublicClinic,
  usePublicDoctor,
  usePublicPage,
} from './usePublicData'
import { siteTitle, usePageTitle } from './usePageTitle'

export function ContactPage() {
  const clinicQuery = usePublicClinic()
  const doctorQuery = usePublicDoctor()
  const availabilityQuery = usePublicAvailability()
  const pageQuery = usePublicPage('contact')

  const clinic = clinicQuery.data
  const page = pageQuery.data

  const title = text(page?.title) ?? 'Contact'
  usePageTitle(siteTitle(title, clinic?.clinic_name))

  const sections = pageSections(page).filter((section) => section.body)
  const addressLines = [
    text(clinic?.address),
    text(clinic?.city),
    text(clinic?.postal_code),
  ].filter((line): line is string => Boolean(line))
  const phone = text(clinic?.phone)
  const altPhone = text(clinic?.alternate_phone)
  const email = text(clinic?.email)
  const website = text(clinic?.website_url)
  const maps = text(clinic?.google_maps_url)
  const extraHours = readableWorkingHours(clinic?.working_hours ?? null)

  const hasAnyContact =
    addressLines.length > 0 || Boolean(phone) || Boolean(altPhone) || Boolean(email)

  return (
    <>
      <Container className="py-12 sm:py-16">
        <PageIntro
          eyebrow={text(clinic?.clinic_name)}
          title={title}
          subtitle={text(page?.subtitle)}
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-8">
            {clinicQuery.isPending && !clinic ? (
              <Panel>
                <LoadingBlock lines={5} />
              </Panel>
            ) : hasAnyContact ? (
              <Panel className="flex flex-col gap-6">
                <h2 className="text-heading text-text">Where to find us</h2>

                {addressLines.length > 0 && (
                  <ContactRow icon={<MapPin />} label="Address">
                    <address className="text-body text-text leading-relaxed not-italic">
                      {addressLines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </address>
                    {maps && (
                      <a
                        href={maps}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-label text-accent mt-2 inline-flex items-center gap-1.5 rounded-sm font-medium underline-offset-4 hover:underline"
                      >
                        Open in maps
                        <ExternalLink aria-hidden className="size-3.5" />
                      </a>
                    )}
                  </ContactRow>
                )}

                {(phone || altPhone) && (
                  <ContactRow icon={<Phone />} label="Phone">
                    <div className="flex flex-col gap-1">
                      {[phone, altPhone]
                        .filter((value): value is string => Boolean(value))
                        .map((value) => (
                          <a
                            key={value}
                            href={`tel:${value.replace(/\s+/g, '')}`}
                            className="text-body text-text hover:text-accent rounded-sm underline-offset-4 hover:underline"
                          >
                            {value}
                          </a>
                        ))}
                    </div>
                  </ContactRow>
                )}

                {email && (
                  <ContactRow icon={<Mail />} label="Email">
                    <a
                      href={`mailto:${email}`}
                      className="text-body text-text hover:text-accent rounded-sm break-all underline-offset-4 hover:underline"
                    >
                      {email}
                    </a>
                  </ContactRow>
                )}

                {website && (
                  <ContactRow icon={<ExternalLink />} label="Website">
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-body text-text hover:text-accent rounded-sm break-all underline-offset-4 hover:underline"
                    >
                      {website.replace(/^https?:\/\//, '')}
                    </a>
                  </ContactRow>
                )}
              </Panel>
            ) : (
              <SiteEmpty
                title="Contact details have not been published yet"
                description="You can still request an appointment online and the clinic will call you back."
              />
            )}

            {sections.length > 0 && (
              <div className="flex flex-col gap-8">
                {sections.map((section, index) => (
                  <div key={index} className="flex flex-col gap-3">
                    {section.heading && (
                      <h2 className="text-heading text-text">{section.heading}</h2>
                    )}
                    {section.body && <Prose body={section.body} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            <Panel className="flex flex-col gap-4">
              <h2 className="text-heading text-text">Consulting hours</h2>
              <HoursList
                availability={availabilityQuery.data ?? []}
                loading={availabilityQuery.isPending}
              />
              <p className="text-caption text-text-subtle">
                These are the hours the doctor takes appointments. Bookable times are shown when you
                pick a date.
              </p>
            </Panel>

            {extraHours.length > 0 && (
              <Panel className="flex flex-col gap-3">
                <h2 className="text-heading text-text">Clinic hours</h2>
                <dl className="flex flex-col">
                  {extraHours.map((row) => (
                    <div
                      key={row.label}
                      className="border-border flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0"
                    >
                      <dt className="text-body text-text font-medium">{row.label}</dt>
                      <dd className="text-body text-text-muted text-right">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}

            {phone && (
              <ButtonAnchor
                href={`tel:${phone.replace(/\s+/g, '')}`}
                tone="secondary"
                size="lg"
                className="w-full"
              >
                Call {phone}
              </ButtonAnchor>
            )}
          </aside>
        </div>
      </Container>

      <Section tone="sunken">
        <BookingCta phone={phone} doctorName={doctorQuery.data?.full_name ?? null} />
      </Section>
    </>
  )
}

function ContactRow({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span
        aria-hidden
        className="bg-surface-hover text-text-subtle mt-0.5 grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-label text-text-muted">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}

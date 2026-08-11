import { resolveApiUrl } from '@/api/http'
import { initials } from '@/lib/format'
import { BookingCta, DoctorCredentials, HoursList } from './Collections'
import { Container, LoadingBlock, PageIntro, Panel, Prose, Section, SiteEmpty } from './Parts'
import { pageSections, text } from './content'
import {
  usePublicAvailability,
  usePublicClinic,
  usePublicDoctor,
  usePublicPage,
} from './usePublicData'
import { siteTitle, usePageTitle } from './usePageTitle'

export function AboutPage() {
  const clinicQuery = usePublicClinic()
  const doctorQuery = usePublicDoctor()
  const availabilityQuery = usePublicAvailability()
  const pageQuery = usePublicPage('about')

  const clinic = clinicQuery.data
  const doctor = doctorQuery.data
  const page = pageQuery.data

  const title = text(page?.title) ?? 'About the doctor'
  usePageTitle(siteTitle(title, clinic?.clinic_name))

  // A heading with no body is not content — the CMS ships placeholder bodies
  // and rendering the orphan headings looks like a broken page.
  const sections = pageSections(page).filter((section) => section.body)
  const bio = text(doctor?.bio)
  const photo = text(doctor?.photo_url)

  return (
    <>
      <Container className="py-12 sm:py-16">
        <PageIntro
          eyebrow={text(clinic?.clinic_name)}
          title={title}
          subtitle={text(page?.subtitle)}
        />

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-8">
            {doctorQuery.isPending && !doctor ? (
              <LoadingBlock lines={6} />
            ) : doctor ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  {photo ? (
                    <img
                      src={resolveApiUrl(photo)}
                      alt={doctor.full_name}
                      loading="lazy"
                      decoding="async"
                      className="border-border size-16 shrink-0 rounded-full border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="bg-accent-muted text-heading text-accent grid size-16 shrink-0 place-items-center rounded-full font-semibold"
                    >
                      {initials(
                        doctor.full_name.replace(
                          /^\s*(dr|doctor|prof|professor|mr|mrs|ms)\.?\s+/i,
                          '',
                        ),
                      )}
                    </span>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-heading text-text">{doctor.full_name}</h2>
                    {text(doctor.specialization) && (
                      <p className="text-body text-text-muted">{doctor.specialization}</p>
                    )}
                  </div>
                </div>

                {bio ? (
                  <Prose body={bio} />
                ) : (
                  <p className="text-body text-text-muted">
                    A profile has not been written yet. The credentials on this page come straight
                    from the clinic's records.
                  </p>
                )}
              </div>
            ) : null}

            {sections.length > 0 && (
              <div className="border-border flex flex-col gap-8 border-t pt-8">
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

            {!doctorQuery.isPending && !doctor && pageQuery.isError && (
              <SiteEmpty
                title="This page has not been published yet"
                description="The clinic has not added a profile for the doctor. You can still book an appointment or call the clinic."
              />
            )}
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
            {doctor && (
              <Panel className="flex flex-col gap-2">
                <h2 className="text-heading text-text">Credentials</h2>
                <DoctorCredentials doctor={doctor} />
              </Panel>
            )}
            <Panel className="flex flex-col gap-4">
              <h2 className="text-heading text-text">Consulting hours</h2>
              <HoursList
                availability={availabilityQuery.data ?? []}
                loading={availabilityQuery.isPending}
              />
            </Panel>
          </aside>
        </div>
      </Container>

      <Section tone="sunken">
        <BookingCta phone={text(clinic?.phone)} doctorName={doctor?.full_name ?? null} />
      </Section>
    </>
  )
}

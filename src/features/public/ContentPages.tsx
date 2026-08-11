/**
 * The three collection pages — services, gallery, patient stories. They share
 * one shape: a CMS-driven intro, the collection itself (or an honest empty
 * state), and a route back into booking.
 */
import { Container, PageIntro, Prose, Section } from './Parts'
import { BookingCta, GalleryGrid, ServicesGrid, TestimonialGrid } from './Collections'
import { pageSections, sortedGallery, sortedServices, sortedTestimonials, text } from './content'
import {
  usePublicClinic,
  usePublicDoctor,
  usePublicPage,
  usePublicPortfolio,
} from './usePublicData'
import { siteTitle, usePageTitle } from './usePageTitle'

function CmsSections({ slug }: { slug: string }) {
  const pageQuery = usePublicPage(slug)
  const sections = pageSections(pageQuery.data).filter((section) => section.body)
  if (sections.length === 0) return null

  return (
    <div className="mt-8 flex max-w-prose flex-col gap-8">
      {sections.map((section, index) => (
        <div key={index} className="flex flex-col gap-3">
          {section.heading && <h2 className="text-heading text-text">{section.heading}</h2>}
          {section.body && <Prose body={section.body} />}
        </div>
      ))}
    </div>
  )
}

function useCollectionPage(slug: string, fallbackTitle: string) {
  const clinicQuery = usePublicClinic()
  const pageQuery = usePublicPage(slug)
  const title = text(pageQuery.data?.title) ?? fallbackTitle
  usePageTitle(siteTitle(title, clinicQuery.data?.clinic_name))
  return { clinic: clinicQuery.data, title, subtitle: text(pageQuery.data?.subtitle) }
}

/* -------------------------------------------------------------------------- */

export function ServicesPage() {
  const portfolioQuery = usePublicPortfolio()
  const doctorQuery = usePublicDoctor()
  const { clinic, title, subtitle } = useCollectionPage('services', 'Services')
  const services = sortedServices(portfolioQuery.data?.services)

  return (
    <>
      <Container className="py-12 sm:py-16">
        <PageIntro eyebrow="Treatments" title={title} subtitle={subtitle} />
        <CmsSections slug="services" />
        <div className="mt-10">
          <ServicesGrid services={services} loading={portfolioQuery.isPending} />
        </div>
      </Container>

      <Section tone="sunken">
        <BookingCta phone={text(clinic?.phone)} doctorName={doctorQuery.data?.full_name ?? null} />
      </Section>
    </>
  )
}

/* -------------------------------------------------------------------------- */

export function GalleryPage() {
  const portfolioQuery = usePublicPortfolio()
  const doctorQuery = usePublicDoctor()
  const { clinic, title, subtitle } = useCollectionPage('gallery', 'Gallery')
  const images = sortedGallery(portfolioQuery.data?.gallery)

  return (
    <>
      <Container className="py-12 sm:py-16">
        <PageIntro eyebrow="Inside the clinic" title={title} subtitle={subtitle} />
        <CmsSections slug="gallery" />
        <div className="mt-10">
          <GalleryGrid images={images} loading={portfolioQuery.isPending} />
        </div>
      </Container>

      <Section tone="sunken">
        <BookingCta phone={text(clinic?.phone)} doctorName={doctorQuery.data?.full_name ?? null} />
      </Section>
    </>
  )
}

/* -------------------------------------------------------------------------- */

export function TestimonialsPage() {
  const portfolioQuery = usePublicPortfolio()
  const doctorQuery = usePublicDoctor()
  const { clinic, title, subtitle } = useCollectionPage('testimonials', 'Patient stories')
  const testimonials = sortedTestimonials(portfolioQuery.data?.testimonials)

  return (
    <>
      <Container className="py-12 sm:py-16">
        <PageIntro eyebrow="Patient stories" title={title} subtitle={subtitle} />
        <CmsSections slug="testimonials" />
        <div className="mt-10">
          <TestimonialGrid testimonials={testimonials} loading={portfolioQuery.isPending} />
        </div>
      </Container>

      <Section tone="sunken">
        <BookingCta phone={text(clinic?.phone)} doctorName={doctorQuery.data?.full_name ?? null} />
      </Section>
    </>
  )
}

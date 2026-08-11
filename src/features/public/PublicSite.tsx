import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ButtonLink, Container, PageIntro } from './Parts'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { BOOK_PATH, SITE_ROOT } from './routes'
import { usePublicClinic, usePublicDoctor } from './usePublicData'
import { siteTitle, usePageTitle } from './usePageTitle'
import { HomePage } from './HomePage'
import { AboutPage } from './AboutPage'
import { GalleryPage, ServicesPage, TestimonialsPage } from './ContentPages'
import { ContactPage } from './ContactPage'
import { BookPage } from './BookPage'

/**
 * The public, unauthenticated patient site. Mounted at `/site/*` outside the
 * authenticated shell: it has no sidebar, no command palette and no session
 * requirement, so it owns its own chrome and its own routing.
 */
export function PublicSite() {
  const clinicQuery = usePublicClinic()
  const doctorQuery = usePublicDoctor()

  return (
    <div className="bg-bg flex min-h-dvh flex-col">
      <a
        href="#site-main"
        className="focus:bg-accent focus:text-label focus:text-accent-fg sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[var(--z-toast)] focus:rounded-md focus:px-4 focus:py-2 focus:font-medium"
      >
        Skip to content
      </a>

      <SiteHeader clinic={clinicQuery.data} />

      <ScrollToTop />

      <main id="site-main" className="flex-1">
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="testimonials" element={<TestimonialsPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="book" element={<BookPage />} />
          <Route path="*" element={<SiteNotFound />} />
        </Routes>
      </main>

      <SiteFooter clinic={clinicQuery.data} doctor={doctorQuery.data} />
    </div>
  )
}

/**
 * A marketing site is read top-down. Landing halfway down a new page because
 * the previous one was scrolled is disorienting, so every navigation starts at
 * the top — except a back/forward move, which the browser restores itself.
 */
function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

function SiteNotFound() {
  const clinicQuery = usePublicClinic()
  usePageTitle(siteTitle('Page not found', clinicQuery.data?.clinic_name))

  return (
    <Container className="py-20 sm:py-28">
      <PageIntro
        eyebrow="404"
        title="We could not find that page"
        subtitle="The link may be out of date. Everything on the site is reachable from the menu above."
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink to={SITE_ROOT} tone="primary" size="lg">
            Go to the home page
          </ButtonLink>
          <ButtonLink to={BOOK_PATH} tone="secondary" size="lg">
            Book an appointment
          </ButtonLink>
        </div>
      </PageIntro>
    </Container>
  )
}

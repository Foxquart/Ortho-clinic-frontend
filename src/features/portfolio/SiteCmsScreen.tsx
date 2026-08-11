import { useSearchParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Controls'
import { PagesPanel } from './PagesPanel'
import { ServicesPanel } from './ServicesPanel'
import { TestimonialsPanel } from './TestimonialsPanel'
import { GalleryPanel } from './GalleryPanel'

const TABS = ['pages', 'services', 'testimonials', 'gallery'] as const
type Tab = (typeof TABS)[number]

export function SiteCmsScreen() {
  const { can } = useAuth()
  const canWrite = can('portfolio.manage')
  const [params, setParams] = useSearchParams()

  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'pages'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <p className="max-w-prose text-body text-text-muted">
          Everything on this page is published to the patient-facing website. Changes are live as
          soon as they save.
        </p>
        <Button variant="secondary" asChild iconRight={<ExternalLink className="size-4" />}>
          <a href="/site" target="_blank" rel="noreferrer">
            Open the site
          </a>
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const search = new URLSearchParams(params)
          search.set('tab', next)
          setParams(search, { replace: true })
        }}
      >
        <TabsList>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
        </TabsList>

        {/* Each panel owns its own query, so switching tabs does not refetch the
            others and the mounted tab is the only one doing work. */}
        <TabsContent value="pages" className="pt-4">
          <PagesPanel canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="services" className="pt-4">
          <ServicesPanel canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="testimonials" className="pt-4">
          <TestimonialsPanel canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="gallery" className="pt-4">
          <GalleryPanel canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

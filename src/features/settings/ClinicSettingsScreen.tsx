import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { formatAgo } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { Card, CardBody, CardHeader } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import {
  ClinicAddressSection,
  ClinicContactSection,
  ClinicIdentitySection,
} from './ClinicDetailsSections'
import { DoctorProfileSection } from './DoctorProfileSection'
import { PrintTemplatesSection } from './PrintTemplatesSection'
import type { ClinicSettingsResponse, DoctorProfileResponse } from '@/api/schema'

function SectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader title={<Skeleton className="h-4 w-32" />} />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows * 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8.5 w-full" />
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

export function ClinicSettingsScreen() {
  const { can } = useAuth()
  const canWrite = can('clinic.write')

  const settings = useQuery({
    queryKey: qk.clinic.settings(),
    queryFn: () => apiGet<ClinicSettingsResponse>(endpoints.clinic.settings),
  })

  const profile = useQuery({
    queryKey: qk.clinic.doctorProfile(),
    queryFn: () => apiGet<DoctorProfileResponse>(endpoints.clinic.doctorProfile),
  })

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {settings.isError && (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      )}

      {settings.isPending ? (
        <>
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={1} />
        </>
      ) : settings.data ? (
        <>
          <ClinicIdentitySection settings={settings.data} canWrite={canWrite} />
          <ClinicContactSection settings={settings.data} canWrite={canWrite} />
          <ClinicAddressSection settings={settings.data} canWrite={canWrite} />
          <p className="-mt-3 text-caption text-text-subtle">
            Clinic details last changed {formatAgo(settings.data.updated_at)}.
          </p>
        </>
      ) : null}

      {profile.isError && (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      )}
      {profile.isPending ? (
        <SectionSkeleton rows={2} />
      ) : profile.data ? (
        <DoctorProfileSection profile={profile.data} canWrite={canWrite} />
      ) : null}

      <PrintTemplatesSection canWrite={canWrite} />
    </div>
  )
}

import { Card, CardHeader } from '@/components/ui/Surface'
import { ErrorState, SkeletonRows } from '@/components/ui/Feedback'

/** The shared frame every CMS collection sits in: header, states, list. */
export function PanelShell({
  title,
  description,
  action,
  isPending,
  error,
  onRetry,
  isEmpty,
  empty,
  children,
}: {
  title: React.ReactNode
  description: React.ReactNode
  action?: React.ReactNode
  isPending: boolean
  error: unknown
  onRetry: () => void
  isEmpty: boolean
  empty: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={description} action={action} />
      {isPending ? (
        <SkeletonRows rows={4} className="p-2" />
      ) : error ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : isEmpty ? (
        empty
      ) : (
        children
      )}
    </Card>
  )
}

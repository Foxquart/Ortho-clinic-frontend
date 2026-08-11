import { Link, useRouteError } from 'react-router-dom'
import { Compass, RotateCcw } from 'lucide-react'
import { toApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'

export function RouteError() {
  const error = useRouteError()
  const e = toApiError(error)

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-md text-center">
        <EmptyState
          icon={<RotateCcw />}
          title="This screen failed to load"
          description={e.message}
          action={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button variant="primary" asChild>
                <Link to="/">Back to the pad</Link>
              </Button>
            </div>
          }
        />
        {e.correlationId && (
          <p className="mt-2 font-mono text-[11px] text-text-subtle">ref {e.correlationId}</p>
        )}
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <EmptyState
        icon={<Compass />}
        title="Nothing here"
        description="That address does not match any screen in the app."
        action={
          <Button variant="primary" asChild>
            <Link to="/">Back to the pad</Link>
          </Button>
        }
      />
    </div>
  )
}

import { DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/lib/format'
import type { AuditLogResponse } from '@/api/schema'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-caption text-text">{value}</dd>
    </div>
  )
}

/** The whole record, verbatim. Nothing here is rewritten for readability. */
export function AuditDetailSheet({
  entry,
  actor,
  open,
  onOpenChange,
}: {
  entry: AuditLogResponse
  actor: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        width="max-w-xl"
        title="Audit entry"
        description={formatDateTime(entry.created_at)}
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        }
      >
        <dl className="flex flex-col">
          <Row
            label="Timestamp"
            value={
              <span className="font-mono">
                {formatDateTime(entry.created_at)}{' '}
                <span className="text-text-subtle">({entry.created_at})</span>
              </span>
            }
          />
          <Row label="Action" value={<span className="font-mono">{entry.action}</span>} />
          <Row
            label="Actor"
            value={
              entry.user_id ? (
                <>
                  {actor ?? 'Unknown user'}{' '}
                  <span className="font-mono text-text-subtle">{entry.user_id}</span>
                </>
              ) : (
                <span className="text-text-subtle">No user (system)</span>
              )
            }
          />
          <Row label="Entity type" value={<span className="font-mono">{entry.entity_type}</span>} />
          <Row
            label="Entity id"
            value={
              entry.entity_id ? (
                <span className="font-mono">{entry.entity_id}</span>
              ) : (
                <span className="text-text-subtle">—</span>
              )
            }
          />
          <Row
            label="Summary"
            value={entry.summary ?? <span className="text-text-subtle">—</span>}
          />
          <Row
            label="IP address"
            value={
              entry.ip_address ? (
                <span className="font-mono">{entry.ip_address}</span>
              ) : (
                <span className="text-text-subtle">—</span>
              )
            }
          />
          <Row
            label="User agent"
            value={
              entry.user_agent ? (
                <span className="font-mono">{entry.user_agent}</span>
              ) : (
                <span className="text-text-subtle">—</span>
              )
            }
          />
          <Row label="Entry id" value={<span className="font-mono">{entry.id}</span>} />
        </dl>

        <p className="mb-2 mt-5 text-micro uppercase text-text-subtle">Changes</p>
        {entry.changes ? (
          <pre className="scrollbar-subtle max-h-96 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-caption leading-relaxed text-text">
            {JSON.stringify(entry.changes, null, 2)}
          </pre>
        ) : (
          <p className="rounded-lg border border-border bg-bg p-3 text-caption text-text-subtle">
            This entry recorded no field-level changes.
          </p>
        )}
      </SheetContent>
    </DialogRoot>
  )
}

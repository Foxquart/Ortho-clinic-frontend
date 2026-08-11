import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileCode, MoreHorizontal, Plus } from 'lucide-react'
import { apiGet, apiPatch } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { errorMessage } from '@/api/errors'
import { qk } from '@/lib/query'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Surface'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { TemplateEditorSheet } from './TemplateEditorSheet'
import type { PrescriptionTemplateResponse, PrescriptionTemplateUpdate } from '@/api/schema'

function htmlSummary(html: string | null): string {
  if (!html || html.trim() === '') return 'empty'
  const lines = html.trim().split('\n').length
  return `${lines} line${lines === 1 ? '' : 's'}`
}

export function PrintTemplatesSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PrescriptionTemplateResponse | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const templates = useQuery({
    queryKey: qk.clinic.templates(),
    queryFn: () => apiGet<PrescriptionTemplateResponse[]>(endpoints.clinic.templates),
  })

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PrescriptionTemplateUpdate }) =>
      apiPatch<PrescriptionTemplateResponse>(endpoints.clinic.templateById(id), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.clinic.templates() })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const openCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }
  const openEdit = (template: PrescriptionTemplateResponse) => {
    setEditing(template)
    setSheetOpen(true)
  }

  const rows = templates.data ?? []

  return (
    <>
      <Card>
        <CardHeader
          title="Print templates"
          description="The header and footer HTML wrapped around every printed prescription."
          action={
            canWrite && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Plus aria-hidden className="size-4" />}
                onClick={openCreate}
              >
                New template
              </Button>
            )
          }
        />

        {templates.isPending ? (
          <div className="flex flex-col gap-px p-2">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex h-12 items-center gap-3 px-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : templates.isError ? (
          <div className="p-4">
            <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileCode />}
            title="No print templates yet"
            description="A template holds the letterhead and footer HTML that frames every printed prescription — clinic name, registration number, the strip patients keep."
            action={
              canWrite && (
                <Button variant="primary" size="sm" onClick={openCreate}>
                  Create the first template
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-body text-text">
                    <span className="truncate font-medium">{t.name}</span>
                    {t.is_default && <Badge tone="accent">Default</Badge>}
                    {!t.is_active && <Badge tone="neutral">Retired</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-text-muted">
                    {t.description || 'No description'}
                  </p>
                </div>

                <p className="hidden shrink-0 font-mono text-caption text-text-subtle sm:block">
                  header {htmlSummary(t.header_html)} · footer {htmlSummary(t.footer_html)}
                </p>

                {canWrite && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}>
                        <MoreHorizontal aria-hidden className="size-4" />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => openEdit(t)}>Edit HTML…</MenuItem>
                      <MenuItem
                        disabled={t.is_default || !t.is_active}
                        onSelect={() =>
                          patch.mutate(
                            { id: t.id, body: { is_default: true } },
                            { onSuccess: () => toast.success(`“${t.name}” is now the default`) },
                          )
                        }
                      >
                        Make default
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        disabled={t.is_default && t.is_active}
                        onSelect={() =>
                          patch.mutate(
                            { id: t.id, body: { is_active: !t.is_active } },
                            {
                              onSuccess: () =>
                                toast.success(
                                  t.is_active
                                    ? `“${t.name}” retired`
                                    : `“${t.name}” available again`,
                                ),
                            },
                          )
                        }
                      >
                        {t.is_active ? 'Retire template' : 'Make available'}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canWrite && (
        <TemplateEditorSheet open={sheetOpen} onOpenChange={setSheetOpen} template={editing} />
      )}
    </>
  )
}

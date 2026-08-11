import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import type { DayOfWeek, WeeklyAvailabilityResponse } from '@/api/schema'
import { DAYS_OF_WEEK } from '@/api/schema'
import { toApiError } from '@/api/errors'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Select, Switch } from '@/components/ui/Controls'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'
import {
  useCreateAvailability,
  useDeleteAvailability,
  useUpdateAvailability,
  useWeeklyAvailability,
} from './queries'
import { DAY_LABEL } from './model'

const schema = z
  .object({
    day_of_week: z.enum(DAYS_OF_WEEK),
    start_time: z.string().min(1, 'Set a start time'),
    end_time: z.string().min(1, 'Set an end time'),
  })
  .refine((v) => v.end_time > v.start_time, {
    path: ['end_time'],
    message: 'The end must be after the start',
  })
  // Consultations are half-hour slots, so anything shorter books nothing.
  .refine((v) => minutes(v.end_time) - minutes(v.start_time) >= 30, {
    path: ['end_time'],
    message: 'A block needs to be at least 30 minutes to hold a slot',
  })

function minutes(value: string): number {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

type FormValues = z.infer<typeof schema>

const DAY_OPTIONS = DAYS_OF_WEEK.map((day) => ({ value: day, label: DAY_LABEL[day] }))

export interface AvailabilitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canManage: boolean
}

/**
 * Clinic hours are configuration, not the daily job, so they live behind a
 * sheet the day view is still visible under.
 *
 * Note the gate: appointment writes need doctor-or-admin, but these four
 * availability routes are admin-only server-side, so `canManage` is the
 * narrower of the two. Showing a doctor an "Add hours" button that 403s would
 * be worse than not showing it.
 */
export function AvailabilitySheet({ open, onOpenChange, canManage }: AvailabilitySheetProps) {
  const availability = useWeeklyAvailability()
  const create = useCreateAvailability()
  const update = useUpdateAvailability()
  const remove = useDeleteAvailability()
  const [pendingDelete, setPendingDelete] = useState<WeeklyAvailabilityResponse | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { day_of_week: 'monday', start_time: '09:00', end_time: '13:00' },
  })

  const selectedDay = watch('day_of_week')

  const blocks = availability.data ?? []
  const byDay = new Map<DayOfWeek, WeeklyAvailabilityResponse[]>()
  for (const block of blocks) {
    const list = byDay.get(block.day_of_week)
    if (list) list.push(block)
    else byDay.set(block.day_of_week, [block])
  }

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        day_of_week: values.day_of_week,
        start_time: values.start_time,
        end_time: values.end_time,
      },
      {
        onSuccess: () => {
          toast.success(`Added ${DAY_LABEL[values.day_of_week]} hours`)
          reset({ ...values })
        },
        onError: (error) => {
          const e = toApiError(error)
          if (e.isConflict) {
            setError('start_time', {
              message: 'This exact block already exists for that day.',
            })
            return
          }
          if (e.isValidation) {
            const fields = e.fieldErrors()
            for (const [path, message] of Object.entries(fields)) {
              if (path === 'day_of_week' || path === 'start_time' || path === 'end_time') {
                setError(path, { message })
              }
            }
            return
          }
          toast.error(e.message)
        },
      },
    )
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Clinic hours"
        description="Weekly blocks the booking slots are generated from, in half-hour steps."
        width="max-w-lg"
        footer={
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {availability.isError ? (
            <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
          ) : availability.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {DAYS_OF_WEEK.map((day) => {
                const dayBlocks = (byDay.get(day) ?? []).sort((a, b) =>
                  a.start_time.localeCompare(b.start_time),
                )
                return (
                  <li key={day} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-label font-medium text-text">{DAY_LABEL[day]}</h3>
                      {dayBlocks.length === 0 && (
                        <span className="text-caption text-text-subtle">Closed</span>
                      )}
                    </div>

                    {dayBlocks.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {dayBlocks.map((block) => (
                          <li
                            key={block.id}
                            className={cn(
                              'flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2',
                              !block.is_active && 'opacity-60',
                            )}
                          >
                            <span className="flex-1 text-body text-text" data-numeric>
                              {formatTime(block.start_time)} – {formatTime(block.end_time)}
                            </span>

                            {canManage ? (
                              <>
                                <Switch
                                  id={`active-${block.id}`}
                                  checked={block.is_active}
                                  onCheckedChange={(checked) =>
                                    update.mutate(
                                      { id: block.id, body: { is_active: checked } },
                                      {
                                        onError: (error) =>
                                          toast.error(toApiError(error).message),
                                      },
                                    )
                                  }
                                />
                                <label
                                  htmlFor={`active-${block.id}`}
                                  className="sr-only"
                                >{`${block.is_active ? 'Disable' : 'Enable'} ${DAY_LABEL[day]} ${formatTime(block.start_time)} block`}</label>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Delete ${DAY_LABEL[day]} ${formatTime(
                                    block.start_time,
                                  )} to ${formatTime(block.end_time)}`}
                                  onClick={() => setPendingDelete(block)}
                                >
                                  <Trash2 aria-hidden className="size-4" />
                                </Button>
                              </>
                            ) : (
                              !block.is_active && (
                                <span className="text-caption text-text-subtle">Off</span>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canManage ? (
            <form
              noValidate
              onSubmit={onSubmit}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <h3 className="text-label font-medium text-text">Add a block</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Day" error={errors.day_of_week?.message}>
                  {(a) => (
                    <Select
                      id={a.id}
                      aria-describedby={a['aria-describedby']}
                      value={selectedDay}
                      onChange={(value) =>
                        setValue('day_of_week', value, { shouldValidate: true })
                      }
                      options={DAY_OPTIONS}
                    />
                  )}
                </Field>
                <Field label="From" error={errors.start_time?.message}>
                  {(a) => <Input {...a} {...register('start_time')} type="time" step={1800} />}
                </Field>
                <Field label="To" error={errors.end_time?.message}>
                  {(a) => <Input {...a} {...register('end_time')} type="time" step={1800} />}
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={create.isPending}
                  iconLeft={<Plus className="size-4" />}
                >
                  Add block
                </Button>
              </div>
            </form>
          ) : (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-caption text-text-muted">
              Clinic hours are managed by an administrator.
            </p>
          )}
        </div>
      </SheetContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        destructive
        loading={remove.isPending}
        title={
          pendingDelete
            ? `Delete ${DAY_LABEL[pendingDelete.day_of_week]} ${formatTime(
                pendingDelete.start_time,
              )}–${formatTime(pendingDelete.end_time)}?`
            : 'Delete block'
        }
        body="Existing appointments keep their times; only future slots stop being offered. Turning the block off instead is reversible."
        confirmLabel="Delete block"
        onConfirm={() => {
          if (!pendingDelete) return
          remove.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Block deleted')
              setPendingDelete(null)
            },
            onError: (error) => toast.error(toApiError(error).message),
          })
        }}
      />
    </DialogRoot>
  )
}

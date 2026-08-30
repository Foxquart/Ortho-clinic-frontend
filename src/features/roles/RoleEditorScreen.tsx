import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ApiError } from '@/api/errors'
import { SUPERADMIN_LEVEL } from '@/lib/permissions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Controls'
import { Card, PageHeader, Separator } from '@/components/ui/Surface'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { reportMutationError } from '@/features/users/formUtils'
import type { RoleCreateRequest, RoleUpdateRequest, UUID } from '@/api/schema'
import { DeleteRoleDialog } from './DeleteRoleDialog'
import { PermissionPicker } from './PermissionPicker'
import {
  holderSentence,
  isVendorRole,
  useCreateRole,
  useLevelLadder,
  usePermissionCatalogue,
  useRole,
  useRoleHolderTally,
  useRoleList,
  useUpdateRole,
} from './useRoles'

/* Mirrors `^[a-z][a-z0-9_]{1,31}$` from the API. Caught here so a typo is a
   red line under the field rather than a round trip and a 422. */
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/

const schema = z.object({
  key: z
    .string()
    .trim()
    .regex(
      KEY_PATTERN,
      'Start with a letter, then 1–31 more lowercase letters, digits or underscores',
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Give the role a display name')
    .max(64, 'Use at most 64 characters'),
  description: z.string().trim().max(255, 'Use at most 255 characters'),
  level: z
    .number({ error: 'Enter a level between 1 and 99' })
    .int('Levels are whole numbers')
    .min(1, 'The lowest level is 1')
    .max(99, `Level ${SUPERADMIN_LEVEL} is reserved for the vendor’s superadmin`),
  is_active: z.boolean(),
  permissions: z.array(z.string()),
})

type Values = z.infer<typeof schema>

/** Every path the server can name in a 422 that this form owns. */
const FIELDS = ['key', 'name', 'description', 'level', 'permissions'] as const

const EMPTY: Values = {
  key: '',
  name: '',
  description: '',
  // Mid-ladder by default: below the clinic's doctor, above its front desk, so
  // a new role starts somewhere defensible instead of at an accidental 1.
  level: 50,
  is_active: true,
  permissions: [],
}

/**
 * Where a level sits among the ones that already exist. The seeded levels are
 * read off the live role list rather than hardcoded, so a clinic that has
 * already defined its own roles sees the whole ladder, not just 100/60/40.
 */
function LevelLadder({
  marks,
  current,
}: {
  marks: ReturnType<typeof useLevelLadder>
  current: number
}) {
  if (marks.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {marks.map((mark) => (
        <span
          key={mark.id}
          className={cn(
            'border-border text-caption text-text-muted inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5',
            mark.reserved && 'text-text-subtle opacity-70',
            !mark.reserved &&
              mark.level === current &&
              'border-accent/40 bg-accent-muted text-accent-muted-fg',
          )}
        >
          <span className="font-mono">{mark.level}</span>
          {mark.name}
          {mark.reserved && <Lock aria-hidden className="size-3" />}
        </span>
      ))}
    </div>
  )
}

/**
 * Create and edit share one screen. Create mode is the literal `new` in the
 * `:roleId` route param — `/superadmin/roles/new` — so there is one route
 * pattern and one component to wire.
 */
export function RoleEditorScreen() {
  const { roleId } = useParams<{ roleId: string }>()
  const isCreate = roleId === undefined || roleId === 'new'
  const navigate = useNavigate()

  const roles = useRoleList()
  const detail = useRole(isCreate ? null : ((roleId ?? null) as UUID | null))
  const catalogue = usePermissionCatalogue()
  const tally = useRoleHolderTally()
  const ladder = useLevelLadder(roles.data)

  const create = useCreateRole()
  const update = useUpdateRole()

  const [submitError, setSubmitError] = useState<unknown>(null)
  const [deleting, setDeleting] = useState(false)

  const role = detail.data ?? null
  const isSystem = role?.is_system ?? false
  const locked = role !== null && isVendorRole(role)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  /* Seeded once per role, keyed on the id rather than the object: react-query
     hands back a fresh object on every refetch, and resetting on that would
     wipe a half-edited permission set the moment an invalidation landed. */
  const seededId = useRef<string | null>(null)
  useEffect(() => {
    if (!role || seededId.current === role.id) return
    seededId.current = role.id
    reset({
      key: role.key,
      name: role.name,
      description: role.description ?? '',
      level: role.level,
      is_active: role.is_active,
      permissions: role.permissions,
    })
  }, [role, reset])

  const permissions = watch('permissions')
  const isActive = watch('is_active')
  const level = watch('level')

  function fail(error: unknown) {
    if (error instanceof ApiError) {
      // On create the only conflict the API raises is a key already in use, and
      // that belongs under the key field rather than in a toast that scrolls away.
      if (error.isConflict && isCreate) {
        setError('key', { message: error.message })
        return
      }
      // A 409 on edit means a locked field was somehow sent, and a 403 means
      // this role is not editable at all. Both messages are written for the
      // account holder — shown verbatim, not summarised.
      if (error.isConflict || error.isForbidden) {
        setSubmitError(error)
        return
      }
    }
    reportMutationError(error, setError, FIELDS)
  }

  function onSubmit(values: Values) {
    setSubmitError(null)
    // A reserved key in the body is a 422 and the checkboxes cannot produce
    // one, but the array is filtered anyway: a stale cached role must not be
    // the thing that discovers that.
    const reserved = new Set(
      (catalogue.data ?? []).flatMap((g) =>
        g.permissions.filter((p) => p.reserved).map((p) => p.key),
      ),
    )
    const granted = values.permissions.filter((key) => !reserved.has(key))
    const description = values.description.trim() || null

    if (isCreate) {
      create.mutate(
        {
          key: values.key,
          name: values.name,
          description,
          level: values.level,
          permissions: granted,
        } satisfies RoleCreateRequest,
        {
          onSuccess: (created) => {
            toast.success(`${created.name} is ready to assign`)
            void navigate('/superadmin/roles')
          },
          onError: fail,
        },
      )
      return
    }

    if (!role) return
    // Level and activation are locked on a seeded role — the API answers 409 on
    // either — so they are left out of the body entirely rather than sent
    // unchanged and hoping the server compares before it refuses.
    const body: RoleUpdateRequest = {
      name: values.name,
      description,
      permissions: granted,
      ...(isSystem ? {} : { level: values.level, is_active: values.is_active }),
    }
    update.mutate(
      { id: role.id, body },
      {
        onSuccess: (saved) => {
          toast.success(`${saved.name} saved`)
          void navigate('/superadmin/roles')
        },
        onError: fail,
      },
    )
  }

  const saving = create.isPending || update.isPending
  const holders = role ? tally.data?.counts[role.id] : undefined

  const back = (
    <Button
      variant="ghost"
      size="sm"
      iconLeft={<ArrowLeft aria-hidden className="size-4" />}
      onClick={() => void navigate('/superadmin/roles')}
    >
      All roles
    </Button>
  )

  if (!isCreate && detail.isError) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    )
  }

  if (!isCreate && detail.isPending) {
    return (
      <div className="max-w-form flex flex-col gap-4">
        {back}
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  /* The vendor's operator role. Every write against it is a 403, so the editor
     is not rendered disabled — it is not rendered at all, and says why. */
  if (locked && role) {
    return (
      <div className="max-w-form flex flex-col gap-4">
        {back}
        <PageHeader title={role.name} description="This role cannot be edited." />
        <Card className="flex flex-col gap-3 p-4">
          <span className="text-text-muted flex items-center gap-2">
            <Lock aria-hidden className="size-4" />
            <span className="text-body">Level {role.level} is the vendor’s, not the clinic’s.</span>
          </span>
          <p className="text-body text-text-muted max-w-prose">
            This is the operator account the product is maintained from: it defines roles, reads
            monitoring, and bypasses every permission check rather than holding permissions of its
            own. The API refuses any change to it, including a rename, so no edit is offered here.
          </p>
          <p className="text-caption text-text-subtle">
            Key <span className="text-text font-mono">{role.key}</span> · {holderSentence(holders)}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-form flex flex-col gap-5">
      {back}

      <PageHeader
        title={isCreate ? 'New role' : (role?.name ?? 'Role')}
        description={
          isCreate
            ? 'A level ranks this role against the others; the permissions decide what its holders may do. Neither implies the other.'
            : 'Permissions can be tightened at any time. The key never changes.'
        }
        actions={
          !isCreate &&
          role && (
            <span className="flex items-center gap-2">
              {isSystem && <Badge tone="info">System role</Badge>}
              <span className="text-caption text-text-subtle">{holderSentence(holders)}</span>
            </span>
          )
        }
      />

      {submitError !== null && <ErrorState error={submitError} />}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4 p-4">
          <Field
            label="Key"
            required={isCreate}
            error={errors.key?.message}
            hint={
              isCreate
                ? 'Lowercase letters, digits and underscores, starting with a letter. It is permanent — the display name is what you rename later.'
                : 'The stable handle this role is referred to by. It cannot be changed once the role exists.'
            }
          >
            {(a) => (
              <Input
                {...a}
                {...register('key')}
                readOnly={!isCreate}
                autoFocus={isCreate}
                spellCheck={false}
                autoComplete="off"
                placeholder="reception"
                className={cn('font-mono', !isCreate && 'bg-bg-sunken text-text-muted')}
              />
            )}
          </Field>

          <Field
            label="Name"
            required
            error={errors.name?.message}
            hint="What the clinic sees. Rename it freely."
          >
            {(a) => <Input {...a} {...register('name')} autoFocus={!isCreate} />}
          </Field>

          <Field label="Description" optionalLabel error={errors.description?.message}>
            {(a) => (
              <Textarea
                {...a}
                {...register('description')}
                rows={2}
                maxLength={255}
                placeholder="Books and registers, never prescribes."
              />
            )}
          </Field>

          <Separator />

          <Field
            label="Level"
            required
            error={errors.level?.message}
            hint={
              isSystem
                ? 'Locked. A seeded role’s level is fixed — the API refuses to change it, because everything about who may manage whom is anchored to these numbers.'
                : `An account may only manage accounts strictly below its own level. 1–99; ${SUPERADMIN_LEVEL} is the vendor’s and cannot be taken.`
            }
          >
            {(a) => (
              <Input
                {...a}
                {...register('level', { valueAsNumber: true })}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                step={1}
                disabled={isSystem}
                className="w-28 font-mono"
              />
            )}
          </Field>

          <LevelLadder marks={ladder} current={level} />

          {!isCreate && (
            <>
              <Separator />
              <Switch
                id="role-is-active"
                checked={isActive}
                disabled={isSystem}
                onCheckedChange={(checked) => setValue('is_active', checked, { shouldDirty: true })}
                label="Available to assign"
                description={
                  isSystem
                    ? 'Locked. A seeded role cannot be deactivated — the API answers with a conflict.'
                    : 'Turn this off to retire the role. Nobody new can be given it; the people who already hold it keep it.'
                }
              />
            </>
          )}
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-heading text-text font-semibold">Permissions</h2>
            <p className="text-caption text-text-subtle max-w-prose">
              What a holder of this role may do. The catalogue comes from the server, so it stays
              current without a release here.
            </p>
            {errors.permissions?.message && (
              <p role="alert" className="text-caption text-danger font-medium">
                {errors.permissions.message}
              </p>
            )}
          </div>

          {catalogue.isError ? (
            <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
          ) : catalogue.isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <PermissionPicker
              groups={catalogue.data}
              value={permissions}
              onChange={(next) => setValue('permissions', next, { shouldDirty: true })}
            />
          )}
        </section>

        <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {!isCreate && role && !role.is_system && (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger mr-auto"
              onClick={() => setDeleting(true)}
            >
              Delete role
            </Button>
          )}
          <Button variant="secondary" onClick={() => void navigate('/superadmin/roles')}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={!isCreate && !isDirty}
            onClick={handleSubmit(onSubmit)}
          >
            {isCreate ? 'Create role' : 'Save changes'}
          </Button>
        </div>
      </form>

      {!isCreate && role && (
        <DeleteRoleDialog
          role={role}
          holderCount={holders}
          open={deleting}
          onOpenChange={(open) => {
            setDeleting(open)
            // The role is gone; there is nothing left on this screen to edit.
            if (!open && roles.data && !roles.data.some((r) => r.id === role.id)) {
              void navigate('/superadmin/roles')
            }
          }}
        />
      )}
    </div>
  )
}

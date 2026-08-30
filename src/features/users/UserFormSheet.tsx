import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiGet, apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { formatDate } from '@/lib/format'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/Button'
import { DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { ErrorState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Input'
import { Select, Switch } from '@/components/ui/Controls'
import type { SelectOption } from '@/components/ui/Controls'
import type { RoleResponse, UserCreateRequest, UserResponse, UserUpdateRequest } from '@/api/schema'
import { reportMutationError, suggestPassword } from './formUtils'

/**
 * Every field and the role select are 32px tall — right under a mouse, eight
 * pixels short of what a fingertip needs. Raised once from each form root
 * rather than field by field, so a field added later inherits it; above `sm`
 * the original density returns.
 */
const TOUCH_FIELDS = 'max-sm:[&_input]:min-h-tap max-sm:[&_[role=combobox]]:min-h-tap'

/* The wand sits beside a text field, so it has to grow in both directions or it
   becomes a 44x32 lozenge next to a 44px input. */
const TOUCH_ICON = 'min-h-tap min-w-tap sm:min-h-0 sm:min-w-0'

/* ------------------------------- Role picker ------------------------------ */

/**
 * The dropdown is the server's answer, not ours. `GET /roles/assignable`
 * returns exactly the roles this actor may hand out — strictly below their own
 * level, active only — so there is deliberately no client-side filter here to
 * drift out of step with the rule the write endpoint enforces anyway. Roles are
 * database rows now: a clinic can invent "Junior registrar" tomorrow, and the
 * only honest way to know whether the signed-in user may assign it is to ask.
 */
function useAssignableRoles(enabled: boolean) {
  return useQuery({
    queryKey: qk.roles.assignable(),
    queryFn: () => apiGet<RoleResponse[]>(endpoints.roles.assignable),
    enabled,
  })
}

/**
 * A role somebody invented may carry no description. Rather than leave the line
 * under its name blank, say what the number actually buys — authority over
 * everyone below it. What the role may *do* is a separate axis, carried by its
 * permissions, and is not guessed at here.
 */
function describeRole(role: RoleResponse): string {
  return role.description ?? `Level ${role.level} — can manage accounts below level ${role.level}.`
}

function roleOptions(roles: readonly RoleResponse[]): SelectOption[] {
  return roles.map((role) => ({
    value: role.id,
    label: role.name,
    description: describeRole(role),
  }))
}

/**
 * The authority rule has a consequence worth saying out loud. An actor may only
 * hand out a role *strictly* below their own, so the list a doctor sees will
 * never contain "Doctor" — and an option that is simply absent reads as a bug,
 * not as a policy. Naming it as a vendor action is the point: the clinic cannot
 * onboard its own second doctor, and it should learn that here rather than from
 * a 403 or a support call.
 */
function AuthorityNote({ roleName, level }: { roleName: string; level: number }) {
  return (
    <p className="border-info/25 bg-info-muted text-caption text-info-muted-fg rounded-md border px-3 py-2">
      You can only create accounts <em>below</em> your own role ({roleName}, level {level}). Adding
      another {roleName} — or anyone at or above your level — is a vendor action, not a self-service
      one. Ask your provider to add it.
    </p>
  )
}

/**
 * Holding `user.create` and having nobody below you to create is a real state,
 * not an error: a staff-level account granted the permission in a clinic that
 * has invented no role beneath it lands here. An empty select would be a dead
 * end with no explanation, so say what is missing and who can supply it.
 */
function NoAssignableRolesNote({ roleName, level }: { roleName: string; level: number }) {
  return (
    <p className="border-warning/25 bg-warning-muted text-caption text-warning-muted-fg rounded-md border px-3 py-2">
      There is no role you can assign. Your own role ({roleName}, level {level}) can only be handed
      out to accounts strictly below it, and no active role sits there yet. Ask your provider to add
      one.
    </p>
  )
}

/* --------------------------------- Create --------------------------------- */

const createSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter their name').max(128, 'Use at most 128 characters'),
  username: z
    .string()
    .trim()
    .min(3, 'At least 3 characters')
    .max(64, 'Use at most 64 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, digits, dot, dash and underscore only'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
  // Required, and deliberately without a default. The old `role: "staff"`
  // default decided authority on the caller's behalf; the backend removed it
  // for that reason, and an empty string here fails `uuid` with the message a
  // person can act on.
  role_id: z.uuid('Choose a role'),
})

type CreateValues = z.infer<typeof createSchema>
const CREATE_FIELDS = ['full_name', 'username', 'email', 'password', 'role_id'] as const
const CREATE_DEFAULTS: CreateValues = {
  full_name: '',
  username: '',
  email: '',
  password: '',
  role_id: '',
}

export function CreateUserSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { role: myRole, isSuperadmin } = useAuth()
  const roles = useAssignableRoles(open)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: CREATE_DEFAULTS,
  })

  useEffect(() => {
    if (open) reset(CREATE_DEFAULTS)
  }, [open, reset])

  const roleId = watch('role_id')
  const options = useMemo(() => roleOptions(roles.data ?? []), [roles.data])
  const nothingToAssign = roles.isSuccess && options.length === 0

  const create = useMutation({
    mutationFn: (values: CreateValues) =>
      apiPost<UserResponse>(endpoints.users.create, {
        username: values.username.trim(),
        email: values.email.trim(),
        full_name: values.full_name.trim(),
        password: values.password,
        role_id: values.role_id,
      } satisfies UserCreateRequest),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: qk.users.all() })
      toast.success(`${user.full_name} can now sign in as ${user.username}`)
      onOpenChange(false)
    },
    // 422s land on their field; a 403 or a 409 becomes a toast carrying the
    // server's own sentence, which is written for the person holding the
    // account and reads better than anything we could substitute.
    onError: (error) => reportMutationError(error, setError, CREATE_FIELDS),
  })

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Add a user"
        description="They can sign in as soon as you save."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost" className="min-h-tap sm:min-h-0">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              className="min-h-tap sm:min-h-0"
              loading={create.isPending}
              disabled={nothingToAssign}
              onClick={handleSubmit((v) => create.mutate(v))}
            >
              Create user
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit((v) => create.mutate(v))}
          className={cn('flex flex-col gap-4', TOUCH_FIELDS)}
        >
          <Field label="Full name" error={errors.full_name?.message} required>
            {(a) => <Input {...a} {...register('full_name')} autoFocus />}
          </Field>

          <Field
            label="Username"
            hint="Cannot be changed later. Letters, digits, dot, dash and underscore."
            error={errors.username?.message}
            required
          >
            {(a) => (
              <Input
                {...a}
                {...register('username')}
                className="font-mono"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
              />
            )}
          </Field>

          <Field label="Email" error={errors.email?.message} required>
            {(a) => <Input {...a} {...register('email')} type="email" autoComplete="off" />}
          </Field>

          <Field
            label="Initial password"
            hint="Shown in plain text so you can pass it on. They can change it themselves afterwards."
            error={errors.password?.message}
            required
          >
            {(a) => (
              <div className="flex items-center gap-2">
                <Input
                  {...a}
                  {...register('password')}
                  type="text"
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className={TOUCH_ICON}
                  aria-label="Suggest a password"
                  onClick={() => setValue('password', suggestPassword(), { shouldValidate: true })}
                >
                  <Wand2 aria-hidden className="size-4" />
                </Button>
              </div>
            )}
          </Field>

          <div className="flex flex-col gap-2">
            <Field
              label="Role"
              error={errors.role_id?.message}
              hint={roles.isFetching ? 'Loading the roles you can assign…' : undefined}
              required
            >
              {(a) => (
                <Select
                  {...a}
                  value={roleId || undefined}
                  onChange={(v) => setValue('role_id', v, { shouldValidate: true })}
                  options={options}
                  disabled={options.length === 0}
                  placeholder={nothingToAssign ? 'No role you can assign' : 'Choose a role'}
                />
              )}
            </Field>

            {roles.isError && (
              <ErrorState compact error={roles.error} onRetry={() => void roles.refetch()} />
            )}

            {myRole &&
              (nothingToAssign ? (
                <NoAssignableRolesNote roleName={myRole.name} level={myRole.level} />
              ) : (
                // The superadmin's list already contains everything below 100,
                // so the note would only tell them they cannot clone themselves.
                !isSuperadmin && <AuthorityNote roleName={myRole.name} level={myRole.level} />
              ))}
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

/* ---------------------------------- Edit ---------------------------------- */

const editSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter their name').max(128, 'Use at most 128 characters'),
  email: z.email('Enter a valid email address'),
  role_id: z.uuid('Choose a role'),
  is_active: z.boolean(),
})

type EditValues = z.infer<typeof editSchema>
const EDIT_FIELDS = ['full_name', 'email', 'role_id', 'is_active'] as const

export function EditUserSheet({
  user,
  isSelf,
  open,
  onOpenChange,
}: {
  user: UserResponse
  /** Locks the two controls the server refuses on your own account: role and sign-in. */
  isSelf: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const roles = useAssignableRoles(open && !isSelf)

  const values = useMemo<EditValues>(
    () => ({
      full_name: user.full_name,
      email: user.email,
      role_id: user.role.id,
      is_active: user.is_active,
    }),
    [user],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema), values })

  const roleId = watch('role_id')
  const isActive = watch('is_active')

  const assignableCount = roles.data?.length ?? 0
  const options = useMemo(() => {
    const list = roleOptions(roles.data ?? [])
    // Their current role is not necessarily one you may hand out — it can be
    // inactive, or it can have been set by somebody with more authority than
    // you. Carrying it as a locked entry keeps the select from rendering an
    // empty box over a value that is genuinely set.
    if (!list.some((option) => option.value === user.role.id)) {
      list.unshift({
        value: user.role.id,
        label: user.role.name,
        description: `Level ${user.role.level} — their current role, which you cannot re-assign.`,
        disabled: true,
      })
    }
    return list
  }, [roles.data, user.role])

  const canAssignRole = !isSelf && assignableCount > 0

  const update = useMutation({
    mutationFn: (v: EditValues) => {
      // Send only what changed — a PATCH that restates every field turns an
      // unrelated edit into an audit entry that says the role was set again.
      const body: UserUpdateRequest = {}
      if (dirtyFields.full_name) body.full_name = v.full_name.trim()
      if (dirtyFields.email) body.email = v.email.trim()
      if (dirtyFields.role_id && canAssignRole) body.role_id = v.role_id
      if (dirtyFields.is_active && !isSelf) body.is_active = v.is_active
      return apiPatch<UserResponse>(endpoints.users.byId(user.id), body)
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: qk.users.all() })
      toast.success(`${updated.full_name} updated`)
      onOpenChange(false)
    },
    // Demoting or deactivating the last active superadmin comes back 409, and
    // the server's message names what would break. Shown verbatim.
    onError: (error) => reportMutationError(error, setError, EDIT_FIELDS),
  })

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) reset(values)
        onOpenChange(next)
      }}
    >
      <SheetContent
        title={user.full_name}
        description={`${user.username} · ${user.role.name} (level ${user.role.level}) · added ${formatDate(user.created_at)}`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost" className="min-h-tap sm:min-h-0">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              className="min-h-tap sm:min-h-0"
              loading={update.isPending}
              disabled={!isDirty}
              onClick={handleSubmit((v) => update.mutate(v))}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit((v) => update.mutate(v))}
          className={cn('flex flex-col gap-4', TOUCH_FIELDS)}
        >
          <Field label="Username" hint="Usernames cannot be changed after the account is created.">
            {(a) => <Input {...a} value={user.username} readOnly disabled className="font-mono" />}
          </Field>

          <Field label="Full name" error={errors.full_name?.message} required>
            {(a) => <Input {...a} {...register('full_name')} />}
          </Field>

          <Field label="Email" error={errors.email?.message} required>
            {(a) => <Input {...a} {...register('email')} type="email" />}
          </Field>

          <div className="flex flex-col gap-2">
            <Field
              label="Role"
              error={errors.role_id?.message}
              hint={
                isSelf
                  ? 'You cannot change your own role — that has to come from an account above yours.'
                  : assignableCount === 0
                    ? 'There is no role you are allowed to hand out, so this cannot be changed here.'
                    : undefined
              }
              required
            >
              {(a) => (
                <Select
                  {...a}
                  value={roleId || undefined}
                  onChange={(v) =>
                    setValue('role_id', v, { shouldDirty: true, shouldValidate: true })
                  }
                  options={options}
                  disabled={!canAssignRole}
                />
              )}
            </Field>

            {roles.isError && (
              <ErrorState compact error={roles.error} onRetry={() => void roles.refetch()} />
            )}
          </div>

          <div className="border-border rounded-lg border p-3">
            <Switch
              id="user-active"
              checked={isActive}
              onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })}
              disabled={isSelf}
              label="Can sign in"
              description={
                isSelf
                  ? 'You cannot deactivate your own account — you would lock yourself out.'
                  : 'Turning this off blocks sign-in immediately. Accounts are never deleted, so the audit trail stays intact.'
              }
            />
          </div>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

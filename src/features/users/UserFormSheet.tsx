import { useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { apiPatch, apiPost } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { formatDate } from '@/lib/format'
import { ROLE_LABEL } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { DialogClose, DialogRoot, SheetContent } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Select, Switch } from '@/components/ui/Controls'
import type { SelectOption } from '@/components/ui/Controls'
import { USER_ROLES } from '@/api/schema'
import type { UserCreateRequest, UserResponse, UserRole, UserUpdateRequest } from '@/api/schema'
import { reportMutationError, suggestPassword } from './formUtils'

const ROLE_DESCRIPTION: Record<UserRole, string> = {
  admin: 'Everything, including accounts, clinic settings and the public website.',
  doctor: 'Patients, prescriptions, appointments and voice capture.',
  staff: 'Read-only: can open patients, prescriptions and the schedule, but not change them.',
}

const ROLE_OPTIONS: readonly SelectOption<UserRole>[] = USER_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
  description: ROLE_DESCRIPTION[role],
}))

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
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters'),
  role: z.enum(USER_ROLES),
})

type CreateValues = z.infer<typeof createSchema>
const CREATE_FIELDS = ['full_name', 'username', 'email', 'password', 'role'] as const

export function CreateUserSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

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
    defaultValues: { full_name: '', username: '', email: '', password: '', role: 'staff' },
  })

  useEffect(() => {
    if (open) reset({ full_name: '', username: '', email: '', password: '', role: 'staff' })
  }, [open, reset])

  const role = watch('role')

  const create = useMutation({
    mutationFn: (values: CreateValues) =>
      apiPost<UserResponse>(endpoints.users.create, {
        username: values.username.trim(),
        email: values.email.trim(),
        full_name: values.full_name.trim(),
        password: values.password,
        role: values.role,
      } satisfies UserCreateRequest),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: qk.users.all() })
      toast.success(`${user.full_name} can now sign in as ${user.username}`)
      onOpenChange(false)
    },
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
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={create.isPending}
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
          className="flex flex-col gap-4"
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
                  aria-label="Suggest a password"
                  onClick={() => setValue('password', suggestPassword(), { shouldValidate: true })}
                >
                  <Wand2 aria-hidden className="size-4" />
                </Button>
              </div>
            )}
          </Field>

          <Field label="Role" error={errors.role?.message} required>
            {(a) => (
              <Select
                {...a}
                value={role}
                onChange={(v) => setValue('role', v, { shouldValidate: true })}
                options={ROLE_OPTIONS}
              />
            )}
          </Field>
        </form>
      </SheetContent>
    </DialogRoot>
  )
}

/* ---------------------------------- Edit ---------------------------------- */

const editSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter their name').max(128, 'Use at most 128 characters'),
  email: z.email('Enter a valid email address'),
  role: z.enum(USER_ROLES),
  is_active: z.boolean(),
})

type EditValues = z.infer<typeof editSchema>
const EDIT_FIELDS = ['full_name', 'email', 'role', 'is_active'] as const

export function EditUserSheet({
  user,
  isSelf,
  open,
  onOpenChange,
}: {
  user: UserResponse
  /** Locks the two controls that could sign the current admin out for good. */
  isSelf: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const values = useMemo<EditValues>(
    () => ({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
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

  const role = watch('role')
  const isActive = watch('is_active')

  const update = useMutation({
    mutationFn: (v: EditValues) => {
      // Send only what changed — a PATCH that restates every field turns an
      // unrelated edit into an audit entry that says the role was set again.
      const body: UserUpdateRequest = {}
      if (dirtyFields.full_name) body.full_name = v.full_name.trim()
      if (dirtyFields.email) body.email = v.email.trim()
      if (dirtyFields.role && !isSelf) body.role = v.role
      if (dirtyFields.is_active && !isSelf) body.is_active = v.is_active
      return apiPatch<UserResponse>(endpoints.users.byId(user.id), body)
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: qk.users.all() })
      toast.success(`${updated.full_name} updated`)
      onOpenChange(false)
    },
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
        description={`${user.username} · added ${formatDate(user.created_at)}`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
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
          className="flex flex-col gap-4"
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

          <Field
            label="Role"
            error={errors.role?.message}
            hint={
              isSelf
                ? 'You cannot change your own role — another administrator has to do it.'
                : undefined
            }
            required
          >
            {(a) => (
              <Select
                {...a}
                value={role}
                onChange={(v) => setValue('role', v, { shouldDirty: true, shouldValidate: true })}
                options={ROLE_OPTIONS}
                disabled={isSelf}
              />
            )}
          </Field>

          <div className="rounded-lg border border-border p-3">
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

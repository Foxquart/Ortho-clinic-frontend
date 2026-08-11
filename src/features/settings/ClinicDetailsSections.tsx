import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { apiPatch, resolveApiUrl } from '@/api/http'
import { endpoints } from '@/api/endpoints'
import { qk } from '@/lib/query'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { SectionCard } from './SectionCard'
import { optionalText, reportMutationError, requiredText, textValue, trimmedOrNull } from './formUtils'
import type { ClinicSettingsResponse, ClinicSettingsUpdate } from '@/api/schema'

/* Every bound below is copied from the schema's declared constraints so the
   user never learns about a limit from a server 422. */

function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ClinicSettingsUpdate) =>
      apiPatch<ClinicSettingsResponse>(endpoints.clinic.settings, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.clinic.settings(), updated)
      // The public website reads the same object.
      void queryClient.invalidateQueries({ queryKey: qk.public.clinic() })
      toast.success('Clinic details saved')
    },
  })
}

/* -------------------------------- Identity -------------------------------- */

const identitySchema = z.object({
  clinic_name: requiredText(128, 'The clinic needs a name'),
  tagline: optionalText(255),
  registration_number: optionalText(64),
  currency: optionalText(8),
  logo_url: optionalText(512),
  footer_text: optionalText(2000),
})
type IdentityValues = z.infer<typeof identitySchema>
const IDENTITY_FIELDS = [
  'clinic_name',
  'tagline',
  'registration_number',
  'currency',
  'logo_url',
  'footer_text',
] as const

export function ClinicIdentitySection({
  settings,
  canWrite,
}: {
  settings: ClinicSettingsResponse
  canWrite: boolean
}) {
  const save = useSaveSettings()

  const values = useMemo<IdentityValues>(
    () => ({
      clinic_name: settings.clinic_name,
      tagline: textValue(settings.tagline),
      registration_number: textValue(settings.registration_number),
      currency: textValue(settings.currency),
      logo_url: textValue(settings.logo_url),
      footer_text: textValue(settings.footer_text),
    }),
    [settings],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    values,
    resetOptions: { keepDirtyValues: true },
  })

  const logoUrl = watch('logo_url').trim()

  const submit = handleSubmit((v) =>
    save.mutate(
      {
        clinic_name: v.clinic_name.trim(),
        tagline: trimmedOrNull(v.tagline),
        registration_number: trimmedOrNull(v.registration_number),
        currency: trimmedOrNull(v.currency),
        logo_url: trimmedOrNull(v.logo_url),
        footer_text: trimmedOrNull(v.footer_text),
      },
      { onError: (e) => reportMutationError(e, setError, IDENTITY_FIELDS) },
    ),
  )

  return (
    <SectionCard
      title="Clinic identity"
      description="Printed on every prescription and shown on the public website."
      canWrite={canWrite}
      isDirty={isDirty}
      isSaving={save.isPending}
      onSubmit={submit}
      onDiscard={() => reset(values)}
      bodyClassName="sm:grid-cols-2"
    >
      <Field
        label="Clinic name"
        error={errors.clinic_name?.message}
        required
        className="sm:col-span-2"
      >
        {(a) => <Input {...a} {...register('clinic_name')} disabled={!canWrite} />}
      </Field>

      <Field
        label="Tagline"
        hint="One line under the clinic name."
        error={errors.tagline?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => <Input {...a} {...register('tagline')} disabled={!canWrite} />}
      </Field>

      <Field
        label="Registration number"
        hint="World-readable — the public site serves this field."
        error={errors.registration_number?.message}
        optionalLabel
      >
        {(a) => (
          <Input {...a} {...register('registration_number')} className="font-mono" disabled={!canWrite} />
        )}
      </Field>

      <Field
        label="Currency symbol"
        hint="Used wherever an amount is shown, e.g. ₹."
        error={errors.currency?.message}
        optionalLabel
      >
        {(a) => <Input {...a} {...register('currency')} disabled={!canWrite} />}
      </Field>

      <Field
        label="Logo URL"
        error={errors.logo_url?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => (
          <div className="flex items-center gap-3">
            <Input {...a} {...register('logo_url')} className="font-mono" disabled={!canWrite} />
            {logoUrl && (
              <img
                src={resolveApiUrl(logoUrl)}
                alt="Current clinic logo"
                className="size-9 shrink-0 rounded-md border border-border bg-surface object-contain p-1"
              />
            )}
          </div>
        )}
      </Field>

      <Field
        label="Footer text"
        hint="Appears at the foot of the public website. Not the print footer — that lives in the print template below."
        error={errors.footer_text?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => <Textarea {...a} {...register('footer_text')} rows={2} disabled={!canWrite} />}
      </Field>
    </SectionCard>
  )
}

/* --------------------------------- Contact -------------------------------- */

const contactSchema = z.object({
  phone: optionalText(20),
  alternate_phone: optionalText(20),
  email: optionalText(255),
  website_url: optionalText(255),
})
type ContactValues = z.infer<typeof contactSchema>
const CONTACT_FIELDS = ['phone', 'alternate_phone', 'email', 'website_url'] as const

export function ClinicContactSection({
  settings,
  canWrite,
}: {
  settings: ClinicSettingsResponse
  canWrite: boolean
}) {
  const save = useSaveSettings()

  const values = useMemo<ContactValues>(
    () => ({
      phone: textValue(settings.phone),
      alternate_phone: textValue(settings.alternate_phone),
      email: textValue(settings.email),
      website_url: textValue(settings.website_url),
    }),
    [settings],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    values,
    resetOptions: { keepDirtyValues: true },
  })

  const submit = handleSubmit((v) =>
    save.mutate(
      {
        phone: trimmedOrNull(v.phone),
        alternate_phone: trimmedOrNull(v.alternate_phone),
        email: trimmedOrNull(v.email),
        website_url: trimmedOrNull(v.website_url),
      },
      { onError: (e) => reportMutationError(e, setError, CONTACT_FIELDS) },
    ),
  )

  return (
    <SectionCard
      title="Contact"
      description="How patients reach the clinic."
      canWrite={canWrite}
      isDirty={isDirty}
      isSaving={save.isPending}
      onSubmit={submit}
      onDiscard={() => reset(values)}
      bodyClassName="sm:grid-cols-2"
    >
      <Field label="Phone" error={errors.phone?.message} optionalLabel>
        {(a) => (
          <Input {...a} {...register('phone')} type="tel" inputMode="tel" disabled={!canWrite} />
        )}
      </Field>

      <Field label="Alternate phone" error={errors.alternate_phone?.message} optionalLabel>
        {(a) => (
          <Input
            {...a}
            {...register('alternate_phone')}
            type="tel"
            inputMode="tel"
            disabled={!canWrite}
          />
        )}
      </Field>

      <Field label="Email" error={errors.email?.message} optionalLabel>
        {(a) => <Input {...a} {...register('email')} type="email" disabled={!canWrite} />}
      </Field>

      <Field
        label="Website"
        hint="Include https://"
        error={errors.website_url?.message}
        optionalLabel
      >
        {(a) => <Input {...a} {...register('website_url')} type="url" disabled={!canWrite} />}
      </Field>
    </SectionCard>
  )
}

/* --------------------------------- Address -------------------------------- */

const addressSchema = z.object({
  address: optionalText(512),
  city: optionalText(128),
  postal_code: optionalText(16),
  google_maps_url: optionalText(512),
})
type AddressValues = z.infer<typeof addressSchema>
const ADDRESS_FIELDS = ['address', 'city', 'postal_code', 'google_maps_url'] as const

export function ClinicAddressSection({
  settings,
  canWrite,
}: {
  settings: ClinicSettingsResponse
  canWrite: boolean
}) {
  const save = useSaveSettings()

  const values = useMemo<AddressValues>(
    () => ({
      address: textValue(settings.address),
      city: textValue(settings.city),
      postal_code: textValue(settings.postal_code),
      google_maps_url: textValue(settings.google_maps_url),
    }),
    [settings],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    values,
    resetOptions: { keepDirtyValues: true },
  })

  const submit = handleSubmit((v) =>
    save.mutate(
      {
        address: trimmedOrNull(v.address),
        city: trimmedOrNull(v.city),
        postal_code: trimmedOrNull(v.postal_code),
        google_maps_url: trimmedOrNull(v.google_maps_url),
      },
      { onError: (e) => reportMutationError(e, setError, ADDRESS_FIELDS) },
    ),
  )

  return (
    <SectionCard
      title="Address"
      description="Shown on the public site and on printed prescriptions."
      canWrite={canWrite}
      isDirty={isDirty}
      isSaving={save.isPending}
      onSubmit={submit}
      onDiscard={() => reset(values)}
      bodyClassName="sm:grid-cols-2"
    >
      <Field
        label="Street address"
        error={errors.address?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => <Textarea {...a} {...register('address')} rows={2} disabled={!canWrite} />}
      </Field>

      <Field label="City" error={errors.city?.message} optionalLabel>
        {(a) => <Input {...a} {...register('city')} disabled={!canWrite} />}
      </Field>

      <Field label="Postal code" error={errors.postal_code?.message} optionalLabel>
        {(a) => (
          <Input {...a} {...register('postal_code')} className="font-mono" disabled={!canWrite} />
        )}
      </Field>

      <Field
        label="Google Maps link"
        hint="Used for the “Get directions” link on the public site."
        error={errors.google_maps_url?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => (
          <Input {...a} {...register('google_maps_url')} type="url" disabled={!canWrite} />
        )}
      </Field>
    </SectionCard>
  )
}

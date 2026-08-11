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
import type { DoctorProfileResponse, DoctorProfileUpdate } from '@/api/schema'

const schema = z.object({
  full_name: requiredText(128, 'The doctor needs a name'),
  specialization: optionalText(128),
  qualifications: optionalText(255),
  registration_number: optionalText(64),
  experience_years: z
    .string()
    .refine(
      (v) => v.trim() === '' || (/^\d{1,3}$/.test(v.trim()) && Number(v) <= 100),
      'Enter a whole number of years between 0 and 100',
    ),
  bio: optionalText(4000),
  photo_url: optionalText(512),
  signature_image_url: optionalText(512),
})

type FormValues = z.infer<typeof schema>

const FIELDS = [
  'full_name',
  'specialization',
  'qualifications',
  'registration_number',
  'experience_years',
  'bio',
  'photo_url',
  'signature_image_url',
] as const

export function DoctorProfileSection({
  profile,
  canWrite,
}: {
  profile: DoctorProfileResponse
  canWrite: boolean
}) {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (body: DoctorProfileUpdate) =>
      apiPatch<DoctorProfileResponse>(endpoints.clinic.doctorProfile, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.clinic.doctorProfile(), updated)
      void queryClient.invalidateQueries({ queryKey: qk.public.doctor() })
      toast.success('Doctor profile saved')
    },
  })

  const values = useMemo<FormValues>(
    () => ({
      full_name: profile.full_name,
      specialization: textValue(profile.specialization),
      qualifications: textValue(profile.qualifications),
      registration_number: textValue(profile.registration_number),
      experience_years:
        profile.experience_years === null ? '' : String(profile.experience_years),
      bio: textValue(profile.bio),
      photo_url: textValue(profile.photo_url),
      signature_image_url: textValue(profile.signature_image_url),
    }),
    [profile],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
  })

  const signatureUrl = watch('signature_image_url').trim()

  const submit = handleSubmit((v) =>
    save.mutate(
      {
        full_name: v.full_name.trim(),
        specialization: trimmedOrNull(v.specialization),
        qualifications: trimmedOrNull(v.qualifications),
        registration_number: trimmedOrNull(v.registration_number),
        experience_years:
          v.experience_years.trim() === '' ? null : Number(v.experience_years.trim()),
        bio: trimmedOrNull(v.bio),
        photo_url: trimmedOrNull(v.photo_url),
        signature_image_url: trimmedOrNull(v.signature_image_url),
      },
      { onError: (e) => reportMutationError(e, setError, FIELDS) },
    ),
  )

  return (
    <SectionCard
      title="Doctor profile"
      description="Printed above the signature line and published on the patient site."
      canWrite={canWrite}
      isDirty={isDirty}
      isSaving={save.isPending}
      onSubmit={submit}
      onDiscard={() => reset(values)}
      bodyClassName="sm:grid-cols-2"
      readOnlyNote="Only an administrator can change the doctor profile."
    >
      <Field label="Full name" error={errors.full_name?.message} required>
        {(a) => <Input {...a} {...register('full_name')} disabled={!canWrite} />}
      </Field>

      <Field
        label="Specialisation"
        hint="e.g. Orthopaedic surgeon"
        error={errors.specialization?.message}
        optionalLabel
      >
        {(a) => <Input {...a} {...register('specialization')} disabled={!canWrite} />}
      </Field>

      <Field
        label="Qualifications"
        hint="Exactly as they should print, e.g. MBBS, MS (Ortho)"
        error={errors.qualifications?.message}
        optionalLabel
      >
        {(a) => <Input {...a} {...register('qualifications')} disabled={!canWrite} />}
      </Field>

      <Field
        label="Medical registration number"
        error={errors.registration_number?.message}
        optionalLabel
      >
        {(a) => (
          <Input
            {...a}
            {...register('registration_number')}
            className="font-mono"
            disabled={!canWrite}
          />
        )}
      </Field>

      <Field
        label="Years of experience"
        error={errors.experience_years?.message}
        optionalLabel
      >
        {(a) => (
          <Input
            {...a}
            {...register('experience_years')}
            inputMode="numeric"
            data-numeric
            disabled={!canWrite}
          />
        )}
      </Field>

      <Field label="Photo URL" error={errors.photo_url?.message} optionalLabel>
        {(a) => (
          <Input {...a} {...register('photo_url')} className="font-mono" disabled={!canWrite} />
        )}
      </Field>

      <Field
        label="Signature image URL"
        hint="Printed on every prescription above the doctor's name."
        error={errors.signature_image_url?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => (
          <div className="flex items-center gap-3">
            <Input
              {...a}
              {...register('signature_image_url')}
              className="font-mono"
              disabled={!canWrite}
            />
            {signatureUrl && (
              <img
                src={resolveApiUrl(signatureUrl)}
                alt="Current signature image"
                className="h-9 w-24 shrink-0 rounded-md border border-border bg-surface object-contain p-1"
              />
            )}
          </div>
        )}
      </Field>

      <Field
        label="Biography"
        hint="Long-form text for the public site only. Never printed."
        error={errors.bio?.message}
        optionalLabel
        className="sm:col-span-2"
      >
        {(a) => <Textarea {...a} {...register('bio')} rows={5} disabled={!canWrite} />}
      </Field>
    </SectionCard>
  )
}

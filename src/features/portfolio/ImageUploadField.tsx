import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ImageOff, Upload, X } from 'lucide-react'
import { apiPost, resolveApiUrl } from '@/api/http'
import { errorMessage } from '@/api/errors'
import { endpoints } from '@/api/endpoints'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { UploadResponse } from '@/api/schema'

/**
 * Upload straight to `POST /uploads` and keep the returned path. The path is
 * what the API stores, so the text field stays visible and editable — an image
 * that already lives on the server can be pasted in without a round trip.
 *
 * Designed to be used inside the shared `Field`, which supplies the aria props.
 */
export function ImageUploadField({
  id,
  value,
  onChange,
  disabled,
  previewClassName = 'h-24 w-40',
  ...aria
}: {
  id?: string
  value: string
  onChange: (url: string) => void
  disabled?: boolean
  previewClassName?: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return apiPost<UploadResponse>(endpoints.uploads.upload, body, {
        onUploadProgress: (event) => {
          setProgress(event.total ? Math.round((event.loaded / event.total) * 100) : null)
        },
      })
    },
    onMutate: () => {
      setFailure(null)
      setProgress(0)
    },
    onSuccess: (result) => {
      setBroken(false)
      onChange(result.url)
    },
    onError: (error) => setFailure(errorMessage(error)),
    onSettled: () => setProgress(null),
  })

  const pick = () => fileInput.current?.click()

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Let the same file be chosen twice in a row after a failure.
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFailure(`${file.name} is not an image.`)
      return
    }
    upload.mutate(file)
  }

  const uploading = upload.isPending

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-bg',
            previewClassName,
          )}
        >
          {value && !broken ? (
            <img
              src={resolveApiUrl(value)}
              alt=""
              className="size-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <ImageOff aria-hidden className="size-5 text-text-subtle" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            id={id}
            aria-describedby={aria['aria-describedby']}
            aria-invalid={aria['aria-invalid']}
            value={value}
            onChange={(e) => {
              setBroken(false)
              onChange(e.target.value)
            }}
            placeholder="/uploads/…"
            className="font-mono"
            inputSize="sm"
            spellCheck={false}
            disabled={disabled || uploading}
          />

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={pick}
              loading={uploading}
              disabled={disabled}
              iconLeft={<Upload aria-hidden className="size-4" />}
            >
              {value ? 'Replace image' : 'Upload image'}
            </Button>
            {value && !uploading && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove image"
                disabled={disabled}
                onClick={() => {
                  setBroken(false)
                  onChange('')
                }}
              >
                <X aria-hidden className="size-4" />
              </Button>
            )}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            onChange={onFile}
          />
        </div>
      </div>

      {uploading && (
        <div
          role="progressbar"
          aria-label="Uploading image"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress ?? undefined}
          className="h-1 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            data-motion-keep
            className="h-full rounded-full bg-accent transition-[width] duration-fast ease-standard"
            style={{ width: progress === null ? '35%' : `${progress}%` }}
          />
        </div>
      )}

      {failure && (
        <p role="alert" className="flex items-center gap-2 text-caption text-danger">
          {failure}
          <Button variant="link" size="sm" onClick={pick}>
            Try another file
          </Button>
        </p>
      )}

      {value && broken && !uploading && (
        <p className="text-caption text-text-subtle">
          That path did not load as an image. It is still saved exactly as written.
        </p>
      )}
    </div>
  )
}

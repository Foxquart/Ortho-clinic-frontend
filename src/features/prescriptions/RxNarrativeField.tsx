import { cn } from '@/lib/cn'
import { Input, Textarea } from '@/components/ui/Input'
import { FieldLabel, ProvenanceField } from './Provenance'
import { provenanceControlClass } from './padState'
// Per-field mic icons hidden at user request. Import commented out with the
// action={...} block below — restore both together.
// import { RxFieldStateMic } from './RxMic'
import { entered, type FieldState } from './model'

/**
 * A narrative field on the pad — diagnosis, advice, investigations, notes.
 *
 * Three things are always true of one, and they are the reason this component
 * exists rather than four hand-assembled label/input pairs:
 *
 *  - it says where its value came from, next to its name;
 *  - it has a microphone in the same place as every other field;
 *  - when nobody has said anything, it is **visibly blank** — a dashed outline
 *    and an em dash, never a helpful grey example that could be mistaken for
 *    a value at a glance on a printed-looking screen.
 */
export function RxNarrativeField({
  id,
  label,
  labelHint,
  hint,
  field,
  onChange,
  rows,
  maxLength,
  error,
  className,
}: {
  id: string
  label: string
  /** Plain-language explanation of the field, shown on hovering the label. */
  labelHint?: string
  /** Short status note rendered under the field (for example "Not printed."). */
  hint?: React.ReactNode
  field: FieldState<string>
  onChange: (next: FieldState<string>) => void
  /** Set for a textarea; omit for a single-line input. */
  rows?: number
  maxLength: number
  error?: string
  className?: string
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const controlClass = provenanceControlClass(field.provenance)

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <FieldLabel
        hint={labelHint}
        htmlFor={id}
        provenance={field.provenance}
        // Per-field mic icons hidden at user request. Uncomment this block and
        // the RxFieldStateMic import above to restore the per-field mic.
        // action={
        //   <RxFieldStateMic
        //     id={id}
        //     label={`Dictate ${label.toLowerCase()}`}
        //     field={field}
        //     onChange={onChange}
        //   />
        // }
      >
        {label}
      </FieldLabel>

      <ProvenanceField provenance={field.provenance}>
        {rows ? (
          <Textarea
            id={id}
            rows={rows}
            maxLength={maxLength}
            value={field.value}
            placeholder="—"
            invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={controlClass}
            onChange={(e) => onChange(entered(e.target.value))}
          />
        ) : (
          <Input
            id={id}
            maxLength={maxLength}
            value={field.value}
            placeholder="—"
            invalid={Boolean(error)}
            aria-describedby={describedBy}
            autoComplete="off"
            className={controlClass}
            onChange={(e) => onChange(entered(e.target.value))}
          />
        )}
      </ProvenanceField>

      {error ? (
        <p id={`${id}-error`} className="mt-1 text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-caption text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

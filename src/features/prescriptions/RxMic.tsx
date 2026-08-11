import { MicButton } from '@/features/speech/MicButton'
import { heard, type FieldState } from './model'

/**
 * The pad's single point of contact with the dictation engine.
 *
 * Everything the microphone produces is `heard()` — never `entered()`. The
 * doctor said it, the machine wrote it down, and the pad renders it with a
 * "check me" rail until they touch it. Routing every mic through one component
 * is what makes that guarantee auditable rather than a convention.
 */
export function RxFieldMic({
  id,
  label,
  onText,
}: {
  /** The DOM id of the field this microphone fills. */
  id: string
  label: string
  onText: (text: string) => void
}) {
  return (
    <MicButton
      target={{ kind: 'field', id }}
      label={label}
      size="sm"
      onText={(text) => onText(text)}
    />
  )
}

/**
 * The common case: dictate into a `FieldState<string>`.
 *
 * Chunks are appended, never substituted — the engine delivers one settled
 * span at a time, and a second sentence must not eat the first. Appending also
 * means dictating into a field the doctor has already typed in adds to their
 * text instead of destroying it.
 */
export function RxFieldStateMic({
  id,
  label,
  field,
  onChange,
}: {
  id: string
  label: string
  field: FieldState<string>
  onChange: (next: FieldState<string>) => void
}) {
  return (
    <RxFieldMic
      id={id}
      label={label}
      onText={(text) => {
        const addition = text.trim()
        if (!addition) return
        const existing = field.value.trim()
        onChange(heard(existing ? `${existing} ${addition}` : addition))
      }}
    />
  )
}

/**
 * The whole-prescription microphone.
 *
 * Its target is `{ kind: 'prescription' }`, which is the engine's signal that
 * the caller will run the transcript through `parseDictation` rather than
 * dropping it into one box. Chunks arrive settled and in order; the pad
 * accumulates them and parses on the doctor's word, not automatically —
 * watching fields rewrite themselves mid-sentence is unnerving, and the
 * transcript is worth reading before it is filed.
 */
export function RxPrescriptionMic({
  onText,
  label = 'Dictate the prescription',
}: {
  onText: (text: string) => void
  label?: string
}) {
  return (
    <MicButton
      target={{ kind: 'prescription' }}
      label={label}
      showLabel
      onText={(text) => onText(text)}
    />
  )
}

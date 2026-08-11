import { useCallback } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDictation } from './useDictation'
import type { DictationTarget } from './useDictation'

export interface MicButtonProps {
  /** What this microphone fills. */
  target: DictationTarget
  /**
   * The accessible name. There is a default because most callers want the
   * same one — but there is never *no* name: an unlabelled microphone icon is
   * unusable with a screen reader and ambiguous with one's eyes.
   */
  label?: string
  size?: 'sm' | 'md'
  /**
   * One settled chunk at a time, in the order it was spoken. Never a partial —
   * a partial is a hypothesis, and writing one into a field means writing a
   * word the doctor did not say.
   */
  onText?: (text: string, target: DictationTarget) => void
  /** Render the label beside the icon as well as announcing it. */
  showLabel?: boolean
  /** Must match `GET /speech/config`. */
  sampleRate?: number
  disabled?: boolean
  className?: string
}

const SIZES = {
  sm: { button: 'size-control-sm', icon: 'size-3.5' },
  md: { button: 'size-control', icon: 'size-4' },
} as const

/**
 * Per-field dictation: idle → recording → processing.
 *
 * The ring around it tracks the input level, because the failure this control
 * exists to prevent is a doctor dictating a whole prescription into a muted
 * microphone. The ring is information, not decoration, so it carries
 * `data-motion-keep` and survives the global reduced-motion clamp.
 */
export function MicButton({
  target,
  label = 'Dictate',
  size = 'md',
  onText,
  showLabel = false,
  sampleRate,
  disabled = false,
  className,
}: MicButtonProps) {
  const dictation = useDictation({
    sampleRate,
    onFinal: (text, forTarget) => onText?.(text, forTarget),
  })

  const recording = dictation.isRecording
  const processing =
    !recording && (dictation.status === 'connecting' || dictation.status === 'closing')

  const toggle = useCallback(() => {
    if (recording) dictation.stop()
    else if (!processing) void dictation.start(target)
  }, [dictation, processing, recording, target])

  const state = dictation.error
    ? 'error'
    : recording
      ? 'recording'
      : processing
        ? 'processing'
        : 'idle'

  const announcement =
    state === 'recording'
      ? `${label}: recording. Press again to stop.`
      : state === 'processing'
        ? `${label}: finishing the transcript.`
        : state === 'error'
          ? `${label} failed. ${dictation.error ?? ''}`
          : ''

  const sizing = SIZES[size]

  return (
    <span className={cn('relative inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={recording ? `Stop dictating — ${label}` : label}
        aria-pressed={recording}
        data-state={state}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center rounded-md',
          'transition-[background-color,color,box-shadow] duration-fast ease-standard',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          'disabled:pointer-events-none disabled:opacity-55',
          sizing.button,
          recording
            ? 'bg-danger text-danger-fg shadow-sm'
            : processing
              ? 'bg-surface-raised text-text-muted'
              : 'text-text-muted hover:bg-surface-hover hover:text-text',
          !showLabel && 'px-0',
        )}
      >
        {recording && (
          <span
            aria-hidden
            data-motion-keep
            className="border-danger pointer-events-none absolute inset-0 rounded-md border"
            style={{
              transform: `scale(${1 + Math.min(1, dictation.level * 1.6) * 0.35})`,
              opacity: 0.15 + Math.min(1, dictation.level * 1.6) * 0.55,
              transition: 'transform 80ms linear, opacity 80ms linear',
            }}
          />
        )}
        {processing ? (
          <Loader2 aria-hidden className={cn(sizing.icon, 'animate-spin motion-reduce:animate-none')} />
        ) : recording ? (
          <Square aria-hidden className={sizing.icon} />
        ) : (
          <Mic aria-hidden className={sizing.icon} />
        )}
      </button>

      {showLabel && (
        <span className={cn('text-label', recording ? 'text-danger' : 'text-text-muted')}>
          {recording ? 'Listening…' : processing ? 'Finishing…' : label}
        </span>
      )}

      {/* State changes are announced rather than only drawn. The region is
          always mounted so a screen reader has something to observe. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </span>
  )
}

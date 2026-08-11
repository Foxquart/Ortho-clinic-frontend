import { forwardRef, useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

/*
 * `border-border` is a 1.3:1 hairline. On a white card that is not a visible
 * boundary, and a text field on a white card is identified by NOTHING ELSE —
 * WCAG 1.4.11 asks for 3:1. Every control in this file, in Controls.tsx and in
 * Combobox.tsx now rests on `border-field` (3.4:1 light / 3.8:1 dark) and
 * strengthens on hover. This is the single change that most affects how
 * "finished" a dense form looks.
 *
 * Disabled fills to the sunken ground rather than to `surface-raised` (white
 * in light mode, i.e. no change at all), so an inert field is legible AS inert.
 */
const FIELD_BASE = cn(
  'w-full min-w-0 bg-surface text-text placeholder:text-text-subtle',
  'border border-border-field rounded-md',
  'transition-[border-color,box-shadow,background-color] duration-fast ease-standard',
  'hover:border-border-strong',
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/35',
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-sunken disabled:text-text-subtle',
  'aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30',
)

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode
  /** Rendered inside the field on the right — units, a clear button, a hint. */
  slotRight?: React.ReactNode
  invalid?: boolean
  inputSize?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'h-control-sm px-2 text-caption',
  md: 'h-control px-2.5 text-body',
  lg: 'h-control-lg px-3 text-body',
} as const

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, iconLeft, slotRight, invalid, inputSize = 'md', ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        SIZES[inputSize],
        iconLeft && 'pl-8',
        slotRight && 'pr-8',
        className,
      )}
      {...props}
    />
  )

  if (!iconLeft && !slotRight) return field

  return (
    <div className="relative flex items-center">
      {iconLeft && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 flex text-text-subtle [&_svg]:size-4"
        >
          {iconLeft}
        </span>
      )}
      {field}
      {slotRight && (
        <span className="absolute right-2 flex items-center text-text-subtle [&_svg]:size-4">
          {slotRight}
        </span>
      )}
    </div>
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, 'resize-y px-2.5 py-2 text-body leading-relaxed', className)}
      {...props}
    />
  )
})

export interface FieldProps {
  label: React.ReactNode
  /** Persistent guidance. Shown above the error, never replaced by it. */
  hint?: React.ReactNode
  error?: string
  required?: boolean
  /** Marks a field the doctor may deliberately leave empty. */
  optionalLabel?: boolean
  className?: string
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
  }) => React.ReactNode
}

/**
 * Wraps a control with its label, hint and error, and wires the aria plumbing
 * so no call site has to remember it.
 */
export function Field({
  label,
  hint,
  error,
  required,
  optionalLabel,
  className,
  children,
}: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-label text-text-muted">
        <span>{label}</span>
        {required && (
          <span aria-hidden className="text-danger">
            *
          </span>
        )}
        {optionalLabel && !required && (
          <span className="text-caption text-text-subtle">optional</span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-caption text-text-subtle">
          {hint}
        </p>
      )}
      {/* The icon is not decoration: it is the second channel. An error that is
          only red is invisible to a deuteranope reading a form of otherwise
          identical grey labels. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-caption font-medium text-danger"
        >
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

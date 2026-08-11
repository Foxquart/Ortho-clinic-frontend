import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

const BARS = 14

/**
 * Input level meter.
 *
 * Its job is to answer one question — "is the microphone actually hearing
 * me?" — before the doctor talks for two minutes into a dead input. It decays
 * smoothly rather than tracking the raw peak, because a meter that flickers at
 * frame rate reads as noise instead of as signal.
 *
 * This animation IS the information, so it is exempt from the global
 * reduced-motion clamp via `data-motion-keep`.
 */
export function LevelMeter({
  level,
  active,
  className,
}: {
  /** Peak amplitude of the last frame, 0–1. */
  level: number
  active: boolean
  className?: string
}) {
  const [smoothed, setSmoothed] = useState(0)
  const target = useRef(0)
  target.current = active ? level : 0

  useEffect(() => {
    if (!active) {
      setSmoothed(0)
      return
    }
    let frame = 0
    const tick = () => {
      setSmoothed((prev) => {
        const next = target.current
        // Rise fast so a word registers immediately; fall slowly so the bar
        // stays readable between syllables.
        return next > prev ? next : prev + (next - prev) * 0.18
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  // Amplitude is linear but hearing is not; a mild curve makes quiet speech
  // visible without letting a loud room peg the meter.
  const normalised = Math.min(1, Math.pow(smoothed, 0.6) * 1.6)
  const litBars = Math.round(normalised * BARS)

  return (
    <div
      data-motion-keep
      role="meter"
      aria-label="Microphone input level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalised * 100)}
      className={cn('flex items-end gap-0.5', className)}
    >
      {Array.from({ length: BARS }, (_, i) => {
        const lit = active && i < litBars
        // The last two bars are the "too loud" zone.
        const hot = i >= BARS - 2
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              'w-1 rounded-full transition-[height,background-color] duration-75',
              lit ? (hot ? 'bg-warning' : 'bg-accent') : 'bg-border',
            )}
            style={{ height: `${6 + i * 0.8}px` }}
          />
        )
      })}
    </div>
  )
}

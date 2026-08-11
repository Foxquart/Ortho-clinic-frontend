import { useCallback, useEffect, useRef, useState } from 'react'
import { useMicrophone } from './useMicrophone'
import { useSpeechStream } from './useSpeechStream'
import type { StreamStatus } from './useSpeechStream'
import { ENGLISH_ASR_LANGUAGE } from './translation'

/**
 * What a recording is *for*. The engine treats both identically — it is the
 * caller that decides whether the settled text becomes a prescription or a
 * single field.
 */
export type DictationTarget =
  /** Full parse: the caller runs `parseDictation` over the settled text. */
  | { kind: 'prescription' }
  /** Raw text into one field, identified by its DOM id. */
  | { kind: 'field'; id: string }

export interface DictationOptions {
  /** Must match `GET /speech/config`; the backend validates rather than resamples. */
  sampleRate?: number
  /**
   * One settled chunk, as it lands. Called once per chunk with *that chunk's*
   * text, so a caller appending to a field never repeats itself. Partials are
   * never delivered here.
   */
  onFinal?: (text: string, target: DictationTarget) => void
  /** The whole settled transcript, once the stream has closed cleanly. */
  onComplete?: (text: string, target: DictationTarget) => void
  onError?: (message: string, target: DictationTarget | null) => void
}

export interface Dictation {
  target: DictationTarget | null
  isRecording: boolean
  status: StreamStatus
  /** Display only. A hypothesis that will be replaced. */
  partial: string
  /** Everything settled so far. */
  finalText: string
  error: string | null
  /** Peak input level, 0–1, for a meter. */
  level: number
  start: (target: DictationTarget) => Promise<void>
  stop: () => void
  /** Discard the recording and emit nothing. */
  cancel: () => void
  reset: () => void
}

/**
 * The React layer both dictation modes share.
 *
 * Three things it guarantees, all of them learned the hard way:
 *
 *  - **The language is pinned to `en-IN` here, in the client.** The server's
 *    own default was what produced Bengali gibberish from English speech. That
 *    default has been changed, but a prescription must not depend on a server
 *    setting anyone can flip.
 *  - **No translation.** `translateTo` stays null: translation is a separate
 *    feature and on this path it would only add latency to a transcript nobody
 *    is going to read in Bengali.
 *  - **Only `is_final` text ever reaches a caller.** Partials are hypotheses;
 *    acting on one means writing a word the doctor did not say.
 */
export function useDictation(options: DictationOptions = {}): Dictation {
  const stream = useSpeechStream()
  const [target, setTarget] = useState<DictationTarget | null>(null)
  const [level, setLevel] = useState(0)
  const [startError, setStartError] = useState<string | null>(null)

  const mic = useMicrophone({
    sampleRate: options.sampleRate ?? 16000,
    onFrame: stream.sendAudio,
    onLevel: setLevel,
  })

  // Callbacks and mutable bookkeeping the socket handlers read. They outlive
  // the render that created them, so none of this may be a captured value.
  const optionsRef = useRef(options)
  optionsRef.current = options
  const targetRef = useRef<DictationTarget | null>(null)
  /** How many settled chunks have already been handed to the caller. */
  const emittedRef = useRef(0)
  const cancelledRef = useRef(false)
  /** True from `start` until the socket has actually finished closing. */
  const activeRef = useRef(false)
  const previousStatus = useRef<StreamStatus>('idle')

  const finalText = stream.transcript
  const finalTextRef = useRef(finalText)
  finalTextRef.current = finalText

  const { stop: micStop, start: micStart } = mic
  const { connect, disconnect, reset: resetStream, stop: stopStream } = stream

  /* ---- emitting -------------------------------------------------------- */

  useEffect(() => {
    if (cancelledRef.current) return
    const current = targetRef.current
    if (!current) return
    for (let i = emittedRef.current; i < stream.finals.length; i++) {
      const text = stream.finals[i].text
      if (text) optionsRef.current.onFinal?.(text, current)
    }
    emittedRef.current = stream.finals.length
  }, [stream.finals])

  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = stream.status

    if (stream.status === 'error') {
      micStop()
      setLevel(0)
      activeRef.current = false
      optionsRef.current.onError?.(
        stream.error ?? 'The transcription stream failed.',
        targetRef.current,
      )
      return
    }

    if (stream.status === 'closed' && previous !== 'closed' && previous !== 'idle') {
      activeRef.current = false
      micStop()
      setLevel(0)
      const current = targetRef.current
      if (current && !cancelledRef.current) {
        optionsRef.current.onComplete?.(finalTextRef.current, current)
      }
    }
  }, [stream.status, stream.error, micStop])

  /* ---- controls -------------------------------------------------------- */

  const start = useCallback(
    async (next: DictationTarget) => {
      // One recording at a time. The socket refuses a second connection while
      // the first is still open, and a mic opened against no socket records
      // into nothing.
      if (activeRef.current) return
      activeRef.current = true
      cancelledRef.current = false
      emittedRef.current = 0
      setStartError(null)
      resetStream()
      targetRef.current = next
      setTarget(next)

      try {
        await connect({ languageCode: ENGLISH_ASR_LANGUAGE, translateTo: null })
        await micStart()
      } catch (raw) {
        disconnect()
        micStop()
        setLevel(0)
        activeRef.current = false
        targetRef.current = null
        setTarget(null)
        const message = raw instanceof Error ? raw.message : 'Could not start dictation.'
        setStartError(message)
        optionsRef.current.onError?.(message, next)
      }
    },
    [connect, disconnect, micStart, micStop, resetStream],
  )

  const stop = useCallback(() => {
    micStop()
    setLevel(0)
    // Ask the server to flush. The socket closes itself once it has, and the
    // `closed` transition above is what releases the guard.
    stopStream()
  }, [micStop, stopStream])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    activeRef.current = false
    micStop()
    setLevel(0)
    disconnect()
    resetStream()
    emittedRef.current = 0
    targetRef.current = null
    setTarget(null)
    setStartError(null)
  }, [disconnect, micStop, resetStream])

  const reset = useCallback(() => {
    cancelledRef.current = false
    emittedRef.current = 0
    targetRef.current = null
    setTarget(null)
    setStartError(null)
    resetStream()
  }, [resetStream])

  // The microphone is never left open behind a navigation, an error, or an
  // unmount. There is no indicator in this app loud enough to make up for a
  // recording light nobody asked for.
  useEffect(() => {
    return () => {
      micStop()
      disconnect()
    }
  }, [disconnect, micStop])

  return {
    target,
    isRecording: mic.state === 'recording',
    status: stream.status,
    partial: stream.partial,
    finalText,
    error: startError ?? stream.error ?? mic.error?.message ?? null,
    level,
    start,
    stop,
    cancel,
    reset,
  }
}

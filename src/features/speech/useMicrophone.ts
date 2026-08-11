import { useCallback, useRef, useState } from 'react'

export interface MicrophoneOptions {
  /** Must match what `/speech/config` reports — the backend validates it. */
  sampleRate: number
  frameSamples?: number
  onFrame: (pcm: ArrayBuffer) => void
  onLevel?: (peak: number) => void
}

export type MicState = 'idle' | 'starting' | 'recording' | 'error'

export class MicrophoneError extends Error {
  readonly kind: 'insecure-context' | 'permission' | 'no-device' | 'sample-rate' | 'unknown'
  constructor(kind: MicrophoneError['kind'], message: string) {
    super(message)
    this.name = 'MicrophoneError'
    this.kind = kind
  }
}

/**
 * Microphone capture that produces exactly the frames the backend accepts.
 *
 * Two non-obvious requirements are handled here:
 *  1. `getUserMedia` needs a secure context — https or localhost. On a LAN IP
 *     it fails in a way that reads as "no microphone", so we detect it first
 *     and say what is actually wrong.
 *  2. The worklet node must reach the destination or the graph is never
 *     pulled and no audio flows — but routing the mic to the speakers would
 *     echo. We connect through a zero-gain node: the graph runs, nothing is
 *     audible.
 */
export function useMicrophone({
  sampleRate,
  frameSamples = Math.round(sampleRate / 10),
  onFrame,
  onLevel,
}: MicrophoneOptions) {
  const [state, setState] = useState<MicState>('idle')
  const [error, setError] = useState<MicrophoneError | null>(null)

  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)

  // Keep the latest callbacks without restarting capture when they change.
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const onLevelRef = useRef(onLevel)
  onLevelRef.current = onLevel

  const stop = useCallback(() => {
    nodeRef.current?.port.close()
    nodeRef.current?.disconnect()
    nodeRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    void contextRef.current?.close()
    contextRef.current = null

    setState('idle')
  }, [])

  const start = useCallback(async () => {
    setError(null)

    if (!window.isSecureContext) {
      const err = new MicrophoneError(
        'insecure-context',
        'The microphone needs a secure context. Open the app over https, or on localhost — a LAN IP address will not work.',
      )
      setError(err)
      setState('error')
      throw err
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new MicrophoneError('no-device', 'This browser cannot capture audio.')
      setError(err)
      setState('error')
      throw err
    }

    setState('starting')
    try {
      // Ask for the rate we need up front; some devices honour it and save a
      // resample we are not allowed to do anyway.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const context = new AudioContext({ sampleRate })
      contextRef.current = context

      // The backend rejects a mismatch rather than resampling, and a wrong
      // declared rate makes the transcript plausible garbage — so fail here.
      if (Math.round(context.sampleRate) !== sampleRate) {
        stream.getTracks().forEach((t) => t.stop())
        await context.close()
        contextRef.current = null
        streamRef.current = null
        throw new MicrophoneError(
          'sample-rate',
          `This device runs its audio at ${Math.round(context.sampleRate)} Hz and will not switch to ${sampleRate} Hz. Recording would be transcribed incorrectly.`,
        )
      }

      await context.audioWorklet.addModule('/pcm-worklet.js')

      const source = context.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(context, 'pcm-encoder', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: { frameSamples },
      })
      nodeRef.current = node

      node.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { type: string; payload?: ArrayBuffer; peak?: number }
        if (data.type !== 'frame' || !data.payload) return
        onLevelRef.current?.(data.peak ?? 0)
        onFrameRef.current(data.payload)
      }

      // Zero gain: the graph must reach the destination to be pulled, but the
      // doctor must not hear themselves.
      const sink = context.createGain()
      sink.gain.value = 0

      source.connect(node)
      node.connect(sink)
      sink.connect(context.destination)

      await context.resume()
      setState('recording')
    } catch (raw) {
      const err =
        raw instanceof MicrophoneError
          ? raw
          : raw instanceof DOMException &&
              (raw.name === 'NotAllowedError' || raw.name === 'SecurityError')
            ? new MicrophoneError(
                'permission',
                'Microphone access was blocked. Allow it in the browser’s site settings and try again.',
              )
            : raw instanceof DOMException && raw.name === 'NotFoundError'
              ? new MicrophoneError('no-device', 'No microphone was found on this device.')
              : new MicrophoneError(
                  'unknown',
                  raw instanceof Error ? raw.message : 'Could not start the microphone.',
                )
      stop()
      setError(err)
      setState('error')
      throw err
    }
  }, [sampleRate, frameSamples, stop])

  const setMuted = useCallback((muted: boolean) => {
    nodeRef.current?.port.postMessage({ type: 'mute', value: muted })
  }, [])

  return { state, error, start, stop, setMuted }
}

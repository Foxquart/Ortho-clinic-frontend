import { useCallback, useEffect, useRef, useState } from 'react'
import { websocketUrl } from '@/api/http'

/** One settled (`is_final`) chunk of the live transcript. */
export interface TranscriptLine {
  /** 0-based index of this final chunk within the connection. */
  sequence: number
  text: string
  languageCode: string | null
}

export type StreamStatus = 'idle' | 'connecting' | 'ready' | 'closing' | 'closed' | 'error'

export interface SpeechStreamOptions {
  /**
   * Pin the connection to one language, e.g. `en-IN`. Mutually exclusive with
   * `identifyMultipleLanguages` — the server rejects both at once, so this hook
   * sends only one of them.
   */
  languageCode?: string | null
  /** Detect among the server's configured options instead of pinning. */
  identifyMultipleLanguages?: boolean
}

interface ServerReady {
  type: 'ready'
  provider?: string
  sample_rate_hz?: number
  language_code?: string | null
  identify_multiple_languages?: boolean
}

/** The server's confirmation of what this connection is really doing. */
export interface NegotiatedStream {
  languageCode: string | null
  identifyMultipleLanguages: boolean
}
interface ServerTranscript {
  type: 'transcript'
  text: string
  is_final: boolean
  language_code?: string | null
}
interface ServerError {
  type: 'error'
  message: string
}
interface ServerClosed {
  type: 'closed'
}
type ServerMessage = ServerReady | ServerTranscript | ServerError | ServerClosed

function buildStreamUrl(options: SpeechStreamOptions): string {
  const params = new URLSearchParams()
  // Mutually exclusive: identification wins if both were somehow passed, since
  // sending both is the one combination the server refuses.
  if (options.identifyMultipleLanguages) {
    params.set('identify_multiple_languages', 'true')
  } else if (options.languageCode) {
    params.set('language_code', options.languageCode)
  }
  const query = params.toString()
  return websocketUrl('/speech/stream') + (query ? `?${query}` : '')
}

/**
 * Live transcription socket.
 *
 * Two kinds of text arrive here and they are kept strictly apart:
 *
 *  - **partials** (`is_final: false`) are hypotheses that get replaced as the
 *    speaker continues. Display-only, never copied.
 *  - **finals** are stable and are the only thing anything downstream may act
 *    on.
 */
export function useSpeechStream() {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [finals, setFinals] = useState<TranscriptLine[]>([])
  const [partial, setPartial] = useState<string>('')
  const [serverSampleRate, setServerSampleRate] = useState<number | null>(null)
  const [negotiated, setNegotiated] = useState<NegotiatedStream | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  /**
   * Next final's sequence number. Incremented for **every** final message, even
   * an empty one we do not display, so our numbering stays in step with the
   * server's count of "the Nth final transcript".
   */
  const sequenceRef = useRef(0)

  // The socket handlers outlive the render that created them, so anything they
  // read must come from a ref rather than a captured value.
  const statusRef = useRef<StreamStatus>('idle')
  statusRef.current = status

  const reset = useCallback(() => {
    setFinals([])
    setPartial('')
    setNegotiated(null)
    setError(null)
    sequenceRef.current = 0
  }, [])

  const connect = useCallback(async (options: SpeechStreamOptions = {}): Promise<void> => {
    if (socketRef.current) return
    setStatus('connecting')
    statusRef.current = 'connecting'
    setError(null)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(buildStreamUrl(options))
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        let message: ServerMessage
        try {
          message = JSON.parse(event.data) as ServerMessage
        } catch {
          return
        }

        switch (message.type) {
          case 'ready':
            setServerSampleRate(message.sample_rate_hz ?? null)
            setNegotiated({
              languageCode: message.language_code ?? null,
              identifyMultipleLanguages: message.identify_multiple_languages ?? false,
            })
            setStatus('ready')
            statusRef.current = 'ready'
            if (!settled) {
              settled = true
              resolve()
            }
            break

          case 'transcript':
            if (message.is_final) {
              const sequence = sequenceRef.current++
              const text = message.text.trim()
              // An empty final still consumed a sequence number above; it just
              // has nothing to show.
              if (text) {
                setFinals((prev) => [
                  ...prev,
                  { sequence, text, languageCode: message.language_code ?? null },
                ])
              }
              setPartial('')
            } else {
              setPartial(message.text)
            }
            break

          case 'error':
            setError(message.message)
            setStatus('error')
            statusRef.current = 'error'
            break

          case 'closed':
            setStatus('closed')
            statusRef.current = 'closed'
            break
        }
      }

      socket.onerror = () => {
        // The handshake for an unauthenticated socket is rejected before it is
        // accepted, so the browser surfaces only a generic error here; the
        // close code below carries the real reason.
        if (!settled) {
          settled = true
          setStatus('error')
          statusRef.current = 'error'
          setError('Could not open the transcription stream.')
          reject(new Error('websocket error'))
        }
      }

      socket.onclose = (event) => {
        socketRef.current = null

        // An unauthenticated socket is closed *before* it is accepted, so
        // uvicorn rejects the HTTP handshake with a 403 and the browser
        // reports the generic abnormal-closure code 1006 — never the 1008 the
        // docs describe. The reliable signal is therefore "closed without
        // ever having received `ready`".
        const neverOpened = !settled
        if (event.code === 1008 || (neverOpened && event.code === 1006)) {
          setError(
            'The transcription stream would not accept this session. Sign in again, and check that the page and the API share a hostname.',
          )
          setStatus('error')
          statusRef.current = 'error'
        } else if (statusRef.current !== 'error') {
          setStatus('closed')
          statusRef.current = 'closed'
        }

        if (!settled) {
          settled = true
          reject(new Error(`websocket closed (${event.code})`))
        }
      }
    })
  }, [])

  const sendAudio = useCallback((pcm: ArrayBuffer) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(pcm)
  }, [])

  /** Ask the server to flush and finish. Does not close the socket itself. */
  const stop = useCallback(() => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      setStatus('closing')
      statusRef.current = 'closing'
      socket.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  const disconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setStatus('idle')
    statusRef.current = 'idle'
  }, [])

  useEffect(() => () => socketRef.current?.close(), [])

  const transcript = finals.map((f) => f.text).join(' ')

  return {
    status,
    error,
    finals,
    partial,
    negotiated,
    transcript,
    serverSampleRate,
    connect,
    sendAudio,
    stop,
    disconnect,
    reset,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { websocketUrl } from '@/api/http'

/** One settled (`is_final`) chunk of the live transcript. */
export interface TranscriptLine {
  /**
   * 0-based index of this final chunk within the connection. This is the key
   * the server's `translation` messages carry in `sequence`, so it — and not
   * array position — is what ties an English line to its Bengali one.
   */
  sequence: number
  text: string
  languageCode: string | null
}

/**
 * What happened to one line's translation. A line with no entry at all is
 * either still in flight or was never attempted; the screen decides which,
 * because only it knows whether the stream is still open.
 */
export interface TranslationLine {
  status: 'done' | 'failed'
  /** The translated text. Empty when `status` is `failed`. */
  text: string
  /** The server's own words for the failure. Never our invention. */
  message?: string
  sourceLanguageCode?: string | null
  targetLanguageCode?: string | null
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
  /** Target language for per-final translation, e.g. `bn`. Omit to disable. */
  translateTo?: string | null
}

interface ServerReady {
  type: 'ready'
  provider?: string
  sample_rate_hz?: number
  language_code?: string | null
  identify_multiple_languages?: boolean
  /**
   * What the server will *actually* translate to on this connection. `null`
   * means it will not — including when we asked and it could not. This is the
   * authoritative answer; what we put in the query string is only a request.
   */
  translate_to?: string | null
}

/** The server's confirmation of what this connection is really doing. */
export interface NegotiatedStream {
  languageCode: string | null
  identifyMultipleLanguages: boolean
  translateTo: string | null
}
interface ServerTranscript {
  type: 'transcript'
  text: string
  is_final: boolean
  language_code?: string | null
}
interface ServerTranslation {
  type: 'translation'
  text: string
  source_text?: string
  source_language_code?: string | null
  target_language_code?: string | null
  sequence: number
}
interface ServerError {
  type: 'error'
  message: string
  /**
   * `"translation"` means one chunk's translation failed and the transcription
   * stream is still alive. An error with **no** scope is the old, fatal kind.
   */
  scope?: string
  /** Present only if the server can attribute the failure to one chunk. */
  sequence?: number
}
interface ServerClosed {
  type: 'closed'
}
type ServerMessage = ServerReady | ServerTranscript | ServerTranslation | ServerError | ServerClosed

function buildStreamUrl(options: SpeechStreamOptions): string {
  const params = new URLSearchParams()
  // Mutually exclusive: identification wins if both were somehow passed, since
  // sending both is the one combination the server refuses.
  if (options.identifyMultipleLanguages) {
    params.set('identify_multiple_languages', 'true')
  } else if (options.languageCode) {
    params.set('language_code', options.languageCode)
  }
  if (options.translateTo) params.set('translate_to', options.translateTo)
  const query = params.toString()
  return websocketUrl('/speech/stream') + (query ? `?${query}` : '')
}

/**
 * Live transcription socket.
 *
 * Three kinds of text arrive here and they are kept strictly apart:
 *
 *  - **partials** (`is_final: false`) are hypotheses that get replaced as the
 *    speaker continues. Display-only, never translated, never copied.
 *  - **finals** are stable and are the only thing anything downstream may act
 *    on.
 *  - **translations** arrive *after* the final they belong to, with a delay,
 *    and may never arrive at all. They are stored in a map keyed by `sequence`
 *    rather than appended to a list, so a late or missing translation can never
 *    shift a Bengali line onto the wrong English one.
 */
export function useSpeechStream() {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [finals, setFinals] = useState<TranscriptLine[]>([])
  const [partial, setPartial] = useState<string>('')
  const [translations, setTranslations] = useState<Record<number, TranslationLine>>({})
  const [translationNotice, setTranslationNotice] = useState<string | null>(null)
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
    setTranslations({})
    setTranslationNotice(null)
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
              translateTo: message.translate_to ?? null,
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

          case 'translation':
            setTranslations((prev) => ({
              ...prev,
              // Unconditional overwrite: a translation that lands after we gave
              // up on a line is still the right answer for it.
              [message.sequence]: {
                status: 'done',
                text: message.text,
                sourceLanguageCode: message.source_language_code ?? null,
                targetLanguageCode: message.target_language_code ?? null,
              },
            }))
            break

          case 'error':
            if (message.scope === 'translation') {
              // Scoped: translation failed, transcription did not. The stream
              // stays open and the English column keeps filling.
              setTranslationNotice(message.message)
              setTranslations((prev) => {
                const next = { ...prev }
                if (typeof message.sequence === 'number') {
                  next[message.sequence] = {
                    status: 'failed',
                    text: '',
                    message: message.message,
                  }
                } else {
                  // No `sequence` means the whole connection cannot translate —
                  // the server sends exactly one of these right after `ready`.
                  // Any line already waiting is therefore dead; mark those, and
                  // let a later `translation` message overwrite any we misjudged.
                  for (let i = 0; i < sequenceRef.current; i++) {
                    if (!next[i]) {
                      next[i] = { status: 'failed', text: '', message: message.message }
                    }
                  }
                }
                return next
              })
              break
            }
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
  const translatedTranscript = finals
    .map((f) => translations[f.sequence])
    .filter((t): t is TranslationLine => t?.status === 'done')
    .map((t) => t.text)
    .join(' ')

  /**
   * True while a translation could still arrive. `closing` is deliberately
   * included: after `{"type":"stop"}` the server waits up to its
   * `translation_timeout_seconds` for in-flight translations before it sends
   * `closed`, so Bengali lines legitimately keep landing after the doctor has
   * already pressed Stop. Clearing pending rows at that moment would throw away
   * text that is seconds from arriving.
   */
  const translationsPossible = status === 'connecting' || status === 'ready' || status === 'closing'

  return {
    status,
    error,
    finals,
    partial,
    translations,
    translationNotice,
    translationsPossible,
    negotiated,
    transcript,
    translatedTranscript,
    serverSampleRate,
    connect,
    sendAudio,
    stop,
    disconnect,
    reset,
  }
}

/**
 * Microphone → 16-bit PCM frames, on the audio thread.
 *
 * The backend validates the declared sample rate rather than resampling, so
 * the AudioContext must already be running at the rate `/speech/config`
 * reports (16000). This worklet only buffers and converts; it never resamples.
 *
 * Float32 [-1, 1] → Int16 [-32768, 32767], little-endian, mono. Frames are
 * emitted at a fixed size (~100 ms) because a stream of 128-sample render
 * quanta would be ~8 messages per 10 ms and would swamp the socket.
 */
class PCMEncoderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const frameSamples = options?.processorOptions?.frameSamples ?? 1600 // 100ms @ 16kHz
    this._frameSamples = frameSamples
    this._buffer = new Float32Array(frameSamples)
    this._offset = 0
    this._muted = false

    this.port.onmessage = (event) => {
      if (event.data?.type === 'mute') this._muted = Boolean(event.data.value)
    }
  }

  /** Peak amplitude of the frame, for the level meter. */
  static _peak(frame) {
    let peak = 0
    for (let i = 0; i < frame.length; i++) {
      const v = frame[i] < 0 ? -frame[i] : frame[i]
      if (v > peak) peak = v
    }
    return peak
  }

  _flush() {
    const pcm = new Int16Array(this._frameSamples)
    for (let i = 0; i < this._frameSamples; i++) {
      // Clamp before scaling: values slightly outside [-1,1] happen and would
      // wrap around into loud noise otherwise.
      const s = Math.max(-1, Math.min(1, this._buffer[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    this.port.postMessage(
      { type: 'frame', payload: pcm.buffer, peak: PCMEncoderProcessor._peak(this._buffer) },
      [pcm.buffer],
    )
    this._offset = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = this._muted ? 0 : channel[i]
      if (this._offset === this._frameSamples) this._flush()
    }

    return true
  }
}

registerProcessor('pcm-encoder', PCMEncoderProcessor)

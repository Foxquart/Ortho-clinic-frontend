/**
 * The hero's animated backdrop: a field of concentric "range-of-motion" arcs
 * with a goniometer tick ring — a quiet nod to orthopaedic measurement rather
 * than a decorative gradient blob. Inline canvas, no assets.
 *
 * Safe by construction:
 *  - Colours are read from the theme tokens (`--c-accent`, `--c-text`,
 *    `--c-border`) and re-read when the theme flips, so it works in light/dark.
 *  - Device pixel ratio is capped; the loop pauses when the tab is hidden.
 *  - Under `prefers-reduced-motion` it paints a single static frame and never
 *    starts a rAF loop.
 *  - The `<canvas>` is decorative (`aria-hidden`); if it never runs, the CSS
 *    wash and grid behind it still make the hero complete.
 */
import { useEffect, useRef } from 'react'

interface Palette {
  accent: string
  text: string
  border: string
}

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback
  return {
    accent: get('--c-accent', '#3a41b5'),
    text: get('--c-text', '#0e1015'),
    border: get('--c-border', '#e1e3e9'),
  }
}

export function HeroBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let running = true
    let palette = readPalette()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)

      // Focal point sits top-right on wide screens, higher-centre on narrow.
      const wide = width > 720
      const cx = wide ? width * 0.74 : width * 0.5
      const cy = wide ? height * 0.4 : height * 0.34
      const maxR = Math.min(width, height) * (wide ? 0.62 : 0.5)

      const spin = t * 0.00004
      const breathe = Math.sin(t * 0.0006) * 0.5 + 0.5 // 0..1

      // Concentric arcs — offset centres give the topographic / ROM feel.
      const rings = 9
      for (let i = 0; i < rings; i++) {
        const p = i / (rings - 1)
        const r = maxR * (0.18 + p * 0.82)
        const ox = Math.cos(spin * (1 + p) + i) * maxR * 0.05
        const oy = Math.sin(spin * (1 + p) + i) * maxR * 0.05
        const start = spin * (1 + p * 0.5) + i * 0.6
        const sweep = Math.PI * (0.7 + 0.9 * ((i % 3) / 2)) + breathe * 0.4

        ctx.beginPath()
        ctx.arc(cx + ox, cy + oy, r, start, start + sweep)
        ctx.strokeStyle = palette.accent
        ctx.globalAlpha = 0.05 + (1 - p) * 0.16
        ctx.lineWidth = 1.25
        ctx.stroke()
      }

      // Goniometer tick ring.
      const tickR = maxR * 0.92
      const ticks = 72
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = palette.text
      ctx.lineWidth = 1
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2 + spin * 2
        const major = i % 6 === 0
        const r1 = tickR
        const r2 = tickR - (major ? 12 : 6)
        ctx.globalAlpha = major ? 0.22 : 0.1
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
        ctx.stroke()
      }

      // A single travelling radius, like a measuring arm.
      const armA = spin * 6
      ctx.globalAlpha = 0.28
      ctx.strokeStyle = palette.accent
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(armA) * tickR, cy + Math.sin(armA) * tickR)
      ctx.stroke()

      // Hub.
      ctx.globalAlpha = 0.5
      ctx.fillStyle = palette.accent
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = 1
    }

    const loop = (t: number) => {
      if (!running) return
      draw(t)
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      cancelAnimationFrame(raf)
      resize()
      if (reduce.matches) {
        draw(6000) // one composed static frame
        return
      }
      running = true
      raf = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!reduce.matches) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }

    const onThemeChange = () => {
      palette = readPalette()
      if (reduce.matches) draw(6000)
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (reduce.matches) draw(6000)
    })
    ro.observe(canvas)

    const themeObserver = new MutationObserver(onThemeChange)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onThemeChange)
    reduce.addEventListener('change', start)
    document.addEventListener('visibilitychange', onVisibility)

    start()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      themeObserver.disconnect()
      media.removeEventListener('change', onThemeChange)
      reduce.removeEventListener('change', start)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="hero-backdrop" aria-hidden data-parallax data-parallax-speed="12">
      <div className="hero-grid" />
      <canvas ref={canvasRef} />
    </div>
  )
}

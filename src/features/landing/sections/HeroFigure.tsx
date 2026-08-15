/**
 * Hero motif — an authored, animated line-art runner.
 *
 * Not stock photography: a luminous stroke figure with articulated hip, knee,
 * ankle and shoulder pivots, running in place. The joints carry accent dots
 * (this is an orthopaedic practice; joints are the subject), and a faint
 * dotted range-of-motion arc sweeps the stride. Drawn in on load, then loops.
 *
 * MOTION CONTRACT: the SVG's painted state IS the finished figure in a natural
 * mid-stride pose. GSAP runs only inside the reduced-motion "no-preference"
 * branch: it draws the strokes in, then runs the gait cycle. With reduced
 * motion or no JS, the figure stands fully drawn and still.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

/* Joint coordinates in the 640x760 viewBox. The figure faces left-to-right. */
const HIP = { x: 330, y: 360 }
const SHOULDER = { x: 352, y: 205 }
const KNEE_F = { x: 398, y: 470 } // front leg knee (drawn pose)
const KNEE_B = { x: 268, y: 462 } // back leg knee

export function HeroFigure() {
  const ref = useRef<SVGSVGElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const strokes = gsap.utils.toArray<SVGPathElement>('[data-draw]')
        gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 })
        gsap.set('[data-fade]', { autoAlpha: 0 })

        const intro = gsap.timeline({ defaults: { ease: 'power2.out' } })
        intro
          .to(strokes, { strokeDashoffset: 0, duration: 1.2, stagger: 0.08 }, 0)
          .to('[data-fade]', { autoAlpha: 1, duration: 0.7, stagger: 0.06 }, 0.55)

        /* Gait cycle: pendulum swings about each joint, phase-opposed. */
        const swing = (
          target: string,
          origin: { x: number; y: number },
          from: number,
          to: number,
          delay = 0,
        ) => {
          gsap.set(target, { svgOrigin: `${origin.x} ${origin.y}` , rotation: from })
          return gsap.to(target, {
            rotation: to,
            duration: 0.62,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            delay,
          })
        }

        const loops = [
          swing('[data-leg-front]', HIP, -34, 30),
          swing('[data-leg-back]', HIP, 30, -34),
          swing('[data-shin-front]', KNEE_F, 6, 52),
          swing('[data-shin-back]', KNEE_B, 52, 6),
          swing('[data-arm-front]', SHOULDER, 28, -30),
          swing('[data-arm-back]', SHOULDER, -30, 28),
          // The whole figure bobs a touch, like a real stride.
          gsap.to('[data-figure]', {
            y: -10,
            duration: 0.31,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          }),
        ]

        return () => {
          intro.kill()
          loops.forEach((l) => l.kill())
        }
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <svg
      ref={ref}
      viewBox="0 0 640 760"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-[-14%] h-[86%] w-auto -translate-y-1/2 opacity-95 sm:right-[-2%] lg:right-[4%]"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <filter id="lp-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Range-of-motion arc swept by the stride, behind the figure */}
      <path
        data-fade
        className="anat-arc"
        d="M 150 640 A 260 260 0 0 1 540 610"
        pathLength={1}
      />

      <g data-figure filter="url(#lp-glow)">
        {/* Back arm (behind torso) */}
        <g data-arm-back>
          <path
            data-draw
            className="anat-stroke"
            strokeWidth={13}
            opacity={0.55}
            d={`M ${SHOULDER.x} ${SHOULDER.y} L 290 268 L 322 322`}
            pathLength={1}
          />
        </g>

        {/* Back leg */}
        <g data-leg-back>
          <path
            data-draw
            className="anat-stroke"
            strokeWidth={16}
            opacity={0.55}
            d={`M ${HIP.x} ${HIP.y} L ${KNEE_B.x} ${KNEE_B.y}`}
            pathLength={1}
          />
          <g data-shin-back>
            <path
              data-draw
              className="anat-stroke"
              strokeWidth={14}
              opacity={0.55}
              d={`M ${KNEE_B.x} ${KNEE_B.y} L 236 570 L 206 578`}
              pathLength={1}
            />
          </g>
          <circle data-fade className="anat-pivot" cx={KNEE_B.x} cy={KNEE_B.y} r={7} opacity={0.65} />
        </g>

        {/* Torso, lightly leaning into the run */}
        <path
          data-draw
          className="anat-stroke"
          strokeWidth={18}
          d={`M ${HIP.x} ${HIP.y} C 336 310, 344 250, ${SHOULDER.x} ${SHOULDER.y}`}
          pathLength={1}
        />
        {/* Head */}
        <circle data-draw className="anat-stroke" strokeWidth={10} cx={372} cy={158} r={30} pathLength={1} />

        {/* Front leg */}
        <g data-leg-front>
          <path
            data-draw
            className="anat-stroke"
            strokeWidth={16}
            d={`M ${HIP.x} ${HIP.y} L ${KNEE_F.x} ${KNEE_F.y}`}
            pathLength={1}
          />
          <g data-shin-front>
            <path
              data-draw
              className="anat-stroke"
              strokeWidth={14}
              d={`M ${KNEE_F.x} ${KNEE_F.y} L 388 588 L 430 600`}
              pathLength={1}
            />
          </g>
          <circle data-fade className="anat-pivot" cx={KNEE_F.x} cy={KNEE_F.y} r={8} />
        </g>

        {/* Front arm */}
        <g data-arm-front>
          <path
            data-draw
            className="anat-stroke"
            strokeWidth={13}
            d={`M ${SHOULDER.x} ${SHOULDER.y} L 408 270 L 380 330`}
            pathLength={1}
          />
        </g>

        {/* The joints the practice cares for */}
        <circle data-fade className="anat-pivot" cx={HIP.x} cy={HIP.y} r={9} />
        <circle data-fade className="anat-pivot" cx={SHOULDER.x} cy={SHOULDER.y} r={7} />
      </g>
    </svg>
  )
}

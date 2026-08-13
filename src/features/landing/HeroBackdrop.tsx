/**
 * Hero motif — a stylised knee joint through its range of motion.
 *
 * This is the one hand-authored illustration on the page, and it is deliberate:
 * an orthopaedic clinic's hero should be anatomy, not a stock gradient. The
 * femur is fixed; the tibia hinges at the joint through a dotted range-of-motion
 * arc — the literal "move without limits" idea.
 *
 * MOTION CONTRACT: the SVG's painted state IS the finished drawing. GSAP only
 * runs inside the reduced-motion "no-preference" branch — it draws the strokes
 * in, then eases the tibia through a slow flexion. With reduced motion or no JS,
 * the figure simply sits at a natural mid-flexion pose, fully drawn.
 */
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

/** Knee pivot in SVG user units — the tibia rotates about this point. */
const PIVOT_X = 190
const PIVOT_Y = 250

export function HeroBackdrop() {
  const ref = useRef<SVGSVGElement>(null)
  const tibia = useRef<SVGGElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const strokes = gsap.utils.toArray<SVGPathElement>('[data-draw]')

        // Draw the anatomy in, longest bones first.
        gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 })
        gsap.set('[data-fade]', { autoAlpha: 0 })
        gsap.set(tibia.current, { svgOrigin: `${PIVOT_X} ${PIVOT_Y}`, rotation: 0 })

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
        tl.to(strokes, { strokeDashoffset: 0, duration: 1.3, stagger: 0.12 }, 0)
          .to('[data-fade]', { autoAlpha: 1, duration: 0.8, stagger: 0.1 }, 0.5)
          // Then breathe through a natural flexion range, forever, slowly.
          .to(
            tibia.current,
            {
              rotation: -34,
              duration: 3.4,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
            },
            1.1,
          )

        return () => tl.kill()
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <svg
      ref={ref}
      className="absolute top-1/2 right-[-6%] h-[92%] max-h-[720px] w-auto -translate-y-1/2 opacity-90 sm:right-[2%] lg:right-[6%]"
      viewBox="0 0 380 520"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Range-of-motion arc + wedge guides (fixed, centred on the pivot) */}
      <g data-fade>
        <path
          className="anat-arc"
          d="M 235 461 A 216 216 0 0 0 66 424"
          pathLength={1}
        />
        <line className="anat-arc" x1={PIVOT_X} y1={PIVOT_Y} x2={235} y2={461} />
        <line className="anat-arc" x1={PIVOT_X} y1={PIVOT_Y} x2={66} y2={424} />
      </g>

      {/* Femur (fixed): thick rounded bone + condyle head */}
      <path
        data-draw
        className="anat-stroke"
        strokeWidth={20}
        d="M 168 52 C 172 128, 184 192, 190 236"
        pathLength={1}
      />
      <circle
        data-fade
        className="anat-bone"
        cx={PIVOT_X}
        cy={PIVOT_Y}
        r={27}
      />

      {/* Patella (kneecap) */}
      <ellipse
        data-fade
        className="anat-stroke"
        strokeWidth={3}
        cx={150}
        cy={246}
        rx={12}
        ry={18}
        transform="rotate(-12 150 246)"
      />

      {/* Tibia + fibula (hinging group, rotates about the pivot) */}
      <g ref={tibia}>
        <path
          data-draw
          className="anat-stroke"
          strokeWidth={18}
          d="M 194 264 C 199 332, 205 402, 210 462"
          pathLength={1}
        />
        <path
          data-draw
          className="anat-stroke"
          strokeWidth={6}
          d="M 214 280 C 219 340, 223 402, 226 452"
          pathLength={1}
        />
        {/* Foot hint */}
        <path
          data-draw
          className="anat-stroke"
          strokeWidth={7}
          d="M 202 466 L 248 470"
          pathLength={1}
        />
      </g>

      {/* Pivot marker, on top */}
      <circle data-fade className="anat-pivot" cx={PIVOT_X} cy={PIVOT_Y} r={4.5} />
    </svg>
  )
}

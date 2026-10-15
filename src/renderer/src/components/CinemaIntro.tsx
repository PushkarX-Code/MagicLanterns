import { useEffect, useRef } from 'react'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'
import { gsap, reduceMotion } from '../design/motion'
import { cinemaSound } from '../lib/cinemaSound'

gsap.registerPlugin(DrawSVGPlugin, MorphSVGPlugin)

// The way into Cinema Mode, about four seconds; any key hurries it.
// The Beacon draws itself in light and its core rises. Then every part plays its own role in becoming a pair
// of headphones: the mark gathers itself (a small dip), the core swells into a drop and splits in two, the
// halves fly apart squashing as they go and land as ear cups with a bounce, the outer arch becomes the band
// and the middle arch follows into its cushion; both give a little at the cups' impact and settle, and the
// ear cushions slide out from inside each cup to sit against the ear. Sound
// ripples out from each side and the name arrives, then the light goes down into the lobby.

const BEACON = {
  outer: 'M232 800 L232 512 A280 280 0 0 1 792 512 L792 800',
  middle: 'M342 800 L342 512 A170 170 0 0 1 682 512 L682 800',
  core: 'M452 800 L452 520 A60 60 0 0 1 572 520 L572 800 Z'
}

/** A rounded ear cup (or ear cushion), centred on x. */
const cup = (cx: number, top = 580, w = 190, h = 300): string => {
  const r = w / 2
  return `M${cx - r} ${top + r} A${r} ${r} 0 0 1 ${cx + r} ${top + r} L${cx + r} ${top + h - r} A${r} ${r} 0 0 1 ${cx - r} ${top + h - r} Z`
}
const PHONES = {
  band: 'M232 690 L232 512 A280 280 0 0 1 792 512 L792 690',
  cushion: 'M290 600 L290 512 A222 222 0 0 1 734 512 L734 600',
  drop: cup(512), // the swollen core, before it splits
  travel: 280, // each cup's distance from the centre
  padLeft: cup(290, 620, 70, 220), // the cushions, on the inner side of each cup
  padRight: cup(734, 620, 70, 220)
}

/** Sound leaving one ear cup: a short arc facing outward. */
const wave = (side: 1 | -1, r: number): string => {
  const cx = side < 0 ? 232 : 792
  const cy = 735
  const a = (deg: number): string => `${cx + side * r * Math.cos((deg * Math.PI) / 180)} ${cy + r * Math.sin((deg * Math.PI) / 180)}`
  return `M${a(-36)} A${r} ${r} 0 0 ${side < 0 ? 0 : 1} ${a(36)}`
}

export function CinemaIntro({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (reduceMotion()) {
      onDone()
      return
    }
    const q = gsap.utils.selector(el)
    const [left, right] = [q('.ci-core')[0], q('.ci-right')[0]]
    const tl = gsap.timeline({ onComplete: onDone })
    cinemaSound.intro()
    gsap.set(right, { opacity: 0 })
    gsap.set(q('.ci-wave'), { opacity: 0, scale: 0.6, transformOrigin: (i: number) => (i % 2 ? '0% 50%' : '100% 50%') })
    gsap.set(q('.ci-mark'), { transformOrigin: '50% 70%' })

    // 1. The Beacon draws itself from the top of each arch outward, and the core rises.
    tl.fromTo(q('.ci-outer, .ci-middle'), { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1, ease: 'power3.inOut', stagger: 0.14 })
      .fromTo(left, { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.6, ease: 'back.out(1.6)' }, 0.55)

      // 2. Gathering: the whole mark dips a touch, as if drawing breath.
      .addLabel('m', 1.35)
      .to(q('.ci-mark'), { scale: 0.965, duration: 0.18, ease: 'power2.in' }, 'm')
      .to(q('.ci-mark'), { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 'm+=0.18')

      // 3. The core swells into a drop (its twin hidden behind it)...
      .set(right, { opacity: 1 }, 'm+=0.05')
      .to([left, right], { morphSVG: { shape: PHONES.drop, type: 'rotational' }, duration: 0.45, ease: 'power3.inOut' }, 'm+=0.05')
      // ...while the arches start becoming band and cushion, the cushion a beat behind.
      .to(q('.ci-outer'), { morphSVG: PHONES.band, duration: 0.8, ease: 'expo.inOut' }, 'm+=0.1')
      .to(q('.ci-middle'), { morphSVG: PHONES.cushion, attr: { 'stroke-width': 30 }, duration: 0.9, ease: 'expo.inOut' }, 'm+=0.2')

      // 4. The drop splits: two halves fly apart, stretched by the speed, overshoot and come back.
      .addLabel('split', 'm+=0.5')
      .to(left, { x: -PHONES.travel, duration: 0.62, ease: 'back.out(1.5)' }, 'split')
      .to(right, { x: PHONES.travel, duration: 0.62, ease: 'back.out(1.5)' }, 'split+=0.05')
      .to([left, right], { scaleX: 1.14, scaleY: 0.88, transformOrigin: '50% 100%', duration: 0.22, ease: 'power2.out', stagger: 0.05 }, 'split')

      // 5. Landing: each cup squashes on impact and springs back into shape...
      .addLabel('land', 'split+=0.5')
      .to(left, { scaleX: 1.07, scaleY: 0.92, duration: 0.09, ease: 'power2.in' }, 'land')
      .to(right, { scaleX: 1.07, scaleY: 0.92, duration: 0.09, ease: 'power2.in' }, 'land+=0.05')
      .to(left, { scaleX: 1, scaleY: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' }, 'land+=0.09')
      .to(right, { scaleX: 1, scaleY: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' }, 'land+=0.14')
      // ...and the band and cushion give a little under it, then settle.
      .to(q('.ci-outer'), { y: 9, duration: 0.1, ease: 'power2.out' }, 'land+=0.04')
      .to(q('.ci-outer'), { y: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' }, 'land+=0.14')
      .to(q('.ci-middle'), { y: 6, duration: 0.12, ease: 'power2.out' }, 'land+=0.08')
      .to(q('.ci-middle'), { y: 0, duration: 0.85, ease: 'elastic.out(1, 0.35)' }, 'land+=0.2')

      // ...then the ear cushions slide out from inside each cup and settle against it.
      .fromTo(
        q('.ci-pad'),
        { opacity: 0, x: (i: number) => (i ? 58 : -58), scaleY: 0.7, transformOrigin: '50% 50%' },
        { opacity: 0.92, x: 0, scaleY: 1, duration: 0.75, ease: 'elastic.out(1, 0.55)', stagger: 0.06 },
        'land+=0.22'
      )

      // 6. Sound ripples out from both cups, and the name arrives.
      .to(q('.ci-wave'), { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out', stagger: 0.1 }, 'land+=0.1')
      .to(q('.ci-wave'), { opacity: 0, scale: 1.35, duration: 0.7, ease: 'power1.in', stagger: 0.1 }, 'land+=0.55')
      .fromTo(q('.ci-name'), { opacity: 0, y: 8, letterSpacing: '0.7em' }, { opacity: 1, y: 0, letterSpacing: '0.46em', duration: 1, ease: 'expo.out' }, 'land+=0.15')

      // 7. Lights down, into the lobby.
      .to(el, { opacity: 0, duration: 0.6, ease: 'power1.inOut' }, 'land+=1.3')
      .to(q('.ci-mark'), { scale: 1.05, duration: 0.6, ease: 'power1.in' }, '<')

    const skip = (e: Event): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      tl.timeScale(4)
      cinemaSound.hush()
    }
    window.addEventListener('keydown', skip, true)
    el.addEventListener('pointerdown', skip)
    return () => {
      tl.kill()
      window.removeEventListener('keydown', skip, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={root} className="cinema-intro" aria-hidden>
      <svg className="ci-svg" viewBox="40 200 944 760">
        <defs>
          <linearGradient id="ci-r1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF1D2" />
            <stop offset="1" stopColor="#FFB45A" />
          </linearGradient>
          <linearGradient id="ci-r2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFB45A" />
            <stop offset="1" stopColor="#FF7A2E" />
          </linearGradient>
          <linearGradient id="ci-r3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF7A2E" />
            <stop offset="1" stopColor="#E0452B" />
          </linearGradient>
        </defs>
        <g className="ci-mark">
          {[1, 2].map((r) => (
            <g key={r}>
              <path className="ci-wave" d={wave(-1, 120 + r * 44)} />
              <path className="ci-wave" d={wave(1, 120 + r * 44)} />
            </g>
          ))}
          <path className="ci-outer" d={BEACON.outer} fill="none" stroke="url(#ci-r3)" strokeWidth="56" strokeLinecap="round" />
          <path className="ci-middle" d={BEACON.middle} fill="none" stroke="url(#ci-r2)" strokeWidth="56" strokeLinecap="round" />
          <path className="ci-core" d={BEACON.core} fill="url(#ci-r1)" />
          <path className="ci-right" d={BEACON.core} fill="url(#ci-r1)" />
          <path className="ci-pad" d={PHONES.padLeft} fill="url(#ci-r2)" opacity="0" />
          <path className="ci-pad" d={PHONES.padRight} fill="url(#ci-r2)" opacity="0" />
        </g>
      </svg>
      <div className="ci-name">Cinema</div>
    </div>
  )
}

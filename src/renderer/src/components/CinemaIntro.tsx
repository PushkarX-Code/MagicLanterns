import { useEffect, useRef } from 'react'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'
import { gsap, reduceMotion } from '../design/motion'
import { cinemaSound } from '../lib/cinemaSound'

gsap.registerPlugin(DrawSVGPlugin, MorphSVGPlugin)

// The way into Cinema Mode: the Beacon draws itself in light, then turns into a pair of headphones (the outer
// arch becomes the band, the middle one its cushion, the core splits into two ear cups), sound ripples out
// from both sides, and everything fades into the lobby. About three and a half seconds; any key skips it.

const BEACON = {
  outer: 'M232 800 L232 512 A280 280 0 0 1 792 512 L792 800',
  middle: 'M342 800 L342 512 A170 170 0 0 1 682 512 L682 800',
  core: 'M452 800 L452 520 A60 60 0 0 1 572 520 L572 800 Z'
}
const PHONES = {
  band: 'M232 690 L232 512 A280 280 0 0 1 792 512 L792 690',
  cushion: 'M290 600 L290 512 A222 222 0 0 1 734 512 L734 600',
  left: 'M166 668 A66 66 0 0 1 298 668 L298 752 A66 66 0 0 1 166 752 Z',
  right: 'M726 668 A66 66 0 0 1 858 668 L858 752 A66 66 0 0 1 726 752 Z'
}

/** Sound leaving one ear cup: a short arc facing outward. */
const wave = (side: 1 | -1, r: number): string => {
  const cx = side < 0 ? 232 : 792
  const cy = 710
  const a = (deg: number): string => `${cx + side * r * Math.cos((deg * Math.PI) / 180)} ${cy + r * Math.sin((deg * Math.PI) / 180)}`
  return `M${a(-34)} A${r} ${r} 0 0 ${side < 0 ? 0 : 1} ${a(34)}`
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
    const tl = gsap.timeline({ onComplete: onDone })
    cinemaSound.intro()
    gsap.set(q('.ci-right'), { opacity: 0 })
    gsap.set(q('.ci-wave'), { opacity: 0, scale: 0.6, transformOrigin: (i: number) => (i % 2 ? '0% 50%' : '100% 50%') })

    // 1. The Beacon draws itself from the top of each arch outward, and the core rises.
    tl.fromTo(q('.ci-outer, .ci-middle'), { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1, ease: 'power3.inOut', stagger: 0.14 })
      .fromTo(q('.ci-core'), { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.6, ease: 'back.out(1.6)' }, 0.55)
      // 2. It becomes a pair of headphones.
      .addLabel('morph', 1.35)
      .set(q('.ci-right'), { opacity: 1 }, 'morph')
      .to(q('.ci-outer'), { morphSVG: PHONES.band, duration: 1, ease: 'expo.inOut' }, 'morph')
      .to(q('.ci-middle'), { morphSVG: PHONES.cushion, attr: { 'stroke-width': 30 }, duration: 1, ease: 'expo.inOut' }, 'morph')
      .to(q('.ci-core'), { morphSVG: { shape: PHONES.left, type: 'rotational' }, duration: 1, ease: 'expo.inOut' }, 'morph')
      .to(q('.ci-right'), { morphSVG: { shape: PHONES.right, type: 'rotational' }, duration: 1, ease: 'expo.inOut' }, 'morph')
      .fromTo(q('.ci-mark'), { scale: 1 }, { scale: 0.94, duration: 1, ease: 'expo.inOut', transformOrigin: '50% 60%' }, 'morph')
      // 3. Sound ripples out from both cups, and the name arrives.
      .to(q('.ci-wave'), { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out', stagger: { each: 0.12, from: 'start' } }, 'morph+=0.95')
      .to(q('.ci-wave'), { opacity: 0, scale: 1.35, duration: 0.7, ease: 'power1.in', stagger: 0.12 }, 'morph+=1.4')
      .fromTo(q('.ci-name'), { opacity: 0, y: 8, letterSpacing: '0.7em' }, { opacity: 1, y: 0, letterSpacing: '0.46em', duration: 1, ease: 'expo.out' }, 'morph+=0.9')
      // 4. Lights out, into the lobby.
      .to(el, { opacity: 0, duration: 0.6, ease: 'power1.inOut' }, 'morph+=1.95')
      .to(q('.ci-mark'), { scale: 1.06, duration: 0.6, ease: 'power1.in' }, '<')

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
      <svg className="ci-svg" viewBox="120 300 784 560">
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
              <path className="ci-wave" d={wave(-1, 110 + r * 46)} />
              <path className="ci-wave" d={wave(1, 110 + r * 46)} />
            </g>
          ))}
          <path className="ci-outer" d={BEACON.outer} fill="none" stroke="url(#ci-r3)" strokeWidth="56" strokeLinecap="round" />
          <path className="ci-middle" d={BEACON.middle} fill="none" stroke="url(#ci-r2)" strokeWidth="56" strokeLinecap="round" />
          <path className="ci-core" d={BEACON.core} fill="url(#ci-r1)" />
          <path className="ci-right" d={BEACON.core} fill="url(#ci-r1)" />
        </g>
      </svg>
      <div className="ci-name">Cinema</div>
    </div>
  )
}

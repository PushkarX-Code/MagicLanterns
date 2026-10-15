import { useEffect, useRef } from 'react'
import { Lantern, Wordmark } from '../components/Lantern'
import { gsap, reduceMotion } from '../design/motion'

/**
 * The Beacon fades in, its core lights first and each arch catches the glow on the way out,
 * then the light spills into the dark and dissolves into Home.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const q = gsap.utils.selector(el)
    const finish = (): void => onDone()

    if (reduceMotion()) {
      const tl = gsap.timeline({ onComplete: finish })
      tl.fromTo(q('.splash-mark, .wordmark'), { opacity: 0 }, { opacity: 1, duration: 0.4 }).to(el, { opacity: 0, duration: 0.4, delay: 0.5 })
      return () => {
        tl.kill()
      }
    }

    gsap.set(q('.lm-core'), { opacity: 0.18 })
    gsap.set(q('.lm-play'), { opacity: 0.05 })
    gsap.set(q('.lm-halo, .lm-pool'), { opacity: 0 })
    gsap.set(q('.splash-spill'), { scale: 0.15, opacity: 0 })

    const tl = gsap.timeline({ onComplete: finish })
    tl.fromTo(q('.splash-mark'), { opacity: 0, scale: 0.94, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: 1.0, ease: 'power2.out' })
      .to(q('.lm-core'), { opacity: 1, duration: 1.3, ease: 'sine.inOut' }, '-=0.3')
      .to(q('.lm-play'), { opacity: 1, duration: 0.9, ease: 'sine.inOut', stagger: { each: 0.3, from: 'end' } }, '<0.35')
      .to(q('.lm-halo, .lm-pool'), { opacity: 1, duration: 1.2, ease: 'sine.inOut' }, '<')
      .fromTo(q('.wordmark'), { opacity: 0, y: 10, letterSpacing: '0.12em' }, { opacity: 1, y: 0, letterSpacing: '0.035em', duration: 1.1, ease: 'expo.out' }, '<0.3')
      .to(q('.splash-spill'), { opacity: 1, scale: 1.1, duration: 0.9, ease: 'power2.in' }, '+=0.15')
      .to(q('.splash-spill'), { scale: 5.5, opacity: 0, duration: 1.3, ease: 'power2.out' })
      .to(q('.splash-mark, .wordmark'), { opacity: 0, scale: 1.06, duration: 0.7, ease: 'power2.in' }, '<')
      .to(el, { opacity: 0, duration: 0.9, ease: 'power1.inOut' }, '<0.35')

    // Any key or click skips ahead.
    const skip = (): void => {
      tl.progress(1)
    }
    window.addEventListener('keydown', skip, { once: true, capture: true })
    el.addEventListener('pointerdown', skip, { once: true })
    return () => {
      tl.kill()
      window.removeEventListener('keydown', skip, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={root} className="splash">
      <div className="splash-spill" />
      <div className="splash-center">
        <div className="splash-mark">
          <Lantern size={220} />
        </div>
        <Wordmark />
      </div>
    </div>
  )
}

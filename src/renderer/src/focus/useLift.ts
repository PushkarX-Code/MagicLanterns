import { useEffect, useRef, type RefObject } from 'react'
import { gsap, EASE, DUR, reduceMotion } from '../design/motion'

/**
 * The focus treatment shared by every card: scale up, lift on a deep soft shadow,
 * a glass sheen sweep, and a parallax tilt that follows the cursor.
 */
export function useLift(
  ref: RefObject<HTMLElement | null>,
  focused: boolean,
  opts: { scale?: number; tilt?: number; rise?: number; sheen?: RefObject<HTMLElement | null> } = {}
): void {
  const { scale = 1.08, tilt = 7, rise = 6 } = opts
  const quick = useRef<{ rx: gsap.QuickToFunc; ry: gsap.QuickToFunc } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    gsap.set(el, { transformPerspective: 900, transformOrigin: '50% 50%' })
    quick.current = {
      rx: gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' }),
      ry: gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' })
    }
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = reduceMotion()
    gsap.to(el, {
      scale: focused && !reduced ? scale : 1,
      y: focused && !reduced ? -rise : 0,
      zIndex: focused ? 5 : 1,
      duration: focused ? DUR.focus : DUR.focus * 0.9,
      ease: EASE.lift,
      overwrite: 'auto'
    })
    if (!focused) {
      quick.current?.rx(0)
      quick.current?.ry(0)
    }
    const sheen = opts.sheen?.current
    if (focused && sheen && !reduced) {
      gsap.fromTo(sheen, { xPercent: -130, opacity: 1 }, { xPercent: 130, duration: 1.1, ease: 'power2.inOut' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])

  useEffect(() => {
    const el = ref.current
    if (!el || !focused || reduceMotion()) return
    const move = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      quick.current?.ry(px * tilt)
      quick.current?.rx(-py * tilt)
      el.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`)
      el.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`)
    }
    const leave = (): void => {
      quick.current?.rx(0)
      quick.current?.ry(0)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [focused, ref, tilt])
}

import { useEffect, useRef } from 'react'
import { gsap, d, EASE } from '../design/motion'

/** Fade freshly loaded tiles in one by one, the first time content arrives. */
export function useSettle(ref: React.RefObject<HTMLElement | null>, ready: boolean, selector: string): void {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current || !ref.current) return
    done.current = true
    gsap.fromTo(ref.current.querySelectorAll(selector), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: d(0.8), ease: EASE.settle, stagger: 0.03 })
  }, [ready, ref, selector])
}

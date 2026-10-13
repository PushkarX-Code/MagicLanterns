import { useEffect, useRef } from 'react'
import { useAmbient } from '../state/ambient'
import { gsap, DUR } from '../design/motion'

function wash(hex: string): string {
  return [
    `radial-gradient(120% 80% at 78% -10%, ${hex}d9 0%, ${hex}55 38%, transparent 72%)`,
    `radial-gradient(90% 70% at 0% 110%, ${hex}66 0%, transparent 60%)`,
    `linear-gradient(180deg, ${hex}22 0%, transparent 60%)`
  ].join(', ')
}

/** The focused item's color bleeding softly into the page, crossfading as focus moves. */
export function AmbientLayer() {
  const color = useAmbient((s) => s.color)
  const a = useRef<HTMLDivElement>(null)
  const b = useRef<HTMLDivElement>(null)
  const front = useRef<'a' | 'b'>('a')

  useEffect(() => {
    const incoming = front.current === 'a' ? b.current : a.current
    const outgoing = front.current === 'a' ? a.current : b.current
    if (!incoming || !outgoing) return
    incoming.style.background = wash(color)
    gsap.to(incoming, { opacity: 1, duration: DUR.ambient, ease: 'power1.inOut', overwrite: true })
    gsap.to(outgoing, { opacity: 0, duration: DUR.ambient, ease: 'power1.inOut', overwrite: true })
    front.current = front.current === 'a' ? 'b' : 'a'
  }, [color])

  return (
    <div className="ambient" aria-hidden>
      <div ref={a} className="ambient-layer" />
      <div ref={b} className="ambient-layer" />
      <div className="ambient-grain" />
    </div>
  )
}

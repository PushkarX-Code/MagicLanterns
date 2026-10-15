import { useEffect, useRef, useState } from 'react'
import { AudioLines, Sparkles } from 'lucide-react'

/**
 * Cinema Mode's own controls, at the top of the picture: Ambient Light and Sound Stage. They show for a moment
 * when the film starts, then wait out of sight; resting the pointer in their area brings them back. Every
 * change is a slow fade.
 */
export function CinemaBar({ ambient, onAmbient, onSound }: { ambient: boolean; onAmbient: () => void; onSound: () => void }) {
  const [hover, setHover] = useState(false)
  const [intro, setIntro] = useState(true)
  const timer = useRef(0)

  useEffect(() => {
    timer.current = window.setTimeout(() => setIntro(false), 4000)
    return () => window.clearTimeout(timer.current)
  }, [])

  return (
    <div
      className={`cinema-bar ${hover || intro ? 'is-shown' : ''}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="cinema-bar-row">
        <button className={`cinema-chip ${ambient ? 'is-on' : ''}`} onClick={onAmbient} aria-pressed={ambient}>
          <Sparkles size={16} strokeWidth={1.9} />
          <span>Ambient Light</span>
          <span className={`switch ${ambient ? 'is-on' : ''}`}>
            <span />
          </span>
        </button>
        <button className="cinema-chip" onClick={onSound}>
          <AudioLines size={16} strokeWidth={1.9} />
          <span>Sound Stage</span>
        </button>
      </div>
    </div>
  )
}

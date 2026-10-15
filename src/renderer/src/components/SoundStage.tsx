import { useEffect, useRef, useState } from 'react'
import { Armchair, AudioLines, Headphones, Speaker } from 'lucide-react'
import type { AudioTrack } from '@shared/types'
import { Toggle } from './SettingControls'
import { useSettings } from '../state/settings'
import { gsap, d } from '../design/motion'

// Sound Stage: where the soundtrack goes. Speakers get every channel, headphones get a virtual room,
// stereo folds it all into two. Each speaker lights with its channel's level while a film plays.

type Mode = 'theatre' | 'spatial' | 'stereo'

/** Seats in the room map, and which soundtrack channel (L R C LFE, then the surrounds) feeds each one. */
const SPEAKERS: { id: string; x: number; y: number; ch: (channels: number) => number | null }[] = [
  { id: 'L', x: 140, y: 92, ch: () => 0 },
  { id: 'C', x: 270, y: 80, ch: (n) => (n >= 6 ? 2 : null) },
  { id: 'R', x: 400, y: 92, ch: () => 1 },
  { id: 'SW', x: 448, y: 150, ch: (n) => (n >= 6 ? 3 : null) },
  { id: 'SL', x: 64, y: 236, ch: (n) => (n >= 8 ? 6 : n >= 6 ? 4 : null) },
  { id: 'SR', x: 476, y: 236, ch: (n) => (n >= 8 ? 7 : n >= 6 ? 5 : null) },
  { id: 'BL', x: 140, y: 372, ch: (n) => (n >= 8 ? 4 : null) },
  { id: 'BR', x: 400, y: 372, ch: (n) => (n >= 8 ? 5 : null) }
]
const SEAT = { x: 270, y: 246 }

const MODES: { id: Mode; icon: typeof Speaker; title: string; text: string }[] = [
  { id: 'theatre', icon: Speaker, title: 'Theatre Speakers', text: 'Every channel of the soundtrack goes to its own speaker, up to 7.1.' },
  { id: 'spatial', icon: Headphones, title: 'Spatial Headphones', text: 'A virtual 7.1 room around your head, from any pair of headphones.' },
  { id: 'stereo', icon: AudioLines, title: 'Stereo', text: 'Two speakers, with the surround channels folded in.' }
]

const layoutName = (n: number): string => (n >= 8 ? '7.1' : n >= 6 ? '5.1' : n === 1 ? 'Mono' : 'Stereo')
const LOSSLESS = /^(truehd|mlp|flac|pcm_|alac)/

/** How many speakers this computer's sound output offers. */
function useOutputs(known?: number): number {
  const [n, setN] = useState(known ?? 2)
  useEffect(() => {
    if (known) return setN(known)
    try {
      const ctx = new AudioContext()
      setN(ctx.destination.maxChannelCount || 2)
      void ctx.close()
    } catch {
      /* no audio device: stays at two */
    }
  }, [known])
  return n
}

export function SoundStage({
  track,
  levels,
  outputs: knownOutputs,
  onClose
}: {
  /** The soundtrack that is (or will be) playing. */
  track?: AudioTrack
  /** Live channel levels while a film plays through the audio engine. */
  levels?: () => number[] | null
  outputs?: number
  onClose: () => void
}) {
  const cfg = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const outputs = useOutputs(knownOutputs)
  const mode: Mode = cfg?.downmix ? 'stereo' : cfg?.spatialHeadphones ? 'spatial' : 'theatre'
  const channels = track?.channels ?? 2
  const root = useRef<HTMLDivElement>(null)
  const rings = useRef<(SVGCircleElement | null)[]>([])
  const closing = useRef(false)
  const [live, setLive] = useState(false)

  // Everything in Cinema Mode arrives and leaves slowly; nothing cuts.
  useEffect(() => {
    const q = gsap.utils.selector(root)
    gsap.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: d(0.9), ease: 'power1.out' })
    gsap.fromTo(q('.ss-panel'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: d(1.1), ease: 'power3.out' })
    gsap.fromTo(q('.ss-speaker'), { opacity: 0 }, { opacity: 1, duration: d(0.9), ease: 'power1.out', stagger: 0.07, delay: 0.3 })
  }, [])

  const close = (): void => {
    if (closing.current) return
    closing.current = true
    const q = gsap.utils.selector(root)
    gsap.to(q('.ss-panel'), { opacity: 0, y: 18, duration: d(0.7), ease: 'power2.in' })
    gsap.to(root.current, { opacity: 0, duration: d(0.9), ease: 'power1.inOut', delay: 0.1, onComplete: onClose })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' && e.key !== 'Backspace') return
      e.preventDefault()
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Each speaker's ring follows its channel. Without a film playing, the room rests.
  useEffect(() => {
    let raf = 0
    const shown = new Array(SPEAKERS.length).fill(0)
    const tick = (): void => {
      const now = levels?.() ?? null
      setLive((was) => (was === !!now ? was : !!now))
      SPEAKERS.forEach((s, i) => {
        const ring = rings.current[i]
        if (!ring) return
        const ch = s.ch(channels)
        const on = ch != null && (mode !== 'stereo' || s.id === 'L' || s.id === 'R')
        const target = on && now ? (now[ch!] ?? 0) : 0
        // Rise quickly, fall slowly, like a real meter.
        shown[i] = target > shown[i] ? shown[i] + (target - shown[i]) * 0.5 : shown[i] * 0.9
        ring.setAttribute('r', String(20 + shown[i] * 18))
        ring.setAttribute('opacity', String(on ? 0.12 + shown[i] * 0.7 : 0))
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [levels, channels, mode])

  const setMode = (m: Mode): void => void update({ downmix: m === 'stereo', spatialHeadphones: m === 'spatial' })
  const current = MODES.find((m) => m.id === mode)!
  const source = `${layoutName(channels)}${track && LOSSLESS.test(track.codec) ? ' lossless' : ''} soundtrack`
  const result =
    mode === 'spatial'
      ? 'a virtual room in your headphones'
      : mode === 'stereo' || channels <= 2
        ? 'two speakers'
        : `${Math.min(channels, outputs)} of your ${outputs} speakers`

  return (
    <div ref={root} className="ss" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="ss-panel">
        <svg className={`ss-room is-${mode}`} viewBox="0 0 540 440" aria-hidden>
          <defs>
            <linearGradient id="ss-screen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FF7A2E" stopOpacity="0" />
              <stop offset="0.5" stopColor="#FFB45A" />
              <stop offset="1" stopColor="#FF7A2E" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="18" y="40" width="504" height="384" rx="34" className="ss-wall" />
          <rect x="120" y="44" width="300" height="5" rx="2.5" fill="url(#ss-screen)" />
          <text x="270" y="30" textAnchor="middle" className="ss-label">
            SCREEN
          </text>
          {mode === 'spatial' && <circle cx={SEAT.x} cy={SEAT.y} r="178" className="ss-sphere" />}
          {SPEAKERS.map((s, i) => {
            const off = s.ch(channels) == null || (mode === 'stereo' && s.id !== 'L' && s.id !== 'R')
            return (
              <g key={s.id} className={`ss-speaker ${off ? 'is-off' : ''}`}>
                <circle ref={(el) => void (rings.current[i] = el)} cx={s.x} cy={s.y} r="20" className="ss-level" opacity="0" />
                <circle cx={s.x} cy={s.y} r="18" className="ss-cone" />
                <text x={s.x} y={s.y + 4} textAnchor="middle" className="ss-ch">
                  {s.id}
                </text>
              </g>
            )
          })}
          <g className="ss-seat">
            <circle cx={SEAT.x} cy={SEAT.y} r="30" />
            {mode === 'spatial' ? (
              <Headphones x={SEAT.x - 13} y={SEAT.y - 13} size={26} strokeWidth={1.8} />
            ) : (
              <Armchair x={SEAT.x - 13} y={SEAT.y - 13} size={26} strokeWidth={1.8} />
            )}
          </g>
        </svg>
        <div className="ss-side">
          <div className="info-kicker">Sound Stage</div>
          <h2 className="ss-title">{current.title}</h2>
          <div className="ss-modes">
            {MODES.map((m) => (
              <button key={m.id} className={`ss-mode ${m.id === mode ? 'is-on' : ''}`} onClick={() => setMode(m.id)}>
                <m.icon size={20} strokeWidth={1.9} />
                <span>
                  <b>{m.title}</b>
                  <small>{m.text}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="ss-toggles">
            <Toggle label="Dialogue Lift" hint="Voices stay clear over music and effects." value={!!cfg?.dialogueLift} onChange={(v) => void update({ dialogueLift: v })} />
            <Toggle label="Night Listening" hint="Explosions come down, whispers come up." value={!!cfg?.nightListening} onChange={(v) => void update({ nightListening: v })} />
          </div>
          <div className="ss-signal">
            <AudioLines size={16} />
            {source} · {result}
          </div>
          {!live && <div className="ss-note">The speakers light up while a film plays from your drives.</div>}
        </div>
      </div>
    </div>
  )
}

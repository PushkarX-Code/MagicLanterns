import { useEffect, useRef, useState } from 'react'
import { Armchair, AudioLines, Headphones, Play, Speaker, Sparkles } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { Lantern } from '../components/Lantern'
import { MetaLine } from '../components/Meta'
import { Toggle } from '../components/SettingControls'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { img } from '../lib/img'
import { gsap, d } from '../design/motion'

// Cinema Mode (prototype): a big-screen lobby you drive from the sofa, a Sound Stage for speakers or
// headphones, and Ambient Light that fills the letterbox bars with the film's own colour.

type View = 'lobby' | 'sound' | 'screen'
type SoundMode = 'theatre' | 'spatial' | 'stereo'

const SPEAKERS: { id: string; x: number; y: number }[] = [
  { id: 'L', x: 140, y: 92 },
  { id: 'C', x: 270, y: 80 },
  { id: 'R', x: 400, y: 92 },
  { id: 'SW', x: 448, y: 150 },
  { id: 'SL', x: 64, y: 236 },
  { id: 'SR', x: 476, y: 236 },
  { id: 'BL', x: 140, y: 372 },
  { id: 'BR', x: 400, y: 372 }
]
const SEAT = { x: 270, y: 246 }

const MODES: { id: SoundMode; icon: typeof Speaker; title: string; text: string }[] = [
  { id: 'theatre', icon: Speaker, title: 'Theatre Speakers', text: 'Every channel of the soundtrack goes to its own speaker, up to 7.1.' },
  { id: 'spatial', icon: Headphones, title: 'Spatial Headphones', text: 'A virtual 7.1 room around your head, from any pair of headphones.' },
  { id: 'stereo', icon: AudioLines, title: 'Stereo', text: 'Two speakers, with the surround channels folded in.' }
]

export function CinemaScreen() {
  const { data } = useAsync(() => api.getHome(), [])
  const items = data?.hero ?? []
  const [index, setIndex] = useState(0)
  const [view, setView] = useState<View>('lobby')
  const item = items[index] as MediaItem | undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (view === 'lobby') return // the app takes you back out of Cinema Mode
        e.stopImmediatePropagation()
        setView('lobby')
        return
      }
      if (view !== 'lobby') return
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (step) setIndex((i) => (i + step + items.length) % items.length)
      else if (e.key === 'Enter') setView('screen')
      else if (e.key.toLowerCase() === 's') setView('sound')
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [view, items.length])

  return (
    <div className="cinema">
      {item && <Lobby items={items} index={index} onPick={setIndex} onStart={() => setView('screen')} onSound={() => setView('sound')} />}
      {view === 'sound' && <SoundStage onClose={() => setView('lobby')} />}
      {view === 'screen' && item && <AmbientScreen item={item} />}
    </div>
  )
}

function Lobby({ items, index, onPick, onStart, onSound }: { items: MediaItem[]; index: number; onPick: (i: number) => void; onStart: () => void; onSound: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const item = items[index]
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  // Lights down: the screen opens from a thin line of light, then the lobby rises into place.
  useEffect(() => {
    const q = gsap.utils.selector(root)
    const tl = gsap.timeline()
    tl.fromTo(q('.cine-backdrop'), { clipPath: 'inset(49.6% 0 49.6% 0)', filter: 'brightness(2.4)' }, { clipPath: 'inset(0% 0 0% 0)', filter: 'brightness(1)', duration: d(1.5), ease: 'expo.inOut' })
      .fromTo(q('.cine-top'), { opacity: 0 }, { opacity: 1, duration: d(0.8) }, '-=0.2')
      .fromTo(q('.cine-feature > *'), { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: d(0.8), ease: 'power3.out', stagger: 0.08 }, '<')
      .fromTo(q('.cine-poster'), { opacity: 0, y: 46 }, { opacity: 1, y: 0, duration: d(0.8), ease: 'power3.out', stagger: 0.05 }, '<0.15')
      .fromTo(q('.cine-hints'), { opacity: 0 }, { opacity: 1, duration: d(0.6) }, '<0.4')
    return () => {
      tl.kill()
    }
  }, [])

  // A new film: its backdrop develops in, the details follow.
  useEffect(() => {
    const q = gsap.utils.selector(root)
    gsap.fromTo(q('.cine-backdrop img'), { opacity: 0.25, scale: 1.04 }, { opacity: 1, scale: 1, duration: d(1.1), ease: 'power2.out' })
    gsap.fromTo(q('.cine-feature > *'), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: d(0.6), ease: 'power3.out', stagger: 0.05 })
  }, [index])

  return (
    <div ref={root} className="cine-lobby">
      <div className="cine-backdrop">
        <img key={item.id} src={img(item.backdrop, 'original') ?? undefined} alt="" />
      </div>
      <div className="cine-shade" />
      <header className="cine-top">
        <div className="cine-brand">
          <Lantern size={22} />
          <span>Cinema</span>
        </div>
        <div className="cine-clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
      </header>
      <section className="cine-feature">
        <div className="cine-now">Now showing</div>
        {item.logo ? <img className="cine-logo" src={img(item.logo, 'w500') ?? undefined} alt={item.title} /> : <h1 className="cine-title">{item.title}</h1>}
        <MetaLine item={item} />
        <p className="cine-overview">{item.overview}</p>
        <div className="cine-actions">
          <button className="pill pill-solid" onClick={onStart}>
            <Play size={22} strokeWidth={2.2} fill="currentColor" />
            <span>Start the Show</span>
          </button>
          <button className="pill pill-glass" onClick={onSound}>
            <AudioLines size={22} strokeWidth={2.2} />
            <span>Sound Stage</span>
          </button>
        </div>
      </section>
      <div className="cine-strip">
        {items.map((it, i) => (
          <button key={it.id} className={`cine-poster ${i === index ? 'is-current' : ''}`} onClick={() => onPick(i)}>
            <img src={img(it.poster, 'w342') ?? undefined} alt={it.title} />
          </button>
        ))}
      </div>
      <footer className="cine-hints">
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> Browse
        </span>
        <span>
          <kbd>Enter</kbd> Start the show
        </span>
        <span>
          <kbd>S</kbd> Sound Stage
        </span>
        <span>
          <kbd>Esc</kbd> Leave Cinema
        </span>
      </footer>
    </div>
  )
}

function SoundStage({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<SoundMode>('theatre')
  const [dialogue, setDialogue] = useState(true)
  const [night, setNight] = useState(false)
  const rings = useRef<(SVGCircleElement | null)[]>([])
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = gsap.utils.selector(root)
    gsap.fromTo(q('.cine-sound-panel'), { opacity: 0, y: 26, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: d(0.6), ease: 'power3.out' })
    gsap.fromTo(q('.cine-speaker'), { opacity: 0, scale: 0.4, transformOrigin: 'center' }, { opacity: 1, scale: 1, duration: d(0.5), ease: 'back.out(2)', stagger: 0.05, delay: 0.15 })
  }, [])

  // Channel meters. The prototype drives them with a soundtrack-like pattern; the audio engine will feed real levels.
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number): void => {
      const t = (now - start) / 1000
      SPEAKERS.forEach((s, i) => {
        const ring = rings.current[i]
        if (!ring) return
        const front = s.id === 'C' ? 0.85 : s.id === 'L' || s.id === 'R' ? 0.6 : s.id === 'SW' ? 0.7 : 0.35
        const level = Math.max(0, Math.min(1, front * (0.55 + 0.45 * Math.sin(t * (2.1 + i * 0.37) + i) * Math.sin(t * 0.7 + i * 1.3))))
        const muted = mode === 'stereo' && s.id !== 'L' && s.id !== 'R'
        ring.setAttribute('r', String(20 + (muted ? 0 : level) * 18))
        ring.setAttribute('opacity', String(muted ? 0 : 0.15 + level * 0.65))
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  const current = MODES.find((m) => m.id === mode)!
  const channels = mode === 'stereo' ? 2 : 8

  return (
    <div ref={root} className="cine-sound" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cine-sound-panel glass">
        <svg className={`cine-room is-${mode}`} viewBox="0 0 540 440" aria-hidden>
          <defs>
            <linearGradient id="cine-screen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FF7A2E" stopOpacity="0" />
              <stop offset="0.5" stopColor="#FFB45A" />
              <stop offset="1" stopColor="#FF7A2E" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="18" y="40" width="504" height="384" rx="34" className="cine-room-wall" />
          <rect x="120" y="44" width="300" height="6" rx="3" fill="url(#cine-screen)" />
          <text x="270" y="30" textAnchor="middle" className="cine-room-label">SCREEN</text>
          {mode === 'spatial' && <circle cx={SEAT.x} cy={SEAT.y} r="178" className="cine-sphere" />}
          {SPEAKERS.map((s, i) => (
            <g key={s.id} className={`cine-speaker ${mode === 'stereo' && s.id !== 'L' && s.id !== 'R' ? 'is-off' : ''}`}>
              <circle ref={(el) => void (rings.current[i] = el)} cx={s.x} cy={s.y} r="20" className="cine-level" />
              <circle cx={s.x} cy={s.y} r="18" className="cine-cone" />
              <text x={s.x} y={s.y + 4} textAnchor="middle" className="cine-ch">
                {s.id}
              </text>
            </g>
          ))}
          <g className="cine-seat">
            <circle cx={SEAT.x} cy={SEAT.y} r="30" />
            {mode === 'spatial' ? (
              <Headphones x={SEAT.x - 13} y={SEAT.y - 13} size={26} strokeWidth={1.8} />
            ) : (
              <Armchair x={SEAT.x - 13} y={SEAT.y - 13} size={26} strokeWidth={1.8} />
            )}
          </g>
        </svg>
        <div className="cine-sound-side">
          <div className="info-kicker">Sound Stage</div>
          <h2 className="cine-sound-title">{current.title}</h2>
          <div className="cine-modes">
            {MODES.map((m) => (
              <button key={m.id} className={`cine-mode ${m.id === mode ? 'is-on' : ''}`} onClick={() => setMode(m.id)}>
                <m.icon size={20} strokeWidth={1.9} />
                <span>
                  <b>{m.title}</b>
                  <small>{m.text}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="cine-toggles">
            <Toggle label="Dialogue Lift" hint="Voices stay clear over music and effects." value={dialogue} onChange={setDialogue} />
            <Toggle label="Night Listening" hint="Explosions come down, whispers come up." value={night} onChange={setNight} />
          </div>
          <div className="cine-signal">
            <AudioLines size={16} />
            Soundtrack 7.1 lossless · sending {channels} channels{night ? ' · night' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Black bars baked into the file itself (common in films): rows at the top and bottom that stay dark. */
function findBars(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number] {
  const px = ctx.getImageData(0, 0, w, h).data
  const dark = (y: number): boolean => {
    let sum = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11
    }
    return sum / w < 18
  }
  let top = 0
  while (top < h / 3 && dark(top)) top++
  let bottom = 0
  while (bottom < h / 3 && dark(h - 1 - bottom)) bottom++
  return [top / h, bottom / h]
}

function AmbientScreen({ item }: { item: MediaItem }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // The picture without its baked-in bars, as fractions of the frame height.
  const [bars, setBars] = useState<[number, number]>([0, 0])
  const [aspect, setAspect] = useState(16 / 9)

  useEffect(() => {
    gsap.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: d(0.9), ease: 'power1.out' })
    const v = video.current
    const c = canvas.current?.getContext('2d')
    if (!v || !c || !item.preview) return
    v.crossOrigin = 'anonymous' // the frames are read back for the light, so the stream must allow it
    v.src = item.preview.url
    v.currentTime = item.preview.start
    v.muted = true
    void v.play().catch(() => {})
    const probe = document.createElement('canvas')
    probe.width = 160
    probe.height = 90
    const pc = probe.getContext('2d', { willReadFrequently: true })!
    let found: [number, number] = [0.5, 0.5]
    let samples = 0
    let crop: [number, number] = [0, 0]
    // A tiny copy of each frame, blown up and blurred behind the picture: the bars take the film's light.
    let raf = 0
    const draw = (): void => {
      if (v.readyState >= 2 && v.videoWidth) {
        const h = v.videoHeight
        c.drawImage(v, 0, crop[0] * h, v.videoWidth, h * (1 - crop[0] - crop[1]), 0, 0, 64, 36)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    // Bars are measured over the first few seconds: a dark scene can't fake a bar that a bright one disproves.
    const measure = window.setInterval(() => {
      if (v.readyState < 2 || !v.videoWidth) return
      pc.drawImage(v, 0, 0, 160, 90)
      const [t, b] = findBars(pc, 160, 90)
      found = [Math.min(found[0], t), Math.min(found[1], b)]
      if (++samples < 6) return
      window.clearInterval(measure)
      crop = found
      setBars(found)
      setAspect(v.videoWidth / (v.videoHeight * (1 - found[0] - found[1])))
    }, 500)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(measure)
      v.pause()
    }
  }, [item])

  const kept = 1 - bars[0] - bars[1]
  return (
    <div ref={root} className="cine-screen">
      <canvas ref={canvas} className="cine-ambient" width="64" height="36" />
      <div className="cine-picture" style={{ aspectRatio: String(aspect) }}>
        <video ref={video} className="cine-video" playsInline style={{ height: `${100 / kept}%`, top: `${(-bars[0] / kept) * 100}%` }} />
      </div>
      <div className="cine-badge">
        <Sparkles size={15} />
        Ambient Light
      </div>
    </div>
  )
}

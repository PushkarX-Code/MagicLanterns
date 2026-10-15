import { useContext, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, CornerDownLeft, Play } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { Lantern } from '../components/Lantern'
import { MetaLine, primaryFile } from '../components/Meta'
import { SoundStage } from '../components/SoundStage'
import { CinemaIntro } from '../components/CinemaIntro'
import { useSettings } from '../state/settings'
import { cinemaSound } from '../lib/cinemaSound'
import { ScreenActive } from '../focus/focus'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { img } from '../lib/img'
import { useNav } from '../state/nav'
import { gsap, d } from '../design/motion'

// Cinema Mode: a big-screen lobby you drive from the sofa. The picture opens like a projector shutter,
// films change with a slow dissolve, and nothing arrives or leaves faster than a cinema's lights would.

export function CinemaScreen() {
  const { data } = useAsync(() => api.getHome(), [])
  const items = data?.hero ?? []
  // The opening plays once per visit, while the lobby's films load behind it.
  const [intro, setIntro] = useState(() => useSettings.getState().settings?.cinemaIntro ?? true)
  return (
    <div className="cinema">
      {!intro && items.length > 0 && <Lobby items={items} />}
      {intro && <CinemaIntro onDone={() => setIntro(false)} />}
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(t)
  }, [])
  const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(now)
  const time = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim()
  const period = parts.find((p) => p.type === 'dayPeriod')?.value
  return (
    <div className="cine-clock">
      <div className="cine-time">
        {time}
        {period && <span className="cine-period">{period}</span>}
      </div>
      <div className="cine-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  )
}

function Lobby({ items }: { items: MediaItem[] }) {
  const root = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  // The film on screen, and the one it is dissolving from.
  const [layers, setLayers] = useState<{ key: number; item: MediaItem }[]>([{ key: 0, item: items[0] }])
  const [sound, setSound] = useState(false)
  const busy = useRef(false)
  const active = useContext(ScreenActive)
  const push = useNav((s) => s.push)
  const back = useNav((s) => s.back)
  const item = items[index]

  // The lights come up: the picture develops out of black, then the lobby settles in around it.
  // (Posters fade through their artwork, not their own opacity, which the strip animates on its own.)
  useEffect(() => {
    const q = gsap.utils.selector(root)
    const tl = gsap.timeline()
    tl.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: d(0.8), ease: 'power1.out' })
      .fromTo(q('.cine-backdrop'), { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: d(2.2), ease: 'power2.out' }, 0)
      .fromTo(q('.cine-top'), { opacity: 0 }, { opacity: 1, duration: d(1.2), ease: 'power1.out' }, 0.5)
      .fromTo(q('.cine-feature > *'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: d(1.2), ease: 'power3.out', stagger: 0.12 }, 0.6)
      .fromTo(q('.cine-poster'), { y: 40 }, { y: 0, duration: d(1.2), ease: 'power3.out', stagger: 0.07 }, 0.8)
      .fromTo(q('.cine-poster img'), { opacity: 0 }, { opacity: 1, duration: d(1), ease: 'power1.out', stagger: 0.07 }, 0.8)
      .fromTo(q('.cine-keys'), { opacity: 0 }, { opacity: 1, duration: d(1), ease: 'power1.out' }, 1.4)
    return () => {
      tl.kill()
    }
  }, [])

  // Back from a film: the lobby's own lights come up again.
  useEffect(() => {
    if (!active || !root.current) return
    busy.current = false
    if (Number(gsap.getProperty(root.current, 'opacity')) < 1) gsap.to(root.current, { opacity: 1, duration: d(1.4), ease: 'power1.out' })
  }, [active])

  /** Choosing a film: the poster gives under the press, springs up into place and catches a sweep of light. */
  const pick = (i: number, pressed = false): void => {
    if (i === index) return
    const q = gsap.utils.selector(root)
    const poster = q('.cine-poster')[i]
    if (poster) {
      gsap
        .timeline()
        .to(poster, { scale: pressed ? 0.92 : 1.03, duration: pressed ? 0.12 : 0.18, ease: 'power2.out' })
        .to(poster, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.5)' })
      cinemaSound.switchFilm()
      gsap.fromTo(poster.querySelector('.cine-sheen'), { xPercent: -140, opacity: 0.7 }, { xPercent: 140, opacity: 0, duration: 0.9, ease: 'power2.out', delay: pressed ? 0.1 : 0 })
    }
    setIndex(i)
    setLayers((l) => [...l.slice(-1), { key: (l.at(-1)?.key ?? 0) + 1, item: items[i] }])
  }

  // A new film: its backdrop dissolves in over the last one, the details follow softly.
  useEffect(() => {
    if (layers.length < 2) return
    const q = gsap.utils.selector(root)
    const top = q('.cine-backdrop img').at(-1)
    if (top) gsap.fromTo(top, { opacity: 0, scale: 1.03 }, { opacity: 1, scale: 1, duration: d(1.6), ease: 'power2.inOut' })
    gsap.fromTo(q('.cine-feature > *'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: d(1), ease: 'power2.out', stagger: 0.07 })
  }, [layers])

  /** Fades the lobby to black, then does the thing: open the film, or leave Cinema Mode. */
  const fadeOut = (then: () => void): void => {
    if (busy.current) return
    busy.current = true
    gsap.to(root.current, { opacity: 0, duration: d(1), ease: 'power1.inOut', onComplete: then })
  }
  const start = (): void => {
    if (busy.current) return
    cinemaSound.startShow()
    fadeOut(() => push({ name: 'player', itemId: item.id, cinema: true }))
  }
  const leave = (): void => {
    if (busy.current) return
    cinemaSound.leave()
    fadeOut(back)
  }

  useEffect(() => {
    if (!active || sound) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') pick((index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length)
      else if (e.key === 'Enter') start()
      else if (e.key.toLowerCase() === 's') setSound(true)
      else if (e.key === 'Escape' || e.key === 'Backspace') leave()
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const file = primaryFile(item)
  const track = file?.audio.find((a) => a.default) ?? file?.audio[0]

  return (
    <div ref={root} className="cine-lobby">
      <div className="cine-backdrop">
        {layers.map((l) => (
          <img key={l.key} src={img(l.item.backdrop, 'original') ?? undefined} alt="" />
        ))}
      </div>
      <div className="cine-shade" />
      <header className="cine-top">
        <div className="cine-brand">
          <Lantern size={22} />
          <span>Cinema</span>
        </div>
        <Clock />
      </header>
      <section className="cine-feature">
        {item.logo ? <img className="cine-logo" src={img(item.logo, 'w500') ?? undefined} alt={item.title} /> : <h1 className="cine-title">{item.title}</h1>}
        <MetaLine item={item} />
        <p className="cine-overview">{item.overview}</p>
        <div className="cine-actions">
          <button className="pill pill-solid" onClick={start}>
            <Play size={22} strokeWidth={2.2} fill="currentColor" />
            <span>Start the Show</span>
          </button>
          <button className="pill cine-quiet" onClick={() => setSound(true)}>
            <AudioLines size={22} strokeWidth={2.2} />
            <span>Sound Stage</span>
          </button>
        </div>
      </section>
      <div className="cine-strip">
        {items.map((it, i) => (
          <button key={it.id} className={`cine-poster ${i === index ? 'is-current' : ''}`} onClick={() => pick(i, true)}>
            <img src={img(it.poster, 'w342') ?? undefined} alt={it.title} />
            <span className="cine-sheen" />
          </button>
        ))}
      </div>
      <footer className="cine-keys">
        <span className="cine-key-group">
          <kbd>
            <ArrowLeft size={13} strokeWidth={2.4} />
          </kbd>
          <kbd>
            <ArrowRight size={13} strokeWidth={2.4} />
          </kbd>
          Browse
        </span>
        <span className="cine-key-group">
          <kbd className="wide">
            <CornerDownLeft size={13} strokeWidth={2.4} />
          </kbd>
          Play
        </span>
        <span className="cine-key-group">
          <kbd>S</kbd>
          Sound
        </span>
        <span className="cine-key-group">
          <kbd className="wide">esc</kbd>
          Leave
        </span>
      </footer>
      {sound && <SoundStage track={track} onClose={() => setSound(false)} />}
    </div>
  )
}

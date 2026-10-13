import { useContext, useEffect, useRef, useState } from 'react'
import { Info, Play } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { BlurImage } from './BlurImage'
import { PillButton } from './Buttons'
import { MetaLine } from './Meta'
import { FocusContext, ScreenActive, useFocus } from '../focus/focus'
import { useAmbient } from '../state/ambient'
import { useNav } from '../state/nav'
import { useSettings } from '../state/settings'
import { gsap, d, EASE, reduceMotion } from '../design/motion'
import { clock } from '../lib/format'
import { backdropSize, img, preload } from '../lib/img'

const STILL_MS = 9000 // how long a still holds before auto-advancing
const IDLE_MS = 4000 // idle time before the still becomes a muted preview
const PREVIEW_MS = 10_000 // length of the preview loop

/** Label for the hero's primary button: Play, Resume 00:40:48, or Resume S2, E3. */
export function playLabel(item: MediaItem): { label: string; progress?: number } {
  if (item.kind === 'movie') {
    const p = item.progress
    if (p && !p.watched && p.position > 0) return { label: `Resume ${clock(p.position)}`, progress: p.position / p.duration }
    return { label: 'Play' }
  }
  const eps = item.seasons?.flatMap((s) => s.episodes) ?? []
  const partial = eps.find((e) => e.progress && !e.progress.watched && e.progress.position > 0)
  if (partial) return { label: `Resume S${partial.season}, E${partial.number}`, progress: partial.progress!.position / partial.progress!.duration }
  const lastWatched = eps.map((e) => !!e.progress?.watched).lastIndexOf(true)
  const next = eps[lastWatched + 1]
  if (lastWatched >= 0 && next) return { label: `Play S${next.season}, E${next.number}` }
  return { label: 'Play S1, E1' }
}

export function Hero({ items, onFocusHero }: { items: MediaItem[]; onFocusHero?: () => void }) {
  const [index, setIndex] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const previewsOn = useSettings((s) => s.settings?.heroPreviews ?? true)
  // Covered by a detail page or the player: hold still and stay silent.
  const active = useContext(ScreenActive)

  const root = useRef<HTMLElement>(null)
  const slides = useRef<(HTMLDivElement | null)[]>([])
  const content = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const lastInput = useRef(Date.now())
  const kenBurns = useRef<gsap.core.Tween | null>(null)

  const item = items[index]
  const { focusKey, ref } = useFocus<HTMLDivElement>({ focusKey: 'HERO', saveLastFocusedChild: true, trackChildren: true })

  const goTo = (i: number): void => setIndex((i + items.length) % items.length)

  // Track user input for the idle preview.
  useEffect(() => {
    const bump = (): void => {
      lastInput.current = Date.now()
    }
    window.addEventListener('keydown', bump)
    window.addEventListener('pointermove', bump, { passive: true })
    window.addEventListener('wheel', bump, { passive: true })
    return () => {
      window.removeEventListener('keydown', bump)
      window.removeEventListener('pointermove', bump)
      window.removeEventListener('wheel', bump)
    }
  }, [])

  // Warm the next backdrop so advancing never shows a blank frame.
  useEffect(() => {
    preload(img(items[(index + 1) % items.length]?.backdrop, backdropSize()))
  }, [index, items])

  // Crossfade slides + slow Ken Burns on the active one.
  useEffect(() => {
    setAmbient(item.color)
    slides.current.forEach((el, i) => {
      if (!el) return
      gsap.to(el, { opacity: i === index ? 1 : 0, duration: d(1.4), ease: 'power1.inOut', overwrite: 'auto' })
    })
    const active = slides.current[index]?.querySelector('.hero-kb')
    kenBurns.current?.kill()
    if (active && !reduceMotion()) {
      kenBurns.current = gsap.fromTo(active, { scale: 1.02, xPercent: 0 }, { scale: 1.1, xPercent: -1.5, duration: 16, ease: 'none' })
    }
    if (content.current) {
      gsap.fromTo(
        content.current.querySelectorAll('.hero-reveal'),
        { opacity: 0, y: reduceMotion() ? 0 : 14 },
        { opacity: 1, y: 0, duration: d(0.9), ease: EASE.settle, stagger: 0.08, delay: 0.15 }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Scheduler: hold the still, then either preview (if idle) or advance.
  useEffect(() => {
    if (!active) setPreviewing(false)
  }, [active])

  useEffect(() => {
    if (previewing || !active) return
    const started = Date.now()
    const t = window.setInterval(() => {
      const idleFor = Date.now() - lastInput.current
      const onScreen = (root.current?.getBoundingClientRect().bottom ?? 0) > window.innerHeight * 0.5
      const canPreview = previewsOn && !!item.preview && onScreen && document.hasFocus()
      if (canPreview && idleFor >= IDLE_MS && Date.now() - started >= IDLE_MS) setPreviewing(true)
      else if (Date.now() - started >= STILL_MS && (!canPreview || idleFor < IDLE_MS)) goTo(index + 1)
    }, 500)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, previewing, previewsOn, active])

  // The muted preview: start ~20% into the file, crossfade in, play 10s, crossfade out, advance.
  useEffect(() => {
    const v = video.current
    if (!v || !previewing || !item.preview) return
    let stop = 0
    const { url, start } = item.preview
    const onMeta = (): void => {
      v.currentTime = (v.duration || 0) * start
    }
    const onPlaying = (): void => {
      gsap.to(v, { opacity: 1, duration: d(1.6), ease: 'power1.inOut' })
      stop = window.setTimeout(end, PREVIEW_MS)
    }
    const end = (): void => {
      gsap.to(v, {
        opacity: 0,
        duration: d(1.2),
        ease: 'power1.inOut',
        onComplete: () => {
          v.pause()
          setPreviewing(false)
          goTo(index + 1)
        }
      })
    }
    const fail = (): void => {
      setPreviewing(false)
      goTo(index + 1)
    }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    v.addEventListener('playing', onPlaying, { once: true })
    v.addEventListener('error', fail, { once: true })
    v.src = url
    v.play().catch(fail)
    return () => {
      window.clearTimeout(stop)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('error', fail)
      v.pause()
      gsap.set(v, { opacity: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing])

  const play = (): void => push({ name: 'player', itemId: item.id })
  const more = (): void => {
    const r = root.current?.getBoundingClientRect()
    push({
      name: 'detail',
      id: item.id,
      origin: r ? { rect: { x: r.left, y: r.top, width: r.width, height: r.height }, src: img(item.backdrop, backdropSize()), color: item.color } : undefined
    })
  }
  const { label, progress } = playLabel(item)

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={root} className="hero">
        <div className="hero-media">
          {items.map((it, i) => (
            <div key={it.id} ref={(el) => (slides.current[i] = el)} className="hero-slide" style={{ opacity: i === 0 ? 1 : 0 }}>
              <div className="hero-kb">
                <BlurImage path={it.backdrop} size={backdropSize()} tiny="w300" color={it.color} />
              </div>
            </div>
          ))}
          <video ref={video} className="hero-video" muted playsInline preload="none" />
          <div className="hero-scrim" />
        </div>

        <div ref={ref} className="hero-content">
          <div ref={content}>
            <div className="hero-logo hero-reveal">
              {item.logo ? (
                <BlurImage
                  key={item.id}
                  path={item.logo}
                  size="w500"
                  tiny={false}
                  color="transparent"
                  fit="contain"
                  position="left bottom"
                  alt={item.title}
                  fallback={<h1 className="t-display">{item.title}</h1>}
                />
              ) : (
                <h1 className="t-display">{item.title}</h1>
              )}
            </div>
            <div className="hero-reveal">
              <MetaLine item={item} />
            </div>
            <p className="hero-tagline hero-reveal">{item.tagline || item.overview}</p>
            <div className="hero-actions hero-reveal">
              <PillButton icon={Play} progress={progress} onPress={play} focusKey="HERO-PLAY" onFocus={onFocusHero}>
                {label}
              </PillButton>
              <PillButton
                icon={Info}
                variant="glass"
                onPress={more}
                focusKey="HERO-INFO"
                onFocus={onFocusHero}
                onArrowPress={(dir) => {
                  if (dir === 'right') {
                    goTo(index + 1)
                    return false
                  }
                  return true
                }}
              >
                More Info
              </PillButton>
            </div>
          </div>
        </div>

        <div className="hero-dots">
          {items.map((it, i) => (
            <button key={it.id} className={`hero-dot ${i === index ? 'is-active' : ''}`} onClick={() => goTo(i)} aria-label={it.title}>
              {i === index && <span className="hero-dot-fill" key={`${index}-${previewing}`} style={{ animationDuration: `${previewing ? PREVIEW_MS : STILL_MS}ms` }} />}
            </button>
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}

export function HeroSkeleton() {
  return (
    <section className="hero">
      <div className="hero-media skeleton" />
      <div className="hero-content">
        <div className="skeleton sk-block" style={{ width: 380, height: 120, borderRadius: 16 }} />
        <div className="skeleton sk-line" style={{ width: 420, marginTop: 28 }} />
        <div className="skeleton sk-line" style={{ width: 520, marginTop: 18 }} />
        <div className="hero-actions">
          <div className="skeleton" style={{ width: 168, height: 54, borderRadius: 999 }} />
          <div className="skeleton" style={{ width: 150, height: 54, borderRadius: 999 }} />
        </div>
      </div>
    </section>
  )
}

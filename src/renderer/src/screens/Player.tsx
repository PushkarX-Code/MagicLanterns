import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Captions,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import type { PlaybackSource, Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { api } from '../lib/api'
import { timecode } from '../lib/format'
import { BlurImage } from '../components/BlurImage'
import { Popover, type PopoverOption } from '../components/Popover'
import { FocusContext, ScreenActive, pauseFocus, resumeFocus, setFocus, useFocus } from '../focus/focus'
import { useNav } from '../state/nav'
import { useSettings } from '../state/settings'
import { gsap, d, EASE } from '../design/motion'

const HIDE_AFTER = 3000
const NEXT_CARD_LEAD = 30 // seconds before the end the Next Episode card slides in
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4]
const WHEEL_NOTCH = 100 // deltaY of one mouse-wheel click
const speedLabel = (s: number): string => (s === 1 ? 'Normal' : `${s}×`)
const REPEAT_LABEL: Record<Settings['repeat'], string> = { off: 'Repeat Off', one: 'Repeat One', all: 'Repeat All' }

type Menu = null | 'audio' | 'subs' | 'speed'

function CircleButton({ icon: Icon, label, onPress, big }: { icon: typeof Play; label: string; onPress: () => void; big?: boolean }) {
  return (
    <button className={`pl-circle glass ${big ? 'big' : ''}`} onClick={onPress} aria-label={label}>
      <Icon size={big ? 40 : 30} strokeWidth={1.6} fill={Icon === Play || Icon === Pause ? 'currentColor' : 'none'} />
    </button>
  )
}

/** Bottom-bar button. The player owns the keyboard (shortcuts), so these are pointer targets only. */
function BarButton({ icon: Icon, label, onPress, active }: { icon: typeof Play; label: string; onPress: () => void; active?: boolean }) {
  return (
    <button className={`pl-btn ${active ? 'is-active' : ''}`} onClick={onPress} aria-label={label}>
      <Icon size={24} strokeWidth={1.6} />
      <span className="gib-tip">{label}</span>
    </button>
  )
}

function FocusPill({ children, onPress, focusKey, className = '' }: { children: React.ReactNode; onPress: () => void; focusKey: string; className?: string }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ focusKey, onEnterPress: onPress })
  return (
    <button ref={ref} className={`${className} ${focused ? 'is-focused' : ''}`} onClick={onPress} {...pointer}>
      {children}
    </button>
  )
}

/** A pasted stream link has no library entry; describe it from the URL alone. */
function streamSource(url: string, title?: string): PlaybackSource {
  let host = url
  let name = ''
  try {
    const u = new URL(url)
    host = u.host
    // "Some.Film_2024.m3u8" → "Some Film 2024"
    name = decodeURIComponent(u.pathname.split('/').pop() ?? '')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[._]+/g, ' ')
      .trim()
  } catch {
    /* keep the raw text */
  }
  return {
    url,
    itemId: null,
    title: title || name || host,
    logo: null,
    subtitle: `Network Stream · ${host}`,
    overview: url,
    backdrop: null,
    color: '#1c1c20',
    resumeFraction: 0,
    file: null
  }
}

interface PlayerProps {
  itemId?: string
  episodeId?: string
  /** A file from the Files screen (library match or a loose file). */
  fileId?: string
  /** A network stream URL. */
  url?: string
  title?: string
  fresh?: boolean
}

export function Player({ itemId, episodeId, fileId, url: streamUrl, title: streamTitle, fresh }: PlayerProps) {
  const back = useNav((s) => s.back)
  const replace = useNav((s) => s.replace)
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const cfg = settings ?? DEFAULT_SETTINGS
  const step = cfg.seekStep

  const [src, setSrc] = useState<PlaybackSource | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(() => useSettings.getState().settings?.defaultSpeed ?? DEFAULT_SETTINGS.defaultSpeed)
  const [showRemaining, setShowRemaining] = useState(() => useSettings.getState().settings?.showRemaining ?? true)
  const [audio, setAudio] = useState(0)
  const [subtitle, setSubtitle] = useState<number | null>(null)
  const [visible, setVisible] = useState(true)
  const [menu, setMenu] = useState<Menu>(null)
  const [resumePrompt, setResumePrompt] = useState(false)
  const [scrub, setScrub] = useState<{ x: number; t: number; dragging: boolean } | null>(null)
  const [hud, setHud] = useState<string | null>(null)
  const [cuePreview, setCuePreview] = useState(false)
  const [nextDismissed, setNextDismissed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const video = useRef<HTMLVideoElement>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const chrome = useRef<HTMLDivElement>(null)
  const pauseCard = useRef<HTMLDivElement>(null)
  const nextCard = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const hideTimer = useRef(0)
  const hudTimer = useRef(0)
  const candidates = useRef<string[]>([])
  const lastSaved = useRef(0)
  const lastPointer = useRef({ x: -1, y: -1 })
  const wheel = useRef(0)

  const { ref: root, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'PLAYER', trackChildren: true, isFocusBoundary: true })

  // Load the playback plan.
  useEffect(() => {
    let alive = true
    const load: Promise<PlaybackSource> = fileId
      ? api.getFilePlayback(fileId)
      : streamUrl
        ? Promise.resolve(streamSource(streamUrl, streamTitle))
        : itemId
          ? api.getPlayback(itemId, episodeId)
          : Promise.reject(new Error('Nothing to play'))
    load
      .then((s) => {
        if (!alive) return
        setSrc(s)
        candidates.current = [s.url, ...(s.alternates ?? [])].filter(Boolean)
        const first = candidates.current.shift() ?? null
        setUrl(first)
        if (!first) setFailed(true)
        const resumable = !fresh && s.resumeFraction > 0.01 && s.resumeFraction < 0.95
        setResumePrompt(resumable && (useSettings.getState().settings?.resumeMode ?? 'ask') === 'ask')
        const def = s.file?.audio.findIndex((a) => a.default) ?? -1
        setAudio(Math.max(0, def))
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [itemId, episodeId, fileId, streamUrl, streamTitle, fresh])

  // The player owns the keyboard; the focus engine only drives open menus.
  useEffect(() => {
    pauseFocus()
    return () => resumeFocus()
  }, [])
  useEffect(() => {
    if (menu || resumePrompt) resumeFocus()
    else pauseFocus()
  }, [menu, resumePrompt])

  useEffect(() => window.lantern?.onFullscreen(setFullscreen), [])

  const save = useCallback(() => {
    const v = video.current
    // Loose files and streams have no library entry to remember progress on.
    if (!v || !src?.itemId || !v.duration || !Number.isFinite(v.duration)) return
    lastSaved.current = Date.now()
    api.saveProgress(src.itemId, src.episodeId, v.currentTime, v.duration)
  }, [src])

  // Save on the way out.
  useEffect(() => () => save(), [save])

  // ---------- Chrome visibility ----------
  const poke = useCallback(() => {
    setVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      const v = video.current
      if (v && !v.paused && !menu) setVisible(false)
    }, HIDE_AFTER)
  }, [menu])

  useEffect(() => {
    const el = chrome.current
    if (!el) return
    gsap.to(el, { autoAlpha: visible || !playing || menu ? 1 : 0, duration: d(visible ? 0.35 : 0.8), ease: 'power2.out', overwrite: true })
    if (root.current) root.current.style.cursor = visible || !playing ? 'default' : 'none'
  }, [visible, playing, menu])

  // Paused: the frame dims and a glass card tells you where you are.
  useEffect(() => {
    const el = pauseCard.current
    if (!el) return
    const show = ready && !playing && !resumePrompt && !scrub
    gsap.to(el, { autoAlpha: show ? 1 : 0, y: show ? 0 : 12, duration: d(show ? 0.6 : 0.3), ease: EASE.settle, delay: show ? 0.25 : 0, overwrite: true })
  }, [ready, playing, resumePrompt, !!scrub])

  // ---------- Transport ----------
  const toggle = useCallback(() => {
    const v = video.current
    if (!v || resumePrompt) return
    if (v.paused) v.play().catch(() => undefined)
    else v.pause()
    poke()
  }, [poke, resumePrompt])

  const seekTo = useCallback(
    (t: number) => {
      const v = video.current
      if (!v || !v.duration) return
      v.currentTime = Math.max(0, Math.min(v.duration - 0.25, t))
      setTime(v.currentTime)
      poke()
    },
    [poke]
  )

  const flash = (text: string): void => {
    setHud(text)
    window.clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHud(null), 1100)
  }

  const changeVolume = (direction: 1 | -1): void => {
    const v = video.current
    if (!v) return
    v.volume = Math.max(0, Math.min(1, Math.round(v.volume * 100 + direction * cfg.volumeStep) / 100))
    v.muted = false
    flash(`volume:${v.volume}`)
  }

  const toggleFullscreen = (): void => {
    if (window.lantern) window.lantern.toggleFullscreen()
    else if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }
  useEffect(() => {
    if (window.lantern) return
    const on = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const exit = (): void => {
    save()
    if (fullscreen) toggleFullscreen()
    back()
  }

  const playNext = (): void => {
    if (!src?.next) return
    save()
    replace({ name: 'player', itemId: src.next.itemId, episodeId: src.next.episodeId, fresh: true })
  }

  const setRate = (s: number): void => {
    setSpeed(s)
    if (video.current) video.current.playbackRate = s
  }
  const nudgeSpeed = (direction: 1 | -1): void => {
    const i = SPEEDS.indexOf(speed)
    const at = i === -1 ? SPEEDS.indexOf(1) : i
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, at + direction))]
    setRate(next)
    flash(`Speed · ${speedLabel(next)}`)
  }
  const skip = (direction: 1 | -1): void => {
    seekTo((video.current?.currentTime ?? 0) + direction * step)
    flash(`${direction > 0 ? '+' : '-'}${step}`)
  }
  const cycleRepeat = (): void => {
    const order: Settings['repeat'][] = ['off', 'one', 'all']
    const next = order[(order.indexOf(cfg.repeat) + 1) % order.length]
    updateSettings({ repeat: next })
    flash(REPEAT_LABEL[next])
  }
  const onFinished = (): void => {
    const v = video.current
    const again = (): void => {
      if (!v) return
      v.currentTime = 0
      v.play().catch(() => undefined)
    }
    if (cfg.repeat === 'one') return again()
    if (src?.next && (cfg.autoplayNext || cfg.repeat === 'all')) return playNext()
    if (cfg.repeat === 'all') return again()
    exit()
  }

  const cycleSubs = (): void => {
    const list = src?.file?.subtitles ?? []
    if (!list.length) {
      flash('No Subtitles')
      return
    }
    const i = subtitle === null ? 0 : list.findIndex((s) => s.index === subtitle) + 1
    const next = i < list.length ? list[i].index : null
    setSubtitle(next)
    flash(next === null ? 'Subtitles Off' : `Subtitles · ${list[i].title}`)
  }

  const intro = src?.intro
  const inIntro = !!intro && time >= intro.start && time < intro.end
  const showNext = !!src?.next && duration > 0 && duration - time <= NEXT_CARD_LEAD && !nextDismissed
  const countdown = Math.max(0, Math.ceil(duration - time - 5))

  // Auto-play the next episode when the countdown runs out.
  useEffect(() => {
    if (showNext && countdown === 0 && settings?.autoplayNext) playNext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNext, countdown])

  useEffect(() => {
    const el = nextCard.current
    if (!el) return
    gsap.to(el, { x: showNext ? 0 : 60, autoAlpha: showNext ? 1 : 0, duration: d(0.7), ease: EASE.settle, overwrite: true })
  }, [showNext])

  // Keyboard map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (menu) return // the open popover handles keys
      const v = video.current
      if (resumePrompt) {
        if (e.key === 'Escape') exit()
        return
      }
      let handled = true
      switch (e.key) {
        case ' ':
        case 'k':
          toggle()
          break
        case 'Enter':
          if (showNext) playNext()
          else if (inIntro && intro) seekTo(intro.end)
          else toggle()
          break
        case 'ArrowLeft':
          skip(-1)
          break
        case 'ArrowRight':
          skip(1)
          break
        case 'ArrowUp':
          changeVolume(1)
          break
        case 'ArrowDown':
          changeVolume(-1)
          break
        case '[':
        case '-':
          nudgeSpeed(-1)
          break
        case ']':
        case '+':
          nudgeSpeed(1)
          break
        case '=':
          setRate(1)
          flash('Speed · Normal')
          break
        case 'l':
        case 'L':
          cycleRepeat()
          break
        case 'n':
        case 'N':
          if (src?.next) playNext()
          else handled = false
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'm':
        case 'M':
          if (v) {
            v.muted = !v.muted
            flash(v.muted ? 'Muted' : `volume:${v.volume}`)
          }
          break
        case 's':
        case 'S':
          cycleSubs()
          break
        case 'Escape':
        case 'Backspace':
          exit()
          break
        default:
          handled = false
      }
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
        poke()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // ---------- Video events ----------
  const onLoaded = (): void => {
    const v = video.current
    if (!v || !src) return
    setDuration(Number.isFinite(v.duration) ? v.duration : Infinity)
    setReady(true)
    v.playbackRate = speed
    if (!resumePrompt) {
      // "Always resume" picks up silently; "Never" (and fresh plays) start from the top.
      const f = src.resumeFraction
      if (!fresh && cfg.resumeMode === 'always' && f > 0.01 && f < 0.95 && Number.isFinite(v.duration)) v.currentTime = f * v.duration
      v.play().catch(() => undefined)
    }
    poke()
  }

  const onError = (): void => {
    const next = candidates.current.shift()
    if (next) setUrl(next)
    else setFailed(true)
  }

  const resume = (fromStart: boolean): void => {
    const v = video.current
    setResumePrompt(false)
    if (!v || !src) return
    v.currentTime = fromStart ? 0 : src.resumeFraction * (v.duration || 0)
    v.playbackRate = speed
    v.play().catch(() => undefined)
    poke()
  }

  // Drop any local video file onto the player to preview with real media.
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('video')) {
      setFailed(false)
      setReady(false)
      setUrl(URL.createObjectURL(file))
    }
  }

  // ---------- Scrubber ----------
  const posFromEvent = (clientX: number): { x: number; t: number } => {
    const r = bar.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(r.width, clientX - r.left))
    return { x, t: (x / r.width) * (duration || 0) }
  }
  const previewSeek = useRef(0)
  useEffect(() => {
    const p = preview.current
    if (!p || !scrub) return
    window.clearTimeout(previewSeek.current)
    previewSeek.current = window.setTimeout(() => {
      if (Math.abs(p.currentTime - scrub.t) > 0.5) p.currentTime = scrub.t
    }, 60)
  }, [scrub])

  const onBarDown = (e: React.PointerEvent): void => {
    if (!Number.isFinite(duration) || !duration) return // live streams can't be scrubbed
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setScrub({ ...posFromEvent(e.clientX), dragging: true })
  }
  const onBarMove = (e: React.PointerEvent): void => {
    setScrub((s) => ({ ...posFromEvent(e.clientX), dragging: !!s?.dragging }))
  }
  const onBarUp = (e: React.PointerEvent): void => {
    const { t } = posFromEvent(e.clientX)
    seekTo(t)
    setScrub((s) => (s ? { ...s, dragging: false } : null))
  }

  // ---------- Menus ----------
  const subSize = settings?.subtitleSize ?? 'medium'
  const subStyle = settings?.subtitleStyle ?? 'shadow'
  const cycle = <T extends string>(list: T[], v: T): T => list[(list.indexOf(v) + 1) % list.length]
  const menuOptions = (): PopoverOption[] => {
    if (!src) return []
    const tracks = src.file?.audio ?? []
    if (menu === 'audio')
      return tracks.length
        ? tracks.map((a, i) => ({ label: a.title, checked: i === audio, onSelect: () => setAudio(i) }))
        : [{ label: 'Default Track', checked: true, onSelect: () => undefined }]
    if (menu === 'speed')
      return [
        ...SPEEDS.map((s) => ({ label: speedLabel(s), checked: s === speed, onSelect: () => setRate(s) })),
        { label: REPEAT_LABEL[cfg.repeat], hint: 'L', divider: true, keepOpen: true, onSelect: cycleRepeat }
      ]
    const preview = (): void => {
      setCuePreview(true)
      window.setTimeout(() => setCuePreview(false), 2600)
    }
    return [
      { label: 'Off', checked: subtitle === null, onSelect: () => setSubtitle(null) },
      ...(src.file?.subtitles ?? []).map((s) => ({
        label: s.title,
        hint: s.external ? 'SRT' : undefined,
        checked: subtitle === s.index,
        onSelect: () => {
          setSubtitle(s.index)
          preview()
        }
      })),
      {
        label: 'Size',
        hint: subSize[0].toUpperCase() + subSize.slice(1),
        keepOpen: true,
        onSelect: () => {
          updateSettings({ subtitleSize: cycle<Settings['subtitleSize']>(['small', 'medium', 'large'], subSize) })
          preview()
        }
      },
      {
        label: 'Style',
        hint: subStyle[0].toUpperCase() + subStyle.slice(1),
        keepOpen: true,
        onSelect: () => {
          updateSettings({ subtitleStyle: cycle<Settings['subtitleStyle']>(['shadow', 'glass', 'outline'], subStyle) })
          preview()
        }
      }
    ]
  }

  const finite = Number.isFinite(duration) && duration > 0
  const remaining = finite ? Math.max(0, duration - time) : 0
  const pct = finite ? (time / duration) * 100 : 0
  const bufPct = finite ? (buffered / duration) * 100 : 0
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const subTrack = src?.file?.subtitles.find((s) => s.index === subtitle)
  const live = !Number.isFinite(duration) // live HLS streams report an infinite duration

  return (
    <ScreenActive.Provider value={true}>
      <FocusContext.Provider value={focusKey}>
        <div
          ref={root}
          className={`player ${playing ? 'is-playing' : 'is-paused'}`}
          onPointerMove={(e) => {
            // Browsers fire synthetic moves when the chrome fades under a resting cursor; only real travel wakes it.
            const last = lastPointer.current
            if (Math.abs(e.screenX - last.x) + Math.abs(e.screenY - last.y) > 2) poke()
            lastPointer.current = { x: e.screenX, y: e.screenY }
          }}
          onClick={(e) => e.target === e.currentTarget && toggle()}
          onDoubleClick={(e) => cfg.doubleClickFullscreen && e.target === e.currentTarget && toggleFullscreen()}
          onWheel={(e) => {
            if (menu || resumePrompt || cfg.wheelAction === 'off') return
            if ((e.target as HTMLElement).closest('.popover')) return
            // Trackpads send many tiny deltas; act once per wheel notch.
            wheel.current += e.deltaY
            if (Math.abs(wheel.current) < WHEEL_NOTCH) return
            const dir = wheel.current < 0 ? 1 : -1
            wheel.current = 0
            if (cfg.wheelAction === 'volume') changeVolume(dir)
            else skip(dir)
            poke()
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {/* Poster frame while the stream spins up: never a black void. */}
          {!ready && (
            <div className="pl-loading">
              <BlurImage path={src?.backdrop ?? null} size="w1280" tiny="w300" color={src?.color ?? '#1c1c20'} />
              <div className="pl-loading-scrim" />
              {!failed && <div className="pl-spinner" />}
              {failed && (
                <div className="pl-failed">
                  <div className="pl-failed-title">This one won't light up</div>
                  <div className="pl-failed-line">
                    {streamUrl
                      ? "This stream couldn't be reached, or its format needs the FFmpeg engine. Check the link and try again."
                      : fileId && !src?.itemId
                        ? "This file couldn't be opened. It may have moved, or its format needs the FFmpeg engine."
                        : "The preview film couldn't be reached. Drop any video file here to play it."}
                  </div>
                </div>
              )}
            </div>
          )}

          {url && (
            <video
              ref={video}
              className="pl-video"
              src={url}
              preload="auto"
              onLoadedMetadata={onLoaded}
              onError={onError}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false)
                save()
                setVisible(true)
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget
                setTime(v.currentTime)
                if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
                if (Date.now() - lastSaved.current > 5000) save()
              }}
              onVolumeChange={(e) => {
                setVolume(e.currentTarget.volume)
                setMuted(e.currentTarget.muted)
              }}
              onEnded={onFinished}
              onClick={toggle}
              onDoubleClick={() => cfg.doubleClickFullscreen && toggleFullscreen()}
            />
          )}

          <div className="pl-dim" style={{ opacity: ready && !playing ? 1 : 0 }} />

          {/* Subtitles (real cues arrive with the FFmpeg pipeline; style preview works now). */}
          {subTrack && cuePreview && (
            <div className={`pl-cue size-${subSize} style-${subStyle}`} style={{ bottom: visible ? 190 : 72 }}>
              <span>{subTrack.title} subtitles will look like this.</span>
            </div>
          )}

          {/* Pause info card */}
          {src && (
            <div ref={pauseCard} className="pl-pause glass" style={{ opacity: 0, visibility: 'hidden' }}>
              <BlurImage
                path={src.logo}
                size="w500"
                tiny={false}
                color="transparent"
                fit="contain"
                position="left center"
                className="pl-pause-logo"
                fallback={<div className="t-title pl-pause-title">{src.title}</div>}
              />
              <div className="pl-pause-sub">{src.subtitle}</div>
              <p className="pl-pause-overview">{src.overview}</p>
              <div className="pl-pause-pos">
                {timecode(time)} of {timecode(duration)}
              </div>
            </div>
          )}

          <div ref={chrome} className="pl-chrome">
            <div className="pl-top">
              <button className="pl-close glass" onClick={exit} aria-label="Close">
                <X size={23} strokeWidth={1.8} />
              </button>
              {src && (
                <div className="pl-title">
                  <BlurImage
                    path={src.logo}
                    size="w500"
                    tiny={false}
                    color="transparent"
                    fit="contain"
                    position="left center"
                    className="pl-title-logo"
                    alt={src.title}
                    fallback={<div className="pl-title-text">{src.title}</div>}
                  />
                  <div className="pl-title-sub">{src.subtitle}</div>
                </div>
              )}
            </div>

            <div className="pl-center" style={{ display: ready ? undefined : 'none' }} onClick={(e) => e.stopPropagation()}>
              <CircleButton icon={RotateCcw} label={`Back ${step} seconds`} onPress={() => skip(-1)} />
              <CircleButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onPress={toggle} big />
              <CircleButton icon={RotateCw} label={`Forward ${step} seconds`} onPress={() => skip(1)} />
            </div>

            <div className="pl-bottom glass" onClick={(e) => e.stopPropagation()}>
              <div
                ref={bar}
                className={`pl-bar ${scrub ? 'is-active' : ''}`}
                onPointerDown={onBarDown}
                onPointerMove={onBarMove}
                onPointerUp={onBarUp}
                onPointerLeave={() => setScrub((s) => (s?.dragging ? s : null))}
              >
                <div className="pl-track">
                  <div className="pl-buffer" style={{ width: `${bufPct}%` }} />
                  <div className="pl-fill" style={{ width: `${scrub?.dragging ? (scrub.t / (duration || 1)) * 100 : pct}%` }} />
                  {intro && duration > 0 && (
                    <div className="pl-chapter" style={{ left: `${(intro.start / duration) * 100}%`, width: `${((intro.end - intro.start) / duration) * 100}%` }} />
                  )}
                </div>
                <div className="pl-knob" style={{ left: `${scrub?.dragging ? (scrub.t / (duration || 1)) * 100 : pct}%` }} />
                <div className="pl-thumb" style={{ left: scrub?.x ?? 0, opacity: scrub ? 1 : 0 }}>
                  <div className="pl-thumb-frame">{url && <video ref={preview} src={url} muted preload="metadata" />}</div>
                  <div className="pl-thumb-time">{timecode(scrub?.t ?? 0)}</div>
                </div>
              </div>
              <div className="pl-row">
                <span className="pl-time">{timecode(time)}</span>
                <span className="pl-row-title">{src?.subtitle}</span>
                <div className="pl-buttons">
                  <div className="popover-anchor">
                    <BarButton icon={AudioLines} label="Audio" active={menu === 'audio'} onPress={() => setMenu(menu === 'audio' ? null : 'audio')} />
                    {menu === 'audio' && <Popover title="Audio" placement="above" align="right" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                  <div className="popover-anchor">
                    <BarButton icon={Captions} label="Subtitles" active={menu === 'subs' || subtitle !== null} onPress={() => setMenu(menu === 'subs' ? null : 'subs')} />
                    {menu === 'subs' && <Popover title="Subtitles" placement="above" align="right" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                  <div className="popover-anchor">
                    <BarButton icon={Gauge} label={speed === 1 ? 'Speed' : `Speed · ${speedLabel(speed)}`} active={menu === 'speed' || speed !== 1 || cfg.repeat !== 'off'} onPress={() => setMenu(menu === 'speed' ? null : 'speed')} />
                    {menu === 'speed' && <Popover title="Playback Speed" placement="above" align="right" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                  <BarButton
                    icon={PictureInPicture2}
                    label="Picture in Picture"
                    onPress={() => {
                      const v = video.current
                      if (!v) return
                      if (document.pictureInPictureElement) document.exitPictureInPicture()
                      else v.requestPictureInPicture?.().catch(() => undefined)
                    }}
                  />
                  <BarButton
                    icon={VolumeIcon}
                    label={muted ? 'Unmute' : 'Mute'}
                    onPress={() => {
                      if (video.current) video.current.muted = !video.current.muted
                    }}
                  />
                  <BarButton icon={fullscreen ? Minimize : Maximize} label={fullscreen ? 'Exit Full Screen' : 'Full Screen'} onPress={toggleFullscreen} />
                </div>
                <button
                  className="pl-time right"
                  aria-label={showRemaining ? 'Show total length' : 'Show time remaining'}
                  onClick={() => {
                    setShowRemaining(!showRemaining)
                    updateSettings({ showRemaining: !showRemaining })
                  }}
                >
                  {live ? 'LIVE' : showRemaining ? `-${timecode(remaining)}` : timecode(duration)}
                </button>
              </div>
            </div>
          </div>

          {inIntro && !resumePrompt && intro && (
            <FocusPill focusKey="SKIP-INTRO" className="pl-skip glass-strong" onPress={() => seekTo(intro.end)}>
              <SkipForward size={16} strokeWidth={1.8} /> Skip Intro
            </FocusPill>
          )}

          {src?.next && (
            <div ref={nextCard} className="pl-next glass-strong" style={{ opacity: 0, visibility: 'hidden' }}>
              <div className="pl-next-art">
                <BlurImage path={src.next.still} size="w500" tiny="w185" color={src.color} />
                <svg className="pl-next-ring" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="17" />
                  <circle cx="20" cy="20" r="17" className="fg" style={{ strokeDashoffset: 107 * (countdown / (NEXT_CARD_LEAD - 5)) }} />
                </svg>
                <span className="pl-next-count">{countdown}</span>
              </div>
              <div className="pl-next-body">
                <div className="pl-next-kicker">Next Episode · {src.next.label}</div>
                <div className="pl-next-title">{src.next.title}</div>
                <div className="pl-next-actions">
                  <button className="pill pill-solid sm" onClick={playNext}>
                    <Play size={14} fill="currentColor" strokeWidth={0} /> Play Now
                  </button>
                  <button className="pill pill-glass sm" onClick={() => setNextDismissed(true)}>
                    Watch Credits
                  </button>
                </div>
              </div>
            </div>
          )}

          {hud && (
            <div className="pl-hud glass-strong" key={hud}>
              {hud.startsWith('volume:') ? (
                <>
                  <VolumeIcon size={18} strokeWidth={1.7} />
                  <span className="pl-hud-bar">
                    <span style={{ width: `${Number(hud.split(':')[1]) * 100}%` }} />
                  </span>
                </>
              ) : /^[+-]\d+$/.test(hud) ? (
                <>
                  {hud.startsWith('+') ? <RotateCw size={18} strokeWidth={1.7} /> : <RotateCcw size={18} strokeWidth={1.7} />}
                  <span>{hud} sec</span>
                </>
              ) : (
                <span>{hud}</span>
              )}
            </div>
          )}

          {resumePrompt && src && (
            <ResumePrompt
              title={src.title}
              subtitle={src.subtitle}
              at={timecode(src.resumeFraction * (duration || 0))}
              ready={ready}
              onResume={() => resume(false)}
              onRestart={() => resume(true)}
            />
          )}
        </div>
      </FocusContext.Provider>
    </ScreenActive.Provider>
  )
}

function ResumePrompt({ title, subtitle, at, ready, onResume, onRestart }: { title: string; subtitle: string; at: string; ready: boolean; onResume: () => void; onRestart: () => void }) {
  const { ref: panel, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'RESUME', isFocusBoundary: true, trackChildren: true })
  useEffect(() => {
    if (panel.current) gsap.fromTo(panel.current, { opacity: 0, scale: 0.96, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: d(0.5), ease: EASE.settle })
    requestAnimationFrame(() => setFocus('RESUME-YES'))
  }, [])
  return (
    <FocusContext.Provider value={focusKey}>
      <div className="modal-scrim">
        <div ref={panel} className="resume glass-strong">
          <div className="resume-kicker">{subtitle}</div>
          <div className="resume-title">{title}</div>
          <div className="resume-actions">
            <FocusPill focusKey="RESUME-YES" className="pill pill-solid" onPress={onResume}>
              <Play size={18} fill="currentColor" strokeWidth={0} /> {ready ? `Resume from ${at}` : 'Resume'}
            </FocusPill>
            <FocusPill focusKey="RESUME-NO" className="pill pill-glass" onPress={onRestart}>
              <RotateCcw size={18} strokeWidth={1.8} /> Start from Beginning
            </FocusPill>
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  )
}

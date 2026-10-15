import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Share,
  Camera,
  Captions,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { playerCaps } from '../player/caps'
import type { PlaybackPlan, PlaybackSource, Settings, SubtitleTrack } from '@shared/types'
import { cuesAt, type Cue } from '@shared/subs'
import { sameLanguage } from '@shared/text'
import { DEFAULT_SETTINGS, EQ_PRESETS } from '@shared/settings'
import { AudioChain, isLocalSource, needsChain } from '../player/audioChain'
import { PipIcon } from '../components/Icons'
import { AmbientLight, type PictureShape } from '../components/AmbientLight'
import { CinemaBar } from '../components/CinemaBar'
import { SoundStage } from '../components/SoundStage'
import { api } from '../lib/api'
import { timecode } from '../lib/format'
import { BlurImage } from '../components/BlurImage'
import { backdropSize } from '../lib/img'
import { Popover, type PopoverOption } from '../components/Popover'
import { FocusContext, ScreenActive, pauseFocus, resumeFocus, useFocus } from '../focus/focus'
import { useNav } from '../state/nav'
import { useSettings } from '../state/settings'
import { gsap, d, EASE } from '../design/motion'

const HIDE_AFTER = 3000
const NEXT_CARD_LEAD = 30 // seconds before the end the Next Episode card slides in
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4]
const WHEEL_NOTCH = 100 // deltaY of one mouse-wheel click
const speedLabel = (s: number): string => (s === 1 ? 'Normal' : `${s}×`)
const FIT_ORDER: Settings['videoFit'][] = ['fit', 'fill', 'stretch']
const FIT_LABEL: Record<Settings['videoFit'], string> = { fit: 'Fit to Screen', fill: 'Fill Screen', stretch: 'Stretch' }
const FIT_CSS: Record<Settings['videoFit'], React.CSSProperties['objectFit']> = { fit: 'contain', fill: 'cover', stretch: 'fill' }
const ASPECT_ORDER: Settings['aspect'][] = ['auto', '16:9', '4:3', '21:9', '2.39:1', '1:1']

/** Size, crop and colour of the picture, from the Video settings. */
function videoStyle(s: Settings): React.CSSProperties {
  const style: React.CSSProperties = { objectFit: FIT_CSS[s.videoFit] }
  if (s.aspect !== 'auto') {
    // Force a shape: the largest box of that ratio that fits the window, picture stretched into it.
    const [w, h] = s.aspect.split(':').map(Number)
    const r = w / h
    Object.assign(style, {
      inset: 'auto',
      left: '50%',
      top: '50%',
      width: `min(100cqw, ${100 * r}cqh)`,
      height: `min(100cqh, ${100 / r}cqw)`,
      translate: '-50% -50%',
      objectFit: 'fill'
    })
  }
  const f = [
    s.brightness !== 100 && `brightness(${s.brightness}%)`,
    s.contrast !== 100 && `contrast(${s.contrast}%)`,
    s.saturation !== 100 && `saturate(${s.saturation}%)`,
    s.hue !== 0 && `hue-rotate(${s.hue}deg)`
  ].filter(Boolean)
  if (f.length) style.filter = f.join(' ')
  return style
}

/**
 * Cinema Mode crops black bars baked into the file, so Ambient Light fills them instead. The frame grows so
 * the picture keeps its size and place, and the bars are clipped away. Any fit or shape the viewer chose wins.
 */
function cinemaFrame(s: Settings, shape: PictureShape | null): React.CSSProperties | null {
  if (s.videoFit !== 'fit' || s.aspect !== 'auto') return null
  const { top = 0, bottom = 0, aspect = 16 / 9 } = shape ?? {}
  const kept = 1 - top - bottom
  const width = `min(100cqw, ${(aspect / kept) * 100}cqh)`
  const height = `calc(${width} / ${aspect})`
  return {
    inset: 'auto',
    left: '50%',
    translate: '-50% 0',
    width,
    height,
    top: `calc(50cqh - ${height} * ${top + kept / 2})`,
    objectFit: 'fill',
    clipPath: `inset(${top * 100}% 0 ${bottom * 100}% 0)`
  }
}

const BOOSTS = [100, 125, 150, 200]
const EQ_NAMES = Object.keys(EQ_PRESETS)

type SinkElement = HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }

/** Where the picture actually sits inside the <video> box (object-fit: contain leaves bars). */
function pictureRect(v: HTMLVideoElement): { x: number; y: number; width: number; height: number } {
  const r = v.getBoundingClientRect()
  const fit = getComputedStyle(v).objectFit
  let { width, height } = r
  if (fit === 'contain' && v.videoWidth && v.videoHeight) {
    const scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight)
    width = v.videoWidth * scale
    height = v.videoHeight * scale
  }
  const x = Math.max(0, r.x + (r.width - width) / 2)
  const y = Math.max(0, r.y + (r.height - height) / 2)
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(width, window.innerWidth - x)),
    height: Math.round(Math.min(height, window.innerHeight - y))
  }
}

const REPEAT_LABEL: Record<Settings['repeat'], string> = { off: 'Repeat Off', one: 'Repeat One', all: 'Repeat All' }

type Menu = null | 'audio' | 'subs' | 'speed' | 'share'

/** What the playback engine is asked to open: a library file by id, or a file picked from disk by path. */
function targetOf(s: PlaybackSource): { fileId?: string; path?: string } | null {
  if (s.file?.id) return { fileId: s.file.id }
  const m = /^ml-file:\/\/local\/(.+)$/.exec(s.url)
  return m ? { path: decodeURIComponent(m[1]) } : null
}

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
  /** Opened from Cinema Mode: Ambient Light, Sound Stage, and slower, softer transitions. */
  cinema?: boolean
}

/** One subtitle cue: its lines, with the italics and bold the file asked for. */
function CueText({ text }: { text: string }) {
  let i = false
  let b = false
  return (
    <div>
      <span>
        {text.split('\n').map((line, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {line.split(/(<\/?[ib]>)/).map((part, k) => {
              if (/^<\/?i>$/.test(part)) i = part === '<i>'
              else if (/^<\/?b>$/.test(part)) b = part === '<b>'
              else if (part) {
                const words = i ? <i>{part}</i> : part
                return <Fragment key={k}>{b ? <b>{words}</b> : words}</Fragment>
              }
              return null
            })}
          </Fragment>
        ))}
      </span>
    </div>
  )
}

export function Player({ itemId, episodeId, fileId, url: streamUrl, title: streamTitle, fresh, cinema = false }: PlayerProps) {
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
  // Every subtitle track on offer (the file's own, then files beside it) and the lines of the chosen one.
  const [tracks, setTracks] = useState<SubtitleTrack[]>([])
  const [cues, setCues] = useState<Cue[] | null>(null)
  const [subClock, setSubClock] = useState(0)
  const [thumb, setThumb] = useState<{ t: number; src: string } | null>(null)
  const [catchingUp, setCatchingUp] = useState(false)
  const [visible, setVisible] = useState(true)
  const [menu, setMenu] = useState<Menu>(null)
  const [scrub, setScrub] = useState<{ x: number; t: number; dragging: boolean } | null>(null)
  const [hud, setHud] = useState<string | null>(null)
  const [cuePreview, setCuePreview] = useState(false)
  const [nextDismissed, setNextDismissed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const video = useRef<HTMLVideoElement>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const chrome = useRef<HTMLDivElement>(null)
  const nextCard = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const hideTimer = useRef(0)
  const hudTimer = useRef(0)
  const candidates = useRef<string[]>([])
  // The playback engine's plan for this file. Stream modes start part-way in: the picture's clock counts
  // from the stream's start, so the film's position is offset + currentTime.
  const engine = useRef<{ plan: PlaybackPlan; target: { fileId?: string; path?: string }; offset: number; forced: boolean } | null>(null)
  const [streaming, setStreaming] = useState(false)
  const seekTimer = useRef(0)
  const lastSaved = useRef(0)
  const lastPointer = useRef({ x: -1, y: -1 })
  const wheel = useRef(0)
  const chain = useRef<AudioChain | null>(null)
  const [processed, setProcessed] = useState(false)
  const [sound, setSound] = useState(false)
  const [shape, setShape] = useState<PictureShape | null>(null)
  const playingRef = useRef(false)
  playingRef.current = playing
  const levels = useCallback(() => (chain.current && playingRef.current ? chain.current.levels() : null), [])

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
        const lang = useSettings.getState().settings?.audioLanguage
        const tracks = s.file?.audio ?? []
        const preferred = lang && lang !== 'orig' ? tracks.findIndex((a) => a.language === lang) : -1
        const track = Math.max(0, preferred >= 0 ? preferred : tracks.findIndex((a) => a.default))
        setAudio(track)
        const target = targetOf(s)
        if (window.lantern?.openPlayback && target) {
          void openEngine(s, target, track, { resume: !fresh })
          return
        }
        candidates.current = [s.url, ...(s.alternates ?? [])].filter(Boolean)
        const first = candidates.current.shift() ?? null
        setUrl(first)
        if (!first) setFailed(true)
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
    if (menu) resumeFocus()
    else pauseFocus()
  }, [menu])

  useEffect(() => window.lantern?.onFullscreen(setFullscreen), [])

  // Start in full screen if asked, and leave it again on the way out.
  useEffect(() => {
    if (!useSettings.getState().settings?.startFullscreen) return
    if (window.lantern) window.lantern.setFullscreen(true)
    else if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined)
  }, [])

  // Keep on top: never, only while a film is playing, or whenever the player is open.
  useEffect(() => {
    const on = cfg.keepOnTop === 'always' || (cfg.keepOnTop === 'playing' && playing)
    window.lantern?.setAlwaysOnTop(on)
  }, [cfg.keepOnTop, playing])
  useEffect(() => () => void window.lantern?.setAlwaysOnTop(false), [])

  // Pause when the window is minimised (or the tab hidden, in a browser).
  useEffect(() => {
    const hide = (): void => {
      if (useSettings.getState().settings?.pauseOnMinimize ?? true) video.current?.pause()
    }
    const off = window.lantern?.onMinimized((min) => min && hide())
    const onVis = (): void => {
      if (!window.lantern && document.hidden) hide()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      off?.()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Audio effects (EQ, boost, normalise, delay, downmix, output device). WebAudio can only process media
  // the app reads itself, so this runs for local files; streams play through untouched.
  const local = isLocalSource(url)
  useEffect(() => {
    const v = video.current
    if (!v || !local) return
    // Cinema Mode keeps the engine running so Sound Stage can switch and meter without a pause.
    if (!chain.current && (needsChain(cfg) || cinema)) {
      try {
        chain.current = new AudioChain(v)
        setProcessed(true)
      } catch {
        return // already wired, or WebAudio unavailable: keep plain playback
      }
    }
    chain.current?.apply(cfg, src?.file?.audio[audio]?.channels ?? 2)
  }, [cfg, local, url, ready, src, audio])
  useEffect(
    () => () => {
      chain.current?.close()
      chain.current = null
    },
    []
  )
  // Without the graph, the element itself can still pick the output device.
  useEffect(() => {
    const v = video.current as SinkElement | null
    if (!v?.setSinkId || chain.current) return
    v.setSinkId(cfg.audioDevice === 'default' ? '' : cfg.audioDevice).catch(() => undefined)
  }, [cfg.audioDevice, ready, processed])

  const isStream = (): boolean => !!engine.current && engine.current.plan.mode !== 'native'
  /** Where we are in the film, in seconds, whichever way it's playing. */
  // While a stream covers the gap to the asked-for moment, that moment is where we are.
  const position = (): number => {
    const t = video.current?.currentTime ?? 0
    if (!isStream()) return t
    const gap = pendingSkip.current
    return engine.current!.offset + (gap != null ? Math.max(gap, t) : t)
  }
  const length = (): number => {
    if (isStream()) return engine.current!.plan.duration
    const d = video.current?.duration ?? 0
    return Number.isFinite(d) ? d : 0
  }
  const streamAt = (t: number): string => `${engine.current!.plan.url}?t=${Math.max(0, t).toFixed(3)}`
  /** Seconds a repackaged stream (which starts on a keyframe) still has to play through, hidden, to reach the asked-for moment. */
  const pendingSkip = useRef<number | null>(null)
  /** Starts the stream as close to `to` as it can begin, then lets the player cover the gap. */
  const streamFrom = async (to: number): Promise<void> => {
    const e = engine.current
    if (!e) return
    const begin = (await window.lantern?.snapPlayback?.(e.plan.session ?? '', to).catch(() => to)) ?? to
    if (engine.current !== e) return
    e.offset = Math.min(begin, to)
    pendingSkip.current = to - e.offset > 0.25 ? to - e.offset : null
    // Just past the keyframe: FFmpeg aims ~0.13 s early when copying, which would land on the keyframe before.
    setUrl(streamAt(e.offset + (begin < to ? 0.2 : 0)))
  }

  /** Asks the engine how to play this file, then starts it (part-way in when resuming or switching sound). */
  async function openEngine(
    s: PlaybackSource,
    target: { fileId?: string; path?: string },
    track: number,
    { resume = false, at, force = false }: { resume?: boolean; at?: number; force?: boolean } = {}
  ): Promise<void> {
    const c = useSettings.getState().settings ?? DEFAULT_SETTINGS
    try {
      const plan = await window.lantern!.openPlayback(target, {
        audio: track,
        caps: playerCaps(c.hwDecode !== 'off'),
        // Stereo downmix stays with the player's own audio processing (it works on any source), so it never forces conversion.
        settings: { downmix: false, deinterlace: c.deinterlace, toneMapping: c.toneMapping },
        session: engine.current?.plan.session ?? undefined,
        forceStream: force
      })
      const f = s.resumeFraction
      const start = at ?? (resume && f > 0.01 && f < 0.95 ? f * plan.duration : 0)
      engine.current = { plan, target, offset: plan.mode === 'native' ? 0 : start, forced: force }
      setStreaming(plan.mode !== 'native')
      setFailed(false)
      if (plan.mode === 'native') {
        resumeAt.current = at ?? null
        setUrl(plan.url)
      } else await streamFrom(start)
      if (plan.mode === 'transcode') flash(plan.encoder?.startsWith('libx') ? 'Converting for playback' : 'Converting for playback · graphics card')
    } catch {
      setFailed(true)
    }
  }
  const resumeAt = useRef<number | null>(null)

  // The engine's stream stops with the player.
  useEffect(
    () => () => {
      const id = engine.current?.plan.session
      if (id) void window.lantern?.closePlayback(id)
    },
    []
  )

  const save = useCallback(() => {
    const v = video.current
    // Loose files and streams have no library entry to remember progress on.
    if (!v || !src?.itemId || !length()) return
    lastSaved.current = Date.now()
    api.saveProgress(src.itemId, src.episodeId, position(), length())
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ---------- Transport ----------
  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    if (v.paused) v.play().catch(() => undefined)
    else v.pause()
    poke()
  }, [poke])

  const seekTo = useCallback(
    (t: number) => {
      const v = video.current
      if (!v || !length()) return
      const to = Math.max(0, Math.min(length() - 0.25, t))
      if (isStream()) {
        // The stream restarts at the new spot; holding an arrow key moves the time first and restarts once.
        engine.current!.offset = to
        setTime(to)
        window.clearTimeout(seekTimer.current)
        seekTimer.current = window.setTimeout(() => void streamFrom(to), 180)
      } else {
        v.currentTime = to
        setTime(v.currentTime)
      }
      poke()
    },
    [poke]
  )

  const flash = (text: string): void => {
    setHud(text)
    window.clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHud(null), 1100)
  }

  // ---------- Subtitles ----------
  // The film's own tracks, plus matching files beside it; then the default the viewer asked for in Settings.
  useEffect(() => {
    if (!src) return
    let alive = true
    const own = src.file?.subtitles ?? []
    const target = targetOf(src)
    const extra = target && cfg.autoLoadSubs && window.lantern?.listSubtitleFiles ? window.lantern.listSubtitleFiles(target).catch(() => []) : Promise.resolve([])
    void extra.then((files) => {
      if (!alive) return
      const all = [...own, ...files]
      setTracks(all)
      const usable = all.filter((t) => !t.picture)
      const pref = cfg.subtitleLanguage
      const spoken = src.file?.audio[audio]?.language
      const pick =
        pref === 'off'
          ? undefined
          : pref === 'forced'
            ? usable.find((t) => t.forced && (sameLanguage(t.language, spoken) || t.language === 'und'))
            : (usable.find((t) => sameLanguage(t.language, pref) && !t.forced) ?? usable.find((t) => sameLanguage(t.language, pref)))
      setSubtitle(pick ? pick.index : null)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // Read the chosen track's lines (the film's own tracks take a moment: the file is read once, then kept).
  useEffect(() => {
    setCues(null)
    const track = tracks.find((t) => t.index === subtitle)
    const target = src && targetOf(src)
    if (!track || !target || !window.lantern?.loadSubtitles) return
    let alive = true
    const slow = window.setTimeout(() => alive && flash('Loading subtitles…'), 400)
    window.lantern
      .loadSubtitles(target, { index: track.index, codec: track.codec }, cfg.subtitleEncoding)
      .then((c) => {
        if (!alive) return
        if (c && c.length) setCues(c)
        else flash("These subtitles couldn't be read")
      })
      .catch(() => alive && flash("These subtitles couldn't be read"))
      .finally(() => window.clearTimeout(slow))
    return () => {
      alive = false
      window.clearTimeout(slow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitle, tracks, cfg.subtitleEncoding])

  // Lines change more often than the progress bar updates; follow the picture ten times a second.
  useEffect(() => {
    if (!cues) return
    const id = window.setInterval(() => setSubClock(position()), 100)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues])

  const chooseSubtitle = (t: SubtitleTrack | null): boolean => {
    if (t?.picture) {
      flash('Picture subtitles (Blu-ray and DVD) can’t be shown yet')
      return false
    }
    setSubtitle(t ? t.index : null)
    return true
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

  const exiting = useRef(false)
  const exit = (): void => {
    save()
    if (fullscreen) toggleFullscreen()
    if (!cinema) return back()
    // Cinema Mode never cuts: the picture and sound fade out together, then the lobby comes back.
    if (exiting.current) return
    exiting.current = true
    const v = video.current
    const from = v?.volume ?? 1
    gsap.to(root.current, {
      opacity: 0,
      duration: d(1.1),
      ease: 'power1.inOut',
      onUpdate() {
        if (v) v.volume = from * (1 - this.progress())
      },
      onComplete: back
    })
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
    seekTo(position() + direction * step)
    flash(`${direction > 0 ? '+' : '-'}${step}`)
  }
  const snapshot = async (): Promise<void> => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const format = cfg.snapshotFormat
    const name = `${src?.title ?? 'Snapshot'} ${timecode(position()).replace(/:/g, '.')}`
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png'
    // Full-resolution frame with the picture adjustments baked in, when the pixels are readable.
    let blob: Blob | null = null
    try {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')!
      ctx.filter = videoStyle(cfg).filter ?? 'none'
      ctx.drawImage(v, 0, 0)
      blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, 0.92))
    } catch {
      blob = null // cross-origin stream: the canvas is tainted
    }
    try {
      if (window.lantern) {
        let saved: string
        if (blob) saved = await window.lantern.snapshot({ bytes: new Uint8Array(await blob.arrayBuffer()) }, format, name)
        else {
          // Capture the window instead, with the controls hidden for the shot.
          const el = chrome.current
          if (el) gsap.set(el, { autoAlpha: 0, overwrite: true })
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          saved = await window.lantern.snapshot({ rect: pictureRect(v) }, format, name)
          if (el) gsap.set(el, { autoAlpha: 1 })
        }
        flash(`Snapshot saved · ${saved.split(/[\\/]/).pop()}`)
      } else if (blob) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${name}.${format}`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        flash('Snapshot saved')
      } else flash('Snapshots of streams need the desktop app')
    } catch {
      flash("Couldn't save the snapshot")
    }
  }

  const togglePip = (): void => {
    const v = video.current
    if (!v) return
    if (document.pictureInPictureElement) document.exitPictureInPicture()
    else v.requestPictureInPicture?.().catch(() => undefined)
  }
  /** The current frame as PNG, or null when the stream's pixels can't be read. */
  const frameBlob = async (): Promise<Blob | null> => {
    const v = video.current
    if (!v?.videoWidth) return null
    try {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')!
      ctx.filter = videoStyle(cfg).filter ?? 'none'
      ctx.drawImage(v, 0, 0)
      return await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
    } catch {
      return null
    }
  }
  const shareText = (): string => `${src?.title ?? 'Magic Lanterns'}${src?.subtitle ? ` (${src.subtitle})` : ''} · ${timecode(time)}`

  const cycleFit = (): void => {
    const next = FIT_ORDER[(FIT_ORDER.indexOf(cfg.videoFit) + 1) % FIT_ORDER.length]
    updateSettings({ videoFit: next, aspect: 'auto' })
    flash(FIT_LABEL[next])
  }
  const cycleAspect = (): void => {
    const next = ASPECT_ORDER[(ASPECT_ORDER.indexOf(cfg.aspect) + 1) % ASPECT_ORDER.length]
    updateSettings({ aspect: next })
    flash(next === 'auto' ? 'Aspect · Original' : `Aspect · ${next}`)
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
      seekTo(0)
      v.play().catch(() => undefined)
    }
    if (cfg.repeat === 'one') return again()
    if (src?.next && (cfg.autoplayNext || cfg.repeat === 'all')) return playNext()
    if (cfg.repeat === 'all') return again()
    exit()
  }

  const cycleSubs = (): void => {
    const list = tracks.filter((t) => !t.picture)
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
      if (menu || sound) return // the open popover or Sound Stage handles keys
      const v = video.current
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
        case 'z':
        case 'Z':
          cycleFit()
          break
        case 'a':
        case 'A':
          cycleAspect()
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
          cycleSubs()
          break
        case 'S':
          if (e.shiftKey) snapshot()
          else cycleSubs() // caps lock
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
    setDuration(isStream() ? engine.current!.plan.duration : Number.isFinite(v.duration) ? v.duration : Infinity)
    setReady(true)
    // A stream that began on an earlier keyframe races, unseen and silent, to the moment that was asked for.
    const racing = pendingSkip.current != null
    setCatchingUp(racing)
    v.muted = racing || muted
    v.playbackRate = racing ? 16 : speed
    // Always pick up where you left off; scrub back to the start if you want it. Fresh plays (next episode) start at 0.
    // Streams already start at the right spot.
    const f = src.resumeFraction
    if (!isStream()) {
      if (resumeAt.current != null) v.currentTime = resumeAt.current
      else if (!fresh && f > 0.01 && f < 0.95 && Number.isFinite(v.duration)) v.currentTime = f * v.duration
      resumeAt.current = null
    }
    v.play().catch(() => undefined)
    poke()
  }

  const onError = (): void => {
    // Played directly but refused after all (an odd codec inside an MP4): let the engine repackage it.
    const e = engine.current
    if (e && src && e.plan.mode === 'native' && !e.forced) {
      void openEngine(src, e.target, audio, { at: video.current?.currentTime || undefined, force: true })
      return
    }
    if (e) {
      setFailed(true)
      return
    }
    const next = candidates.current.shift()
    if (next) setUrl(next)
    else setFailed(true)
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

  // While streaming there's no second copy of the film to seek, so the engine sends small stills instead.
  const thumbAsk = useRef(0)
  useEffect(() => {
    if (!scrub || !streaming || !src || !window.lantern?.scrubFrame) return
    const target = targetOf(src)
    if (!target) return
    const ask = ++thumbAsk.current
    const id = window.setTimeout(() => {
      window.lantern!.scrubFrame(target, scrub.t)
        .then((s) => ask === thumbAsk.current && s && setThumb({ t: scrub.t, src: s }))
        .catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub?.t, streaming])

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

  /** Another sound track: the engine restarts the film at the same moment with that track. */
  const chooseAudio = (i: number): void => {
    setAudio(i)
    const e = engine.current
    if (e && src && i !== audio) void openEngine(src, e.target, i, { at: position() })
  }

  // ---------- Menus ----------
  const subSize = settings?.subtitleSize ?? 'medium'
  const subStyle = settings?.subtitleStyle ?? 'shadow'
  const cycle = <T extends string>(list: T[], v: T): T => list[(list.indexOf(v) + 1) % list.length]
  const menuOptions = (): PopoverOption[] => {
    if (!src) return []
    if (menu === 'share') {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
      return [
        {
          label: 'Copy Frame',
          hint: 'Image',
          onSelect: async () => {
            const blob = await frameBlob()
            if (!blob) return flash("This stream's frames can't be copied")
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => undefined)
            flash('Frame copied')
          }
        },
        {
          label: 'Copy Title and Time',
          onSelect: async () => {
            await navigator.clipboard.writeText(shareText()).catch(() => undefined)
            flash('Copied')
          }
        },
        ...(nav.share ? [{ label: 'Share…', divider: true, onSelect: () => nav.share!({ title: src.title, text: shareText() }).catch(() => undefined) }] : [])
      ]
    }
    const sounds = src.file?.audio ?? []
    if (menu === 'audio') {
      const effects = local ? undefined : 'Local files'
      const preset = cfg.eqEnabled ? cfg.eqPreset : 'Off'
      return [
        ...(sounds.length
          ? sounds.map((a, i) => ({ label: a.title, checked: i === audio, onSelect: () => chooseAudio(i) }))
          : [{ label: 'Default Track', checked: true, onSelect: () => undefined }]),
        {
          label: 'Equalizer',
          hint: effects ?? preset,
          divider: true,
          keepOpen: true,
          onSelect: () => {
            // Off → each preset in turn → Off
            const i = cfg.eqEnabled ? EQ_NAMES.indexOf(cfg.eqPreset) + 1 : 0
            if (i >= EQ_NAMES.length) updateSettings({ eqEnabled: false })
            else updateSettings({ eqEnabled: true, eqPreset: EQ_NAMES[i], eqBands: [...EQ_PRESETS[EQ_NAMES[i]]] })
          }
        },
        {
          label: 'Volume Boost',
          hint: effects ?? `${cfg.volumeBoost}%`,
          keepOpen: true,
          onSelect: () => updateSettings({ volumeBoost: BOOSTS[(BOOSTS.indexOf(cfg.volumeBoost) + 1) % BOOSTS.length] })
        },
        { label: 'Normalize Volume', hint: effects, checked: cfg.normalize, keepOpen: true, onSelect: () => updateSettings({ normalize: !cfg.normalize }) },
        { label: 'Stereo Downmix', hint: effects, checked: cfg.downmix, keepOpen: true, onSelect: () => updateSettings({ downmix: !cfg.downmix }) }
      ]
    }
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
      ...tracks.map((s) => ({
        label: s.title,
        hint: s.picture ? 'Picture' : undefined,
        checked: subtitle === s.index,
        onSelect: () => {
          if (chooseSubtitle(s) && !window.lantern?.loadSubtitles) preview()
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
  const subTrack = tracks.find((s) => s.index === subtitle)
  // Positive delay shows lines later; the setting is in milliseconds.
  const showing = cues ? cuesAt(cues, subClock - cfg.subtitleDelay / 1000) : []
  const live = !Number.isFinite(duration) // live HLS streams report an infinite duration

  return (
    <ScreenActive.Provider value={true}>
      <FocusContext.Provider value={focusKey}>
        <div
          ref={root}
          className={`player ${playing ? 'is-playing' : 'is-paused'} ${cinema ? 'is-cinema' : ''}`}
          data-audio={processed ? 'processed' : 'direct'}
          onPointerMove={(e) => {
            // Browsers fire synthetic moves when the chrome fades under a resting cursor; only real travel wakes it.
            const last = lastPointer.current
            if (Math.abs(e.screenX - last.x) + Math.abs(e.screenY - last.y) > 2) poke()
            lastPointer.current = { x: e.screenX, y: e.screenY }
          }}
          onClick={(e) => e.target === e.currentTarget && toggle()}
          onDoubleClick={(e) => cfg.doubleClickFullscreen && e.target === e.currentTarget && toggleFullscreen()}
          onWheel={(e) => {
            if (menu || cfg.wheelAction === 'off') return
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
              <BlurImage path={src?.backdrop ?? null} size={backdropSize()} tiny="w300" color={src?.color ?? '#1c1c20'} />
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

          {cinema && <AmbientLight video={video} on={cfg.ambientLight} onShape={setShape} />}
          {url && (
            <video
              ref={video}
              className="pl-video"
              style={{ ...videoStyle(cfg), ...(cinema ? cinemaFrame(cfg, shape) : null), opacity: catchingUp ? 0 : undefined }}
              crossOrigin={/^ml-file:|^http:\/\/127\.0\.0\.1:/.test(url) ? 'anonymous' : undefined}
              src={url}
              preload="auto"
              onLoadedMetadata={onLoaded}
              onError={onError}
              onPlay={() => {
                setPlaying(true)
                chain.current?.resume()
              }}
              onPause={() => {
                setPlaying(false)
                save()
                setVisible(true)
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget
                const skip = pendingSkip.current
                // Live streams can't be seeked, so the gap is played through (fast and hidden) rather than jumped.
                if (skip != null && v.currentTime >= skip - 0.05) {
                  pendingSkip.current = null
                  v.playbackRate = speed
                  v.muted = muted
                  setCatchingUp(false)
                }
                setTime(position())
                if (v.buffered.length) setBuffered((isStream() ? engine.current!.offset : 0) + v.buffered.end(v.buffered.length - 1))
                if (Date.now() - lastSaved.current > 5000) save()
              }}
              onVolumeChange={(e) => {
                setVolume(e.currentTarget.volume)
                if (pendingSkip.current == null) setMuted(e.currentTarget.muted) // silenced while catching up isn't the viewer's mute
              }}
              onEnded={onFinished}
              onClick={toggle}
              onDoubleClick={() => cfg.doubleClickFullscreen && toggleFullscreen()}
            />
          )}

          <div className="pl-dim" style={{ opacity: ready && !playing ? 1 : 0 }} />

          {/* Subtitles: the chosen track's lines, drawn in the viewer's style. The demo shows a sample line instead. */}
          {(showing.length > 0 || (subTrack && cuePreview && !cues)) && (
            <div
              className={`pl-cue size-${subSize} style-${subStyle} color-${cfg.subtitleColor}`}
              style={{ bottom: (visible ? 190 : 72) + (cfg.subtitlePosition === 'raised' ? 70 : 0) }}
            >
              {showing.length > 0 ? (
                showing.map((c, i) => <CueText key={`${c.start}-${i}`} text={c.text} />)
              ) : (
                <span>{subTrack!.title} subtitles will look like this.</span>
              )}
            </div>
          )}

          {cinema && ready && (
            <CinemaBar ambient={cfg.ambientLight} onAmbient={() => void updateSettings({ ambientLight: !cfg.ambientLight })} onSound={() => setSound(true)} />
          )}
          {sound && <SoundStage track={src?.file?.audio[audio]} levels={levels} outputs={chain.current?.outputs} onClose={() => setSound(false)} />}

          <div ref={chrome} className="pl-chrome">
            <div className="pl-top">
              <div className="pl-top-left">
                <button className="pl-close glass" onClick={exit} aria-label="Close">
                  <X size={22} strokeWidth={1.8} />
                </button>
                <div className="pl-tools glass">
                  <button className="pl-btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit Full Screen' : 'Full Screen'}>
                    {fullscreen ? <Minimize size={21} strokeWidth={1.7} /> : <Maximize size={21} strokeWidth={1.7} />}
                  </button>
                  <button className="pl-btn" onClick={togglePip} aria-label="Picture in Picture">
                    <PipIcon size={21} strokeWidth={1.7} />
                  </button>
                  <div className="popover-anchor">
                    <button className={`pl-btn ${menu === 'share' ? 'is-active' : ''}`} onClick={() => setMenu(menu === 'share' ? null : 'share')} aria-label="Share">
                      <Share size={20} strokeWidth={1.7} />
                    </button>
                    {menu === 'share' && <Popover title="Share" align="left" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                </div>
              </div>
              <div className="pl-volume glass" onClick={(e) => e.stopPropagation()}>
                <input
                  className="pl-vol-range no-press"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  aria-label="Volume"
                  value={muted ? 0 : volume}
                  style={{ '--v': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
                  onChange={(e) => {
                    const v = video.current
                    if (!v) return
                    v.volume = Number(e.target.value)
                    v.muted = false
                  }}
                />
                <button
                  className="pl-vol-btn"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  onClick={() => {
                    if (video.current) video.current.muted = !video.current.muted
                  }}
                >
                  <VolumeIcon size={21} strokeWidth={1.7} />
                </button>
              </div>
            </div>

            <div className="pl-center" style={{ display: ready ? undefined : 'none' }} onClick={(e) => e.stopPropagation()}>
              <CircleButton icon={RotateCcw} label={`Back ${step} seconds`} onPress={() => skip(-1)} />
              <CircleButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onPress={toggle} big />
              <CircleButton icon={RotateCw} label={`Forward ${step} seconds`} onPress={() => skip(1)} />
            </div>

            <div className="pl-bottom" onClick={(e) => e.stopPropagation()}>
              <div className="pl-meta">
                {src && (
                  <div className="pl-title">
                    <div className="pl-title-text">{src.title}</div>
                    <div className="pl-title-sub">{src.subtitle}</div>
                  </div>
                )}
                <div className="pl-tools glass">
                  <div className="popover-anchor">
                    <BarButton icon={Captions} label="Subtitles" active={menu === 'subs' || subtitle !== null} onPress={() => setMenu(menu === 'subs' ? null : 'subs')} />
                    {menu === 'subs' && <Popover title="Subtitles" placement="above" align="right" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                  <div className="popover-anchor">
                    <BarButton icon={AudioLines} label="Audio" active={menu === 'audio'} onPress={() => setMenu(menu === 'audio' ? null : 'audio')} />
                    {menu === 'audio' && <Popover title="Audio" placement="above" align="right" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                  <div className="popover-anchor">
                    <BarButton
                      icon={Gauge}
                      label={speed === 1 ? 'Speed' : `Speed · ${speedLabel(speed)}`}
                      active={menu === 'speed' || speed !== 1 || cfg.repeat !== 'off'}
                      onPress={() => setMenu(menu === 'speed' ? null : 'speed')}
                    />
                    {menu === 'speed' && <Popover title="Playback Speed" placement="above" align="right" options={menuOptions()} onClose={() => setMenu(null)} />}
                  </div>
                  <BarButton icon={Camera} label="Snapshot (Shift+S)" onPress={snapshot} />
                </div>
              </div>
              <div className="pl-scrub glass">
                <span className="pl-time">{timecode(time)}</span>
                <div
                  ref={bar}
                  className={`pl-bar no-press ${scrub ? 'is-active' : ''}`}
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
                    <div className="pl-thumb-frame">
                      {url && !streaming && <video ref={preview} src={url} muted preload="metadata" />}
                      {streaming && thumb && <img src={thumb.src} alt="" />}
                    </div>
                    <div className="pl-thumb-time">{timecode(scrub?.t ?? 0)}</div>
                  </div>
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

          {inIntro && intro && !showNext && (
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

        </div>
      </FocusContext.Provider>
    </ScreenActive.Provider>
  )
}

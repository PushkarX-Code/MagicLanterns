import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AudioLines, Captions, Clapperboard, FolderOpen, Info, Keyboard, Play, Sparkles, type LucideIcon } from 'lucide-react'
import type { LibraryFolder } from '@shared/types'
import { EQ_BANDS, EQ_PRESETS, type Settings } from '@shared/settings'
import { Screen } from '../components/Screen'
import { Lantern, Wordmark } from '../components/Lantern'
import { Action, Choice, KeyField, Panel, Picker, Section, Slider, Toggle, settingsPage } from '../components/SettingControls'
import { FocusContext, setFocus, useFocus } from '../focus/focus'
import { useSettings } from '../state/settings'
import { api } from '../lib/api'
import { bytes, timeAgo } from '../lib/format'
import { SLOW_KEY } from '../mock/api'
import { gsap, d, EASE } from '../design/motion'

type Tab = 'playback' | 'video' | 'audio' | 'subtitles' | 'controls' | 'interface' | 'library' | 'about'
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'video', label: 'Video', icon: Clapperboard },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'subtitles', label: 'Subtitles', icon: Captions },
  { id: 'controls', label: 'Controls', icon: Keyboard },
  { id: 'interface', label: 'Interface', icon: Sparkles },
  { id: 'library', label: 'Library', icon: FolderOpen },
  { id: 'about', label: 'About', icon: Info }
]

const SOON = 'Coming soon'
const LANGUAGES = [
  { id: 'eng', label: 'English' },
  { id: 'spa', label: 'Español' },
  { id: 'fra', label: 'Français' },
  { id: 'deu', label: 'Deutsch' },
  { id: 'ita', label: 'Italiano' },
  { id: 'por', label: 'Português' },
  { id: 'hin', label: 'हिन्दी' },
  { id: 'jpn', label: '日本語' },
  { id: 'kor', label: '한국어' },
  { id: 'zho', label: '中文' }
]
const ENCODINGS = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'utf-8', label: 'Unicode (UTF-8)' },
  { id: 'windows-1252', label: 'Western (Windows-1252)' },
  { id: 'windows-1250', label: 'Central European (Windows-1250)' },
  { id: 'windows-1251', label: 'Cyrillic (Windows-1251)' },
  { id: 'windows-1256', label: 'Arabic (Windows-1256)' },
  { id: 'shift_jis', label: 'Japanese (Shift-JIS)' },
  { id: 'gb18030', label: 'Chinese Simplified (GB18030)' },
  { id: 'big5', label: 'Chinese Traditional (Big5)' },
  { id: 'euc-kr', label: 'Korean (EUC-KR)' }
]
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => ({ id: s, label: s === 1 ? 'Normal' : `${s}×` }))
const pct = (v: number): string => `${v}%`
const ms = (v: number): string => (v === 0 ? 'Off' : `${v > 0 ? '+' : ''}${v} ms`)

type Set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => void
interface PaneProps {
  s: Settings
  set: Set
  update: (patch: Partial<Settings>) => void
}

// ---------- Playback ----------
function PlaybackPane({ s, set }: PaneProps) {
  return (
    <>
      <Section title="Starting a Film">
        <Choice
          label="Resume Playback"
          hint="What happens when you open something you've started."
          value={s.resumeMode}
          onChange={set('resumeMode')}
          options={[
            { id: 'ask', label: 'Ask' },
            { id: 'always', label: 'Always' },
            { id: 'never', label: 'Never' }
          ]}
        />
        <Picker label="Default Speed" value={s.defaultSpeed} options={SPEEDS} onChange={set('defaultSpeed')} />
        <Toggle label="Start in Full Screen" value={s.startFullscreen} onChange={set('startFullscreen')} />
      </Section>
      <Section title="When It Ends">
        <Toggle label="Autoplay Next Episode" hint="Starts the next episode when the countdown runs out." value={s.autoplayNext} onChange={set('autoplayNext')} />
        <Choice
          label="Repeat"
          hint="Press L in the player to switch."
          value={s.repeat}
          onChange={set('repeat')}
          options={[
            { id: 'off', label: 'Off' },
            { id: 'one', label: 'One' },
            { id: 'all', label: 'All' }
          ]}
        />
      </Section>
      <Section title="Window">
        <Choice
          label="Keep on Top"
          hint="Float the player above other windows."
          value={s.keepOnTop}
          onChange={set('keepOnTop')}
          options={[
            { id: 'never', label: 'Never' },
            { id: 'playing', label: 'While Playing' },
            { id: 'always', label: 'Always' }
          ]}
        />
        <Toggle label="Pause When Minimized" value={s.pauseOnMinimize} onChange={set('pauseOnMinimize')} />
        <Toggle label="Show Time Remaining" hint="Otherwise the total length. Click the time in the player to switch." value={s.showRemaining} onChange={set('showRemaining')} />
      </Section>
    </>
  )
}

// ---------- Video ----------
function VideoPane({ s, set, update }: PaneProps) {
  const neutral = s.brightness === 100 && s.contrast === 100 && s.saturation === 100 && s.hue === 0
  return (
    <>
      <Section title="Picture">
        <Choice
          label="Fit"
          hint="Press Z in the player to switch."
          value={s.videoFit}
          onChange={set('videoFit')}
          options={[
            { id: 'fit', label: 'Fit' },
            { id: 'fill', label: 'Fill' },
            { id: 'stretch', label: 'Stretch' }
          ]}
        />
        <Picker
          label="Aspect Ratio"
          hint="Force a shape for files that report the wrong one. A cycles in the player."
          value={s.aspect}
          onChange={set('aspect')}
          options={[
            { id: 'auto', label: 'Original' },
            { id: '16:9', label: '16:9', hint: 'Widescreen' },
            { id: '4:3', label: '4:3', hint: 'Classic TV' },
            { id: '21:9', label: '21:9', hint: 'Ultrawide' },
            { id: '2.39:1', label: '2.39:1', hint: 'Scope' },
            { id: '1:1', label: '1:1', hint: 'Square' }
          ]}
        />
      </Section>
      <Section
        title="Adjustments"
        footer={
          !neutral && (
            <button className="set-reset" onClick={() => update({ brightness: 100, contrast: 100, saturation: 100, hue: 0 })}>
              Reset adjustments
            </button>
          )
        }
      >
        <Slider label="Brightness" value={s.brightness} min={50} max={150} step={5} neutral={100} format={pct} onChange={set('brightness')} />
        <Slider label="Contrast" value={s.contrast} min={50} max={150} step={5} neutral={100} format={pct} onChange={set('contrast')} />
        <Slider label="Saturation" value={s.saturation} min={0} max={200} step={5} neutral={100} format={pct} onChange={set('saturation')} />
        <Slider label="Hue" value={s.hue} min={-180} max={180} step={5} neutral={0} format={(v) => `${v}°`} onChange={set('hue')} />
      </Section>
      <Section title="Decoding">
        <Choice
          label="Hardware Decoding"
          hint="Uses your graphics card for smooth 4K and HDR. Turn off if you see glitches."
          note="Next launch"
          value={s.hwDecode}
          onChange={(v) => {
            set('hwDecode')(v)
            window.lantern?.setLaunchPrefs({ hwDecode: v })
          }}
          options={[
            { id: 'auto', label: 'Automatic' },
            { id: 'off', label: 'Off' }
          ]}
        />
        <Choice
          label="Deinterlace"
          hint="Removes combing from TV recordings and DVDs."
          note={SOON}
          value={s.deinterlace}
          onChange={set('deinterlace')}
          options={[
            { id: 'off', label: 'Off' },
            { id: 'auto', label: 'Auto' },
            { id: 'on', label: 'On' }
          ]}
        />
        <Choice
          label="HDR Tone Mapping"
          hint="Brings HDR films down to your screen's range on non-HDR displays."
          note={SOON}
          value={s.toneMapping}
          onChange={set('toneMapping')}
          options={[
            { id: 'auto', label: 'Auto' },
            { id: 'off', label: 'Off' }
          ]}
        />
      </Section>
      <Section title="Snapshots">
        <Choice
          label="Snapshot Format"
          hint="Shift+S or the camera button. Saved to Pictures › Magic Lanterns."
          value={s.snapshotFormat}
          onChange={set('snapshotFormat')}
          options={[
            { id: 'png', label: 'PNG' },
            { id: 'jpg', label: 'JPG' }
          ]}
        />
      </Section>
    </>
  )
}

// ---------- Audio ----------
function useOutputs(): { id: string; label: string }[] {
  const [list, setList] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) =>
        setList(
          all
            .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
            .map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` }))
        )
      )
      .catch(() => undefined)
  }, [])
  return list
}

function Band({ hz, value, onChange }: { hz: number; value: number; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const clamp = (v: number): number => Math.max(-20, Math.min(20, Math.round(v * 2) / 2))
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    onArrowPress: (dir) => {
      if (dir === 'up' || dir === 'down') {
        onChange(clamp(value + (dir === 'up' ? 1 : -1)))
        return false
      }
      return true
    },
    onEnterPress: () => onChange(0)
  })
  const fromPointer = (y: number): void => {
    const r = track.current!.getBoundingClientRect()
    onChange(clamp(20 - ((y - r.top) / r.height) * 40))
  }
  const at = ((20 - value) / 40) * 100
  return (
    <div ref={ref} className={`eq-band ${focused ? 'is-focused' : ''}`} {...pointer}>
      <span className="eq-db">{value > 0 ? `+${value}` : value}</span>
      <div
        ref={track}
        className="eq-track no-press"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          dragging.current = true
          fromPointer(e.clientY)
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onDoubleClick={() => onChange(0)}
      >
        <div className="eq-rail" />
        <div className="eq-fill" style={{ top: `${Math.min(50, at)}%`, height: `${Math.abs(at - 50)}%` }} />
        <div className="eq-knob" style={{ top: `${at}%` }} />
      </div>
      <span className="eq-hz">{hz >= 1000 ? `${hz / 1000}k` : hz}</span>
    </div>
  )
}

function Equalizer({ s, update }: PaneProps) {
  const { ref, focusKey } = useFocus<HTMLDivElement>({ trackChildren: true, saveLastFocusedChild: true })
  const presets = [...Object.keys(EQ_PRESETS), ...(s.eqPreset === 'Custom' ? ['Custom'] : [])].map((p) => ({ id: p, label: p }))
  return (
    <Section title="Equalizer" footer="Up and down move a band, Enter resets it to 0 dB.">
      <Toggle label="Equalizer" hint="Ten bands, shaped like VLC's." note="Local files" value={s.eqEnabled} onChange={(v) => update({ eqEnabled: v })} />
      <Picker
        label="Preset"
        value={s.eqPreset}
        options={presets}
        onChange={(p) => p !== 'Custom' && update({ eqPreset: p, eqBands: [...EQ_PRESETS[p]], eqEnabled: true })}
      />
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className={`eq ${s.eqEnabled ? '' : 'is-off'}`}>
          {EQ_BANDS.map((hz, i) => (
            <Band
              key={hz}
              hz={hz}
              value={s.eqBands[i] ?? 0}
              onChange={(v) => {
                const bands = [...s.eqBands]
                bands[i] = v
                update({ eqBands: bands, eqPreset: 'Custom', eqEnabled: true })
              }}
            />
          ))}
        </div>
      </FocusContext.Provider>
    </Section>
  )
}

function AudioPane(props: PaneProps) {
  const { s, set } = props
  const outputs = useOutputs()
  return (
    <>
      <Section title="Output">
        <Picker label="Output Device" value={s.audioDevice} options={[{ id: 'default', label: 'System Default' }, ...outputs]} onChange={set('audioDevice')} />
        <Picker
          label="Preferred Language"
          hint="Picked first when a film has several audio tracks."
          value={s.audioLanguage}
          options={[{ id: 'orig', label: 'Original Language' }, ...LANGUAGES]}
          onChange={set('audioLanguage')}
        />
        <Toggle label="Stereo Downmix" hint="Folds 5.1 and 7.1 into two channels for headphones." note="Local files" value={s.downmix} onChange={set('downmix')} />
        <Toggle
          label="Passthrough"
          hint="Send Dolby and DTS untouched to your receiver."
          note={SOON}
          value={s.passthrough}
          onChange={set('passthrough')}
        />
      </Section>
      <Section title="Loudness" footer="Effects marked Local files apply to films on your drives. Streams play untouched.">
        <Slider label="Volume Boost" hint="Lets the volume go past 100%." note="Local files" value={s.volumeBoost} min={100} max={200} step={5} neutral={100} format={pct} onChange={set('volumeBoost')} />
        <Toggle label="Normalize Volume" hint="Evens out quiet dialogue and loud action." note="Local files" value={s.normalize} onChange={set('normalize')} />
        <Slider
          label="Audio Delay"
          hint="Delays the sound if it runs ahead of the picture."
          note="Local files"
          value={s.audioDelay}
          min={0}
          max={2000}
          step={25}
          neutral={0}
          format={ms}
          onChange={set('audioDelay')}
        />
      </Section>
      <Equalizer {...props} />
    </>
  )
}

// ---------- Subtitles ----------
function SubtitlesPane({ s, set }: PaneProps) {
  return (
    <>
      <Section title="Tracks">
        <Picker
          label="Default Subtitles"
          value={s.subtitleLanguage}
          options={[{ id: 'off', label: 'Off' }, { id: 'forced', label: 'Forced Only', hint: 'Signs and foreign dialogue' }, ...LANGUAGES]}
          onChange={set('subtitleLanguage')}
        />
        <Toggle label="Load Matching Subtitle Files" hint="Picks up .srt and .ass files next to the film." note={SOON} value={s.autoLoadSubs} onChange={set('autoLoadSubs')} />
        <Picker label="Text Encoding" hint="For older subtitle files that show garbled letters." note={SOON} value={s.subtitleEncoding} options={ENCODINGS} onChange={set('subtitleEncoding')} />
        <Slider
          label="Subtitle Delay"
          hint="Shift subtitles earlier or later."
          note={SOON}
          value={s.subtitleDelay}
          min={-5000}
          max={5000}
          step={100}
          neutral={0}
          format={ms}
          onChange={set('subtitleDelay')}
        />
      </Section>
      <Section title="Appearance">
        <Choice
          label="Size"
          value={s.subtitleSize}
          onChange={set('subtitleSize')}
          options={[
            { id: 'small', label: 'Small' },
            { id: 'medium', label: 'Medium' },
            { id: 'large', label: 'Large' }
          ]}
        />
        <Choice
          label="Style"
          value={s.subtitleStyle}
          onChange={set('subtitleStyle')}
          options={[
            { id: 'shadow', label: 'Shadow' },
            { id: 'glass', label: 'Glass' },
            { id: 'outline', label: 'Outline' }
          ]}
        />
        <Choice
          label="Color"
          value={s.subtitleColor}
          onChange={set('subtitleColor')}
          options={[
            { id: 'white', label: 'White' },
            { id: 'yellow', label: 'Yellow' },
            { id: 'cyan', label: 'Cyan' }
          ]}
        />
        <Choice
          label="Position"
          hint="Raised keeps them clear of letterbox bars and on-screen text."
          value={s.subtitlePosition}
          onChange={set('subtitlePosition')}
          options={[
            { id: 'bottom', label: 'Bottom' },
            { id: 'raised', label: 'Raised' }
          ]}
        />
        <div className={`sub-preview size-${s.subtitleSize} style-${s.subtitleStyle} color-${s.subtitleColor} pos-${s.subtitlePosition}`}>
          <span>The light spilled out across the dark.</span>
        </div>
      </Section>
    </>
  )
}

// ---------- Controls ----------
// '|' reads as "or" between keys.
const KEYS: [string[], string][] = [
  [['Space', '|', 'K'], 'Play or pause'],
  [['←', '→'], 'Skip back / forward by the seek step'],
  [['↑', '↓'], 'Volume'],
  [['M'], 'Mute'],
  [['F'], 'Full screen'],
  [['[', ']', '='], 'Slower, faster, normal speed'],
  [['S'], 'Next subtitle track'],
  [['Shift+S'], 'Snapshot'],
  [['Z'], 'Fit, fill, stretch'],
  [['A'], 'Aspect ratio'],
  [['L'], 'Repeat off, one, all'],
  [['N'], 'Next episode'],
  [['/', '|', 'Ctrl+F'], 'Search (outside the player)'],
  [['Esc'], 'Back']
]

function ControlsPane({ s, set }: PaneProps) {
  return (
    <>
      <Section title="Mouse and Steps">
        <Choice
          label="Mouse Wheel"
          value={s.wheelAction}
          onChange={set('wheelAction')}
          options={[
            { id: 'volume', label: 'Volume' },
            { id: 'seek', label: 'Seek' },
            { id: 'off', label: 'Nothing' }
          ]}
        />
        <Toggle label="Double-Click for Full Screen" value={s.doubleClickFullscreen} onChange={set('doubleClickFullscreen')} />
        <Slider label="Seek Step" hint="How far the arrow keys and skip buttons jump." value={s.seekStep} min={5} max={60} step={5} format={(v) => `${v} sec`} onChange={set('seekStep')} />
        <Slider label="Volume Step" value={s.volumeStep} min={1} max={20} step={1} format={pct} onChange={set('volumeStep')} />
      </Section>
      <Section title="Keyboard Shortcuts">
        <Panel className="keys">
          {KEYS.map(([k, what]) => (
            <div key={what} className="key-row">
              <span className="key-caps">{k.map((c, i) => (c === '|' ? <i key={i}>or</i> : <kbd key={i}>{c}</kbd>))}</span>
              <span>{what}</span>
            </div>
          ))}
        </Panel>
      </Section>
    </>
  )
}

// ---------- Interface ----------
function InterfacePane({ s, set }: PaneProps) {
  const [slow, setSlow] = useState(() => localStorage.getItem(SLOW_KEY) === '1')
  return (
    <>
      <Section title="Look and Feel">
        <Toggle label="Hero Previews" hint="Let the Home carousel play a muted clip after a few idle seconds." value={s.heroPreviews} onChange={set('heroPreviews')} />
        <Toggle label="Show Clock" hint="In the sidebar." value={s.showClock} onChange={set('showClock')} />
        <Toggle label="Reduce Motion" hint="Swaps lifts, springs and zooms for gentle fades. Follows your system setting too." value={s.reduceMotion} onChange={set('reduceMotion')} />
      </Section>
      <Section title="Developer">
        <Toggle
          label="Simulate Slow Network"
          hint="Slows every load so skeletons and blur-up can be judged."
          value={slow}
          onChange={(v) => {
            localStorage.setItem(SLOW_KEY, v ? '1' : '0')
            setSlow(v)
          }}
        />
      </Section>
    </>
  )
}

// ---------- Library ----------
function LibraryPane({ s, set }: PaneProps) {
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null)
  useEffect(() => {
    api.getFolders().then(setFolders)
  }, [])
  const add = async (): Promise<void> => {
    const path = window.lantern ? await window.lantern.pickFolder() : window.prompt('Folder path')
    if (path) setFolders(await api.addFolder(path))
  }
  return (
    <>
      <Section title="Folders" footer="Magic Lanterns watches these folders and adds new films as they arrive.">
        {folders?.map((f) => (
          <Action
            key={f.path}
            label={f.path}
            hint={`${f.items} items · ${bytes(f.size)} · scanned ${timeAgo(f.lastScan)}`}
            value="Remove"
            danger
            onPress={async () => setFolders(await api.removeFolder(f.path))}
          />
        ))}
        <Action label="Add Folder…" hint="Films, shows or a whole drive." onPress={add} />
      </Section>
      <Section title="Metadata">
        <KeyField label="TMDB API Key" hint="Posters, backdrops, title logos, cast and episodes." value={s.tmdbKey} onChange={set('tmdbKey')} link="https://www.themoviedb.org/settings/api" />
        <KeyField label="OMDb API Key" hint="IMDb, Rotten Tomatoes and Metacritic scores." value={s.omdbKey} onChange={set('omdbKey')} link="https://www.omdbapi.com/apikey.aspx" />
        <Picker
          label="Metadata Language"
          value={s.metadataLanguage}
          onChange={set('metadataLanguage')}
          options={[
            { id: 'en-US', label: 'English' },
            { id: 'es-ES', label: 'Español' },
            { id: 'fr-FR', label: 'Français' },
            { id: 'de-DE', label: 'Deutsch' },
            { id: 'it-IT', label: 'Italiano' },
            { id: 'pt-BR', label: 'Português' },
            { id: 'hi-IN', label: 'हिन्दी' },
            { id: 'ja-JP', label: '日本語' },
            { id: 'ko-KR', label: '한국어' }
          ]}
        />
      </Section>
    </>
  )
}

// ---------- About ----------
function AboutPane() {
  const lantern = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const core = lantern.current?.querySelectorAll('.lm-core, .lm-halo')
    if (core) gsap.fromTo(core, { opacity: 0.5 }, { opacity: 1, duration: d(1.4), ease: 'sine.inOut' })
  }, [])
  return (
    <Section>
      <Panel className="about">
        <div ref={lantern} className="about-mark">
          <Lantern size={132} />
        </div>
        <div className="about-body">
          <Wordmark />
          <div className="about-version">Version 0.1.0 · Electron {window.lantern?.versions.electron ?? 'preview'}</div>
          <p className="about-story">
            The magic lantern was the first projector: a light, a painted glass slide, and a dark room turned into a story. Magic Lanterns does the same
            to a folder of files. Every film in your library becomes a lit glass slide waiting to be projected.
          </p>
          <div className="about-credits">
            Metadata and artwork from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Ratings via OMDb. Playback powered
            by FFmpeg (GPL).
          </div>
          <div className="about-sign">Made by Pushkar</div>
        </div>
      </Panel>
    </Section>
  )
}

// ---------- Screen ----------
function TabButton({ tab, selected, onSelect }: { tab: (typeof TABS)[number]; selected: boolean; onSelect: (t: Tab) => void }) {
  const Icon = tab.icon
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({
    focusKey: `SET-TAB-${tab.id}`,
    onFocus: () => onSelect(tab.id), // tvOS: focusing a tab shows it
    onEnterPress: () => setFocus('SET-PANE')
  })
  return (
    <button ref={ref} className={`set-tab ${selected ? 'is-selected' : ''} ${focused ? 'is-focused' : ''}`} onClick={() => onSelect(tab.id)} {...pointer}>
      <Icon size={21} strokeWidth={selected ? 1.9 : 1.6} />
      <span>{tab.label}</span>
    </button>
  )
}

function Pane({ children, tab }: { children: ReactNode; tab: Tab }) {
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'SET-PANE', trackChildren: true })
  useEffect(() => {
    if (ref.current) gsap.fromTo(ref.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: d(0.5), ease: EASE.settle, overwrite: true })
  }, [tab, ref])
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="set-pane">
        {children}
      </div>
    </FocusContext.Provider>
  )
}

export function SettingsScreen() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [tab, setTab] = useState<Tab>('playback')
  const tabs = useFocus<HTMLDivElement>({ focusKey: 'SET-TABS', trackChildren: true, preferredChildFocusKey: `SET-TAB-${tab}`, saveLastFocusedChild: false })

  const choose = (t: Tab): void => {
    if (t === tab) return
    setTab(t)
    settingsPage.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!settings) return <Screen id="settings" className="page" />
  const set: Set = (k) => (v) => update({ [k]: v } as Partial<Settings>)
  const props: PaneProps = { s: settings, set, update }

  return (
    <Screen id="settings" className="page settings" initialFocus="SET-TAB-playback" ref={(el) => (settingsPage.current = el)}>
      <header className="page-head">
        <h1 className="t-title">Settings</h1>
      </header>
      <div className="set-layout">
        <FocusContext.Provider value={tabs.focusKey}>
          <nav ref={tabs.ref} className="set-tabs">
            {TABS.map((t) => (
              <TabButton key={t.id} tab={t} selected={t.id === tab} onSelect={choose} />
            ))}
          </nav>
        </FocusContext.Provider>
        <Pane tab={tab}>
          {tab === 'playback' && <PlaybackPane {...props} />}
          {tab === 'video' && <VideoPane {...props} />}
          {tab === 'audio' && <AudioPane {...props} />}
          {tab === 'subtitles' && <SubtitlesPane {...props} />}
          {tab === 'controls' && <ControlsPane {...props} />}
          {tab === 'interface' && <InterfacePane {...props} />}
          {tab === 'library' && <LibraryPane {...props} />}
          {tab === 'about' && <AboutPane />}
        </Pane>
      </div>
    </Screen>
  )
}

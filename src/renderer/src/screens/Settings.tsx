import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, ExternalLink, KeyRound } from 'lucide-react'
import type { Settings } from '@shared/types'
import { Screen } from '../components/Screen'
import { Lantern, Wordmark } from '../components/Lantern'
import { FocusContext, useFocus } from '../focus/focus'
import { useSettings } from '../state/settings'
import { useNav } from '../state/nav'
import { api } from '../lib/api'
import { scrollPageTo } from '../components/Row'
import { SLOW_KEY } from '../mock/api'
import { gsap, d } from '../design/motion'

const pageRef: { current: HTMLDivElement | null } = { current: null }

function useRow(onPress?: () => void, onFocus?: () => void) {
  const f = useFocus<HTMLDivElement>({
    onEnterPress: onPress,
    onFocus: () => {
      if (f.ref.current) scrollPageTo(pageRef.current, f.ref.current, 200)
      onFocus?.()
    }
  })
  return f
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { ref, focusKey } = useFocus<HTMLDivElement>({ trackChildren: true, saveLastFocusedChild: true })
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="set-section">
        <h2 className="set-title">{title}</h2>
        <div className="set-group glass">{children}</div>
      </section>
    </FocusContext.Provider>
  )
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { ref, focused, pointer } = useRow(() => onChange(!value))
  return (
    <div ref={ref} className={`set-row ${focused ? 'is-focused' : ''}`} onClick={() => onChange(!value)} {...pointer}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {hint && <div className="set-hint">{hint}</div>}
      </div>
      <span className={`switch ${value ? 'is-on' : ''}`}>
        <span />
      </span>
    </div>
  )
}

function Choice<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const next = (): void => onChange(options[(options.findIndex((o) => o.id === value) + 1) % options.length].id)
  const { ref, focused, pointer } = useRow(next)
  return (
    <div ref={ref} className={`set-row ${focused ? 'is-focused' : ''}`} {...pointer}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {hint && <div className="set-hint">{hint}</div>}
      </div>
      <div className="seg">
        {options.map((o) => (
          <button key={o.id} className={`seg-btn ${o.id === value ? 'is-active' : ''}`} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function KeyField({ label, hint, value, onChange, link }: { label: string; hint: string; value: string; onChange: (v: string) => void; link: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const { ref, focused, pointer } = useRow(
    () => input.current?.focus(),
    () => undefined
  )
  return (
    <div ref={ref} className={`set-row ${focused ? 'is-focused' : ''}`} {...pointer} onClick={() => input.current?.focus()}>
      <div className="set-text">
        <div className="set-label">
          <KeyRound size={15} strokeWidth={1.7} /> {label}
        </div>
        <div className="set-hint">
          {hint}{' '}
          <button className="set-link" onClick={() => api.openExternal(link)}>
            Get a free key <ExternalLink size={12} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <input
        ref={input}
        className="set-input"
        type="password"
        value={draft}
        placeholder="Not set"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft.trim())}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === 'Escape') input.current?.blur()
        }}
      />
    </div>
  )
}

function Action({ label, hint, value, onPress }: { label: string; hint?: string; value?: string; onPress: () => void }) {
  const { ref, focused, pointer } = useRow(onPress)
  return (
    <div ref={ref} className={`set-row is-action ${focused ? 'is-focused' : ''}`} onClick={onPress} {...pointer}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {hint && <div className="set-hint">{hint}</div>}
      </div>
      {value && <span className="set-value">{value}</span>}
      <ChevronRight size={18} strokeWidth={1.6} className="set-chev" />
    </div>
  )
}

function About() {
  const { ref, focused, pointer } = useRow()
  const lantern = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focused || !lantern.current) return
    const core = lantern.current.querySelectorAll('.lm-core, .lm-halo')
    gsap.fromTo(core, { opacity: 0.55 }, { opacity: 1, duration: d(1.2), ease: 'sine.inOut' })
  }, [focused])
  return (
    <section className="set-section">
      <h2 className="set-title">About</h2>
      <div ref={ref} className={`about glass ${focused ? 'is-focused' : ''}`} {...pointer}>
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
      </div>
    </section>
  )
}

export function SettingsScreen() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const go = useNav((s) => s.go)
  const [slow, setSlow] = useState(() => localStorage.getItem(SLOW_KEY) === '1')
  const [cache, setCache] = useState('1.2 GB')
  if (!settings) return <Screen id="settings" className="page" />
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => update({ [k]: v } as Partial<Settings>)

  return (
    <Screen id="settings" className="page settings" ref={(el) => (pageRef.current = el)}>
      <header className="page-head">
        <h1 className="t-title">Settings</h1>
      </header>

      <Section title="Library">
        <Action label="Library Folders" hint="Where Magic Lanterns looks for films and shows." value="2 folders" onPress={() => go('folders')} />
        <Action label="Rescan Library" hint="Look for new, moved and removed files now." onPress={() => undefined} />
        <Action label="Refresh All Metadata" hint="Fetch artwork, ratings and episode data again." onPress={() => undefined} />
      </Section>

      <Section title="Metadata">
        <KeyField label="TMDB API Key" hint="Posters, backdrops, title logos, cast and episodes." value={settings.tmdbKey} onChange={set('tmdbKey')} link="https://www.themoviedb.org/settings/api" />
        <KeyField label="OMDb API Key" hint="IMDb, Rotten Tomatoes and Metacritic scores." value={settings.omdbKey} onChange={set('omdbKey')} link="https://www.omdbapi.com/apikey.aspx" />
        <Choice
          label="Metadata Language"
          value={settings.metadataLanguage}
          onChange={set('metadataLanguage')}
          options={[
            { id: 'en-US', label: 'English' },
            { id: 'es-ES', label: 'Español' },
            { id: 'fr-FR', label: 'Français' },
            { id: 'hi-IN', label: 'हिन्दी' }
          ]}
        />
      </Section>

      <Section title="Playback">
        <Toggle label="Autoplay Next Episode" hint="Starts the next episode when the countdown ends." value={settings.autoplayNext} onChange={set('autoplayNext')} />
        <Toggle label="Hero Previews" hint="Let the Home carousel play a muted clip after a few idle seconds." value={settings.heroPreviews} onChange={set('heroPreviews')} />
        <Choice
          label="Preferred Audio"
          value={settings.audioLanguage}
          onChange={set('audioLanguage')}
          options={[
            { id: 'eng', label: 'English' },
            { id: 'orig', label: 'Original' },
            { id: 'spa', label: 'Español' }
          ]}
        />
      </Section>

      <Section title="Subtitles">
        <Choice
          label="Default Subtitles"
          value={settings.subtitleLanguage}
          onChange={set('subtitleLanguage')}
          options={[
            { id: 'off', label: 'Off' },
            { id: 'eng', label: 'English' },
            { id: 'forced', label: 'Forced Only' }
          ]}
        />
        <Choice
          label="Size"
          value={settings.subtitleSize}
          onChange={set('subtitleSize')}
          options={[
            { id: 'small', label: 'Small' },
            { id: 'medium', label: 'Medium' },
            { id: 'large', label: 'Large' }
          ]}
        />
        <Choice
          label="Style"
          value={settings.subtitleStyle}
          onChange={set('subtitleStyle')}
          options={[
            { id: 'shadow', label: 'Shadow' },
            { id: 'glass', label: 'Glass' },
            { id: 'outline', label: 'Outline' }
          ]}
        />
        <div className={`sub-preview size-${settings.subtitleSize} style-${settings.subtitleStyle}`}>
          <span>The light spilled out across the dark.</span>
        </div>
      </Section>

      <Section title="Accessibility">
        <Toggle label="Reduce Motion" hint="Replaces lifts, tilts and zooms with gentle fades. Follows your system setting too." value={settings.reduceMotion} onChange={set('reduceMotion')} />
      </Section>

      <Section title="Storage">
        <Action label="Artwork and Preview Cache" hint="Posters, backdrops, frame grabs and preview clips." value={cache} onPress={() => setCache('0 MB')} />
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

      <About />
    </Screen>
  )
}

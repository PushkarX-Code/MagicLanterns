import { useEffect, useRef, useState } from 'react'
import { Check, FolderPlus, Play } from 'lucide-react'
import type { MediaItem, ScanStatus } from '@shared/types'
import { api } from '../lib/api'
import { useLibraryVersion } from '../state/library'
import { useSettings } from '../state/settings'
import { gsap, d, EASE } from '../design/motion'
import { BlurImage } from './BlurImage'
import { PillButton } from './Buttons'

type Place = { path: string; label: string; videos: number }

/**
 * First run, in two moments. Choose: the usual places films live are offered with how many videos each
 * holds, or any folder can be picked. Then watch: titles appear on a wall as the first scan reads them,
 * and "Start watching" opens Home once there's something to watch.
 */
export function Welcome() {
  const finish = useSettings((s) => s.update)
  const version = useLibraryVersion((s) => s.version)
  const [places, setPlaces] = useState<Place[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const wall = useRef<HTMLDivElement>(null)
  const shown = useRef(new Set<string>())
  const bridge = window.lantern

  useEffect(() => {
    api.getFolders().then((f) => setFolders(f.map((x) => x.path)))
    bridge?.suggestFolders?.().then((p) => {
      setPlaces(p)
      setChosen(p.map((x) => x.path))
    })
    if (!bridge?.onScan) return
    bridge.scanStatus().then(setScan)
    return bridge.onScan(setScan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The wall follows the library as the scan finds titles (and folders added from Settings count too).
  useEffect(() => {
    bridge?.getLibrary().then(setItems).catch(() => undefined)
    api.getFolders().then((f) => f.length && setFolders(f.map((x) => x.path)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  // New tiles rise in; ones already shown stay put.
  useEffect(() => {
    const fresh = [...(wall.current?.querySelectorAll<HTMLElement>('.welcome-tile') ?? [])].filter((el) => !shown.current.has(el.dataset.id!))
    fresh.forEach((el) => shown.current.add(el.dataset.id!))
    if (fresh.length) gsap.fromTo(fresh, { opacity: 0, y: 18, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: d(0.7), ease: EASE.settle, stagger: 0.05 })
  }, [items])

  const add = async (paths: string[]): Promise<void> => {
    for (const p of paths) await api.addFolder(p).catch(() => undefined)
    setFolders((f) => [...new Set([...f, ...paths])])
  }
  const pick = async (): Promise<void> => {
    const path = await bridge?.pickFolder()
    if (path) await add([path])
  }

  const started = folders.length > 0
  const busy = !!scan?.scanning
  const films = items.filter((i) => i.kind === 'movie').length
  const shows = items.length - films
  const count = [films && `${films} film${films === 1 ? '' : 's'}`, shows && `${shows} show${shows === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  const progress = busy && scan!.toRead ? scan!.read / scan!.toRead : busy ? 0.08 : started ? 1 : 0

  return (
    <section className={`welcome ${started ? 'is-scanning' : ''}`}>
      <div className="empty-glow" />
      <div className="welcome-head">
        <h1 className="t-display welcome-title">{!started ? 'Your cinema awaits' : busy || !items.length ? 'Finding your films…' : 'Your cinema is ready'}</h1>
        <p className="welcome-text">
          {!started
            ? 'Tell Magic Lanterns where your films and shows live. It finds them, groups the episodes, fetches the artwork and keeps watching for new ones.'
            : busy
              ? scan!.toRead
                ? `Reading ${scan!.read} of ${scan!.toRead} files${count ? ` · ${count} so far` : ''}`
                : `Looking through your folders · ${scan!.found} videos found`
              : items.length
                ? `${count}. Artwork keeps arriving while you watch.`
                : 'No playable videos in these folders yet. Add another folder, or drop films into these ones.'}
        </p>
        {started && (
          <div className="welcome-bar">
            <span style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
          </div>
        )}
      </div>

      {!started && places.length > 0 && (
        <div className="welcome-places">
          {places.map((p) => {
            const on = chosen.includes(p.path)
            return (
              <button
                key={p.path}
                className={`welcome-place glass ${on ? 'is-on' : ''}`}
                onClick={() => setChosen((c) => (on ? c.filter((x) => x !== p.path) : [...c, p.path]))}
              >
                <span className="welcome-check">{on && <Check size={14} strokeWidth={2.4} />}</span>
                <span className="welcome-place-name">{p.label}</span>
                <span className="welcome-place-count">{p.videos.toLocaleString()} videos</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="empty-actions">
        {!started ? (
          <>
            {chosen.length > 0 && (
              <PillButton icon={Play} focusKey="HERO-PLAY" onPress={() => add(chosen)}>
                Use {chosen.length === 1 ? 'This Folder' : `These ${chosen.length} Folders`}
              </PillButton>
            )}
            <PillButton icon={FolderPlus} variant={chosen.length ? 'glass' : undefined} focusKey={chosen.length ? undefined : 'HERO-PLAY'} onPress={pick}>
              Choose a Folder…
            </PillButton>
          </>
        ) : (
          <>
            <PillButton icon={Play} focusKey="HERO-PLAY" disabled={!items.length} onPress={() => finish({ onboarded: true })}>
              Start Watching
            </PillButton>
            <PillButton icon={FolderPlus} variant="glass" onPress={pick}>
              Add Another Folder
            </PillButton>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div ref={wall} className="welcome-wall">
          {items.slice(0, 24).map((i) => (
            <div key={i.id} data-id={i.id} className="welcome-tile">
              <BlurImage path={i.thumb ?? i.backdrop} size="w500" tiny={false} color={i.color} fallback={<div className="card-fallback">{i.title}</div>} />
              {!i.thumb && <span>{i.title}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

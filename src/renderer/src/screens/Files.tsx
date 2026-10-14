import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow,
  CheckCheck,
  CheckSquare,
  Ellipsis,
  EyeOff,
  Film,
  FilePlus2,
  FolderPlus,
  Globe,
  LayoutGrid,
  List,
  Plus,
  Rows3,
  Search,
  SquareStack,
  Star,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import type { FileEntry, FileSort, LibraryFolder } from '@shared/types'
import { api } from '../lib/api'
import { bytes, resolutionLabel, timeAgo, timecode, hdrLabel } from '../lib/format'
import { BlurImage } from '../components/BlurImage'
import { GlassIconButton, PillButton } from '../components/Buttons'
import { Popover, type PopoverOption } from '../components/Popover'
import { scrollPageTo } from '../components/Row'
import { Screen, Quiet } from '../components/Screen'
import { FocusContext, setFocus, useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav } from '../state/nav'
import { useSettle } from '../lib/useSettle'
import { gsap, d, EASE } from '../design/motion'

type View = 'grid' | 'list' | 'compact' | 'posters'
const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'list', label: 'List', icon: List },
  { id: 'compact', label: 'Compact', icon: Rows3 },
  { id: 'posters', label: 'Posters', icon: SquareStack }
]
const SORTS: { id: FileSort; label: string }[] = [
  { id: 'added', label: 'Date Added' },
  { id: 'name', label: 'Name' },
  { id: 'size', label: 'Size' },
  { id: 'duration', label: 'Length' },
  { id: 'played', label: 'Last Played' }
]

const PREFS_KEY = 'ml.files.view'
interface Prefs {
  view: View
  sort: FileSort
  descending: boolean
  starredOnly: boolean
  showWatched: boolean
}
function readPrefs(): Prefs {
  const base: Prefs = { view: 'list', sort: 'added', descending: true, starredOnly: false, showWatched: true }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return base
  }
}

const DAY = 86_400_000
function bucket(at: number): string {
  const age = Date.now() - at
  if (age < DAY) return 'Today'
  if (age < 7 * DAY) return 'This Week'
  if (age < 30 * DAY) return 'This Month'
  return 'Earlier'
}

function Thumb({ f, poster = false }: { f: FileEntry; poster?: boolean }) {
  const path = poster ? f.poster : f.image
  return (
    <BlurImage
      path={path}
      size={poster ? 'w342' : 'w500'}
      tiny={poster ? 'w92' : 'w300'}
      color={f.color}
      fallback={
        <div className="file-generated">
          <Film size={poster ? 28 : 20} strokeWidth={1.4} />
          <span>{f.title}</span>
        </div>
      }
    />
  )
}

function Check({ on }: { on: boolean }) {
  return <span className={`file-check ${on ? 'is-on' : ''}`}>{on && <CheckCheck size={13} strokeWidth={2.6} />}</span>
}

function StarButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ onEnterPress: onToggle })
  return (
    <button
      ref={ref}
      className={`file-star ${on ? 'is-on' : ''} ${focused ? 'is-focused' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={on ? 'Unstar' : 'Star'}
      {...pointer}
    >
      <Star size={19} strokeWidth={1.8} fill={on ? 'currentColor' : 'none'} />
    </button>
  )
}

interface ItemProps {
  f: FileEntry
  first: boolean
  view: View
  selecting: boolean
  selected: boolean
  onActivate: (f: FileEntry) => void
  onStar: (f: FileEntry) => void
  onFocused: (el: HTMLElement) => void
}

function FileItem({ f, first, view, selecting, selected, onActivate, onStar, onFocused }: ItemProps) {
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    focusKey: first ? 'FILES-FIRST' : undefined,
    onEnterPress: () => onActivate(f),
    onFocus: () => {
      setAmbient(f.color)
      if (ref.current) onFocused(ref.current)
    }
  })
  const tile = view === 'grid' || view === 'posters'
  useLift(frame, focused && tile, { sheen, scale: view === 'posters' ? 1.06 : 1.05 })
  const res = f.width ? resolutionLabel(f) : null
  const hdr = hdrLabel(f.hdr)

  if (tile) {
    return (
      <div ref={ref} className={`ftile ftile-${view} ${focused ? 'is-focused' : ''} ${selected ? 'is-selected' : ''}`} onClick={() => onActivate(f)} {...pointer}>
        <div ref={frame} className="ftile-frame">
          <Thumb f={f} poster={view === 'posters'} />
          {f.progress !== undefined && (
            <div className="card-progress">
              <span style={{ width: `${Math.max(3, f.progress * 100)}%` }} />
            </div>
          )}
          {selecting && <Check on={selected} />}
          {f.starred && !selecting && (
            <span className="ftile-star">
              <Star size={13} strokeWidth={0} fill="currentColor" />
            </span>
          )}
          {f.watched && <span className="ftile-watched">Watched</span>}
          <div className="card-glare" />
          <div ref={sheen} className="card-sheen" />
        </div>
        <div className="card-meta">
          <div className="card-title">{view === 'posters' ? f.title : f.fileName}</div>
          <div className="card-sub">{view === 'posters' ? f.subtitle : `${f.title} · ${bytes(f.size)}`}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`frow-wrap ${view}`}>
      <div ref={ref} className={`frow frow-${view} ${focused ? 'is-focused' : ''} ${selected ? 'is-selected' : ''}`} onClick={() => onActivate(f)} {...pointer}>
        {selecting && <Check on={selected} />}
        {view === 'list' && (
          <div className="frow-thumb">
            <Thumb f={f} />
            {f.progress !== undefined && (
              <div className="frow-progress">
                <span style={{ width: `${Math.max(4, f.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        <div className="frow-main">
          <div className="frow-title">
            {f.title}
            {f.itemId === null && <span className="frow-tag">New</span>}
          </div>
          <div className="frow-sub">{view === 'list' ? f.subtitle : f.fileName}</div>
          {view === 'list' && <div className="frow-file">{f.fileName}</div>}
        </div>
        {view === 'list' && <div className="frow-folder">{f.folder}</div>}
        <div className="frow-badges">
          {res && <span className="badge badge-outline">{res}</span>}
          {hdr && <span className="badge badge-outline">{hdr === 'Dolby Vision' ? 'DV' : hdr}</span>}
        </div>
        <div className="frow-num">{f.duration ? timecode(f.duration) : '—'}</div>
        <div className="frow-num">{f.size ? bytes(f.size) : '—'}</div>
        <div className="frow-added">{timeAgo(f.addedAt)}</div>
      </div>
      {!selecting && <StarButton on={f.starred} onToggle={() => onStar(f)} />}
    </div>
  )
}

function StreamModal({ onClose, onPlay }: { onClose: () => void; onPlay: (url: string) => void }) {
  const [url, setUrl] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'STREAM', isFocusBoundary: true, trackChildren: true })
  const valid = /^(https?|rtsp|rtmp):\/\/\S+/i.test(url.trim())
  useEffect(() => {
    if (panel.current) gsap.fromTo(panel.current, { opacity: 0, scale: 0.96, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: d(0.45), ease: EASE.settle })
    input.current?.focus()
    requestAnimationFrame(() => setFocus('STREAM-PLAY'))
  }, [])
  return (
    <FocusContext.Provider value={focusKey}>
      <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div
          ref={(el) => {
            panel.current = el
            ;(ref as { current: HTMLDivElement | null }).current = el
          }}
          className="stream glass-strong"
        >
          <div className="resume-kicker">Open Network Stream</div>
          <div className="resume-title">Play from a URL</div>
          <input
            ref={input}
            className="stream-input"
            value={url}
            placeholder="https://example.com/movie.mp4"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && valid) onPlay(url.trim())
              if (e.key === 'Escape') onClose()
            }}
          />
          <div className="stream-hint">HTTP, HTTPS and HLS links play directly. RTSP and RTMP open once the FFmpeg engine lands.</div>
          <div className="stream-actions">
            <PillButton focusKey="STREAM-PLAY" icon={Globe} disabled={!valid} onPress={() => valid && onPlay(url.trim())}>
              Play Stream
            </PillButton>
            <PillButton variant="glass" icon={X} onPress={onClose}>
              Cancel
            </PillButton>
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  )
}

type Menu = null | 'add' | 'view' | 'more'

export function FilesScreen() {
  const push = useNav((s) => s.push)
  const [files, setFiles] = useState<FileEntry[] | null>(null)
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<Menu>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [stream, setStream] = useState(false)
  const page = useRef<HTMLDivElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const { ref: listRef, focusKey: listKey } = useFocus<HTMLDivElement>({ focusKey: 'FILES-LIST', trackChildren: true, saveLastFocusedChild: true })
  const search = useFocus<HTMLDivElement>({ onFocus: () => searchInput.current?.focus(), onBlur: () => searchInput.current?.blur() })

  const reload = async (): Promise<void> => {
    const [f, dirs] = await Promise.all([api.getFiles(), api.getFolders()])
    setFiles(f)
    setFolders(dirs)
  }
  useEffect(() => {
    reload()
  }, [])
  useSettle(body, !!files, '.frow-wrap, .ftile')

  const update = (patch: Partial<Prefs>): void => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    } catch {
      /* per-viewer convenience only */
    }
  }

  const shown = useMemo(() => {
    if (!files) return null
    const q = query.trim().toLowerCase()
    const list = files.filter(
      (f) =>
        (!prefs.starredOnly || f.starred) &&
        (prefs.showWatched || !f.watched) &&
        (!q || `${f.title} ${f.subtitle} ${f.fileName} ${f.folder}`.toLowerCase().includes(q))
    )
    const key: Record<FileSort, (f: FileEntry) => number | string> = {
      added: (f) => f.addedAt,
      name: (f) => f.title.toLowerCase() + f.subtitle,
      size: (f) => f.size,
      duration: (f) => f.duration,
      played: (f) => f.lastPlayed ?? 0
    }
    const k = key[prefs.sort]
    list.sort((a, b) => {
      const x = k(a)
      const y = k(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return prefs.descending ? -c : c
    })
    return list
  }, [files, prefs, query])

  // Group by when each file arrived, only when that is the sort.
  const groups = useMemo(() => {
    if (!shown) return []
    if (prefs.sort !== 'added') return [{ name: '', files: shown }]
    const out: { name: string; files: FileEntry[] }[] = []
    for (const f of shown) {
      const name = bucket(f.addedAt)
      const g = out[out.length - 1]
      if (g?.name === name) g.files.push(f)
      else out.push({ name, files: [f] })
    }
    return out
  }, [shown, prefs.sort])

  const activate = (f: FileEntry): void => {
    if (selecting) {
      const next = new Set(selected)
      if (next.has(f.id)) next.delete(f.id)
      else next.add(f.id)
      setSelected(next)
      return
    }
    push({ name: 'player', fileId: f.id })
  }
  const star = async (f: FileEntry): Promise<void> => {
    await api.setFilesStarred([f.id], !f.starred)
    reload()
  }

  const addFolder = async (): Promise<void> => {
    const path = window.lantern ? await window.lantern.pickFolder() : window.prompt('Folder path')
    if (path) setFolders(await api.addFolder(path))
  }
  const addFiles = async (): Promise<void> => {
    if (!window.lantern) {
      picker.current?.click()
      return
    }
    const picked = await window.lantern.pickFiles()
    if (picked.length) {
      await api.addFiles(picked)
      reload()
    }
  }

  const bulk = async (action: 'star' | 'unstar' | 'watched' | 'unwatched' | 'remove'): Promise<void> => {
    const ids = [...selected]
    if (!ids.length) return
    if (action === 'star' || action === 'unstar') await api.setFilesStarred(ids, action === 'star')
    if (action === 'watched' || action === 'unwatched') await api.setFilesWatched(ids, action === 'watched')
    if (action === 'remove') await api.removeFiles(ids)
    setSelected(new Set())
    if (action === 'remove') setSelecting(false)
    reload()
  }

  const ViewIcon = VIEWS.find((v) => v.id === prefs.view)!.icon
  const menuOptions = (): PopoverOption[] => {
    if (menu === 'add')
      return [
        { label: 'Add Folder…', icon: FolderPlus, onSelect: addFolder },
        { label: 'Add Files…', icon: FilePlus2, onSelect: addFiles },
        { label: 'Open Network Stream…', icon: Globe, onSelect: () => setStream(true) }
      ]
    if (menu === 'view') return VIEWS.map((v) => ({ label: v.label, icon: v.icon, checked: prefs.view === v.id, onSelect: () => update({ view: v.id }) }))
    return [
      ...SORTS.map((s) => ({ label: s.label, checked: prefs.sort === s.id, keepOpen: true, onSelect: () => update({ sort: s.id }) })),
      {
        label: 'Descending',
        icon: ArrowDownWideNarrow,
        checked: prefs.descending,
        divider: true,
        keepOpen: true,
        onSelect: () => update({ descending: !prefs.descending })
      },
      {
        label: 'Select Items',
        icon: CheckSquare,
        divider: true,
        onSelect: () => {
          setSelecting(true)
          setSelected(new Set())
        }
      },
      { label: 'Starred Only', icon: Star, checked: prefs.starredOnly, keepOpen: true, onSelect: () => update({ starredOnly: !prefs.starredOnly }) },
      {
        label: 'Hide Watched',
        icon: EyeOff,
        checked: !prefs.showWatched,
        keepOpen: true,
        onSelect: () => update({ showWatched: !prefs.showWatched })
      }
    ]
  }
  const toolbarButton = (id: Exclude<Menu, null>, icon: LucideIcon, label: string) => (
    <div className="popover-anchor">
      <GlassIconButton icon={icon} label={label} size={46} active={menu === id} onPress={() => setMenu(menu === id ? null : id)} />
      {menu === id && <Popover align="right" title={label} options={menuOptions()} onClose={() => setMenu(null)} />}
    </div>
  )

  const allSelected = !!shown && shown.length > 0 && shown.every((f) => selected.has(f.id))
  const tile = prefs.view === 'grid' || prefs.view === 'posters'

  return (
    <Screen id="files" ref={page} className="page files" initialFocus="FILES-FIRST">
      <header className="page-head files-head">
        <div className="files-title">
          <h1 className="t-title">Files</h1>
          <div className="page-count">
            <span className="live-dot" /> {files ? `${files.length} files` : ' '} · Syncing {folders.length} folder{folders.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="files-tools">
          <div
            ref={search.ref}
            className={`files-search glass ${search.focused ? 'is-focused' : ''}`}
            {...search.pointer}
            onClick={() => searchInput.current?.focus()}
          >
            <Search size={19} strokeWidth={1.7} />
            <input
              ref={searchInput}
              value={query}
              placeholder="Filter files"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === 'Backspace') e.stopPropagation()
              }}
            />
          </div>
          {toolbarButton('add', Plus, 'Add')}
          {toolbarButton('view', ViewIcon, 'View')}
          {toolbarButton('more', Ellipsis, 'More')}
        </div>
      </header>

      {selecting && (
        <div className="selbar glass-strong">
          <span className="selbar-count">{selected.size} selected</span>
          <PillButton variant="glass" icon={CheckSquare} onPress={() => setSelected(allSelected ? new Set() : new Set(shown?.map((f) => f.id)))}>
            {allSelected ? 'Select None' : 'Select All'}
          </PillButton>
          <GlassIconButton icon={Star} label="Star" size={46} onPress={() => bulk('star')} />
          <GlassIconButton icon={CheckCheck} label="Mark Watched" size={46} onPress={() => bulk('watched')} />
          <GlassIconButton icon={EyeOff} label="Mark Unwatched" size={46} onPress={() => bulk('unwatched')} />
          <GlassIconButton icon={Trash2} label="Remove from Library" size={46} onPress={() => bulk('remove')} />
          <PillButton
            icon={X}
            onPress={() => {
              setSelecting(false)
              setSelected(new Set())
            }}
          >
            Done
          </PillButton>
        </div>
      )}

      <FocusContext.Provider value={listKey}>
        <div ref={body}>
          <div ref={listRef} className={`files-body view-${prefs.view}`}>
            {!shown &&
              Array.from({ length: 8 }, (_, i) =>
                tile ? (
                  <div key={i} className="ftile">
                    <div className="ftile-frame skeleton" />
                  </div>
                ) : (
                  <div key={i} className="frow-wrap">
                    <div className="frow skeleton" style={{ height: prefs.view === 'list' ? 92 : 52 }} />
                  </div>
                )
              )}
            {shown && shown.length === 0 && (
              <Quiet title={query ? 'No files match' : 'No files here yet'} line={query ? `Nothing matches "${query}".` : 'Add a folder or drop in a few files with the + button.'} />
            )}
            {groups.map((g) => (
              <section key={g.name || 'all'} className="files-group">
                {g.name && <h2 className="files-group-title">{g.name}</h2>}
                <div className={tile ? `files-grid is-${prefs.view}` : 'files-rows'}>
                  {!tile && prefs.view === 'list' && (
                    <div className="frow-head">
                      <span>Title</span>
                      <span>Folder</span>
                      <span>Quality</span>
                      <span>Length</span>
                      <span>Size</span>
                      <span>Added</span>
                    </div>
                  )}
                  {g.files.map((f) => (
                    <FileItem
                      key={f.id}
                      f={f}
                      first={f.id === shown?.[0]?.id}
                      view={prefs.view}
                      selecting={selecting}
                      selected={selected.has(f.id)}
                      onActivate={activate}
                      onStar={star}
                      onFocused={(el) => scrollPageTo(page.current, el, 200)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </FocusContext.Provider>

      <input
        ref={picker}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={async (e) => {
          const list = [...(e.target.files ?? [])]
          if (list.length) {
            await api.addFiles(list.map((f) => ({ path: f.name, url: URL.createObjectURL(f), size: f.size })))
            reload()
          }
          e.target.value = ''
        }}
      />
      {stream && (
        <StreamModal
          onClose={() => setStream(false)}
          onPlay={(url) => {
            setStream(false)
            push({ name: 'player', url })
          }}
        />
      )}
    </Screen>
  )
}

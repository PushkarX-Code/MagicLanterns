import type { LanternApi } from '@shared/api'
import type { CardModel, Collection, Episode, FileEntry, FileInfo, GenreTile, HomeRow, LibraryFolder, MediaItem, PlaybackSource } from '@shared/types'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

const SETTINGS_KEY = 'ml.settings'

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Developer switch (Settings → Interface) that slows every call so skeletons can be judged. */
export const SLOW_KEY = 'ml.dev.slow'
const slow = (): boolean => {
  try {
    return localStorage.getItem(SLOW_KEY) === '1'
  } catch {
    return false
  }
}

const seen = new Set<string>()
/** First request for a key pays a "network" cost, repeats come from the "cache" instantly. */
function simulatedLatency(key: string, firstMs: number): Promise<void> {
  const ms = slow() ? 1800 : seen.has(key) ? 0 : firstMs
  seen.add(key)
  return new Promise((r) => setTimeout(r, ms))
}

const episodesOf = (show: MediaItem): Episode[] => show.seasons?.flatMap((s) => s.episodes) ?? []
const code = (e: Episode): string => `S${e.season}, E${e.number}`

/** The episode a viewer would land on next: the one in progress, else the first unwatched after the last watched. */
export function upNext(show: MediaItem): { episode: Episode; state: 'continue' | 'next' | 'start' } | null {
  const eps = episodesOf(show)
  if (!eps.length) return null
  const partial = eps.find((e) => e.progress && !e.progress.watched && e.progress.position > 0)
  if (partial) return { episode: partial, state: 'continue' }
  let lastWatched = -1
  eps.forEach((e, i) => e.progress?.watched && (lastWatched = i))
  if (lastWatched === -1) return { episode: eps[0], state: 'start' }
  const next = eps[lastWatched + 1]
  return next ? { episode: next, state: 'next' } : null
}

/**
 * Where the library comes from: the built-in demo, or the real library database in the desktop app.
 * The rows, search, files and playback logic below are the same for both.
 */
export interface LibrarySource {
  items(): MediaItem[]
  collections(): Collection[]
  folders(): Promise<LibraryFolder[]>
  addFolder(path: string): Promise<LibraryFolder[]>
  removeFolder(path: string): Promise<LibraryFolder[]>
  /** The film or episode file to play. */
  media(item: MediaItem, episode?: Episode): { url: string; alternates?: string[] }
  /** Fixed hero line-up (the demo); otherwise the newest arrivals that have artwork. */
  heroIds?: string[]
  /** Resolves once the first copy of the library has arrived. */
  ready?(): Promise<void>
  /** The demo pretends to load, so skeletons can be judged. */
  simulateLatency?: boolean
  /** The demo has Skip Intro markers on every episode. */
  demoIntro?: boolean
  // Saving changes (the demo keeps them in memory only).
  saveProgress?(file: FileInfo, position: number, duration: number): void
  setWatched?(files: FileInfo[], watched: boolean): void
  setFavorite?(itemId: string, on: boolean): void
  setInList?(itemId: string, on: boolean): void
  hideFiles?(files: FileInfo[]): void
}

export function createLibraryApi(src: LibrarySource): LanternApi {
  let settings = readSettings()
  const hidden = new Set<string>()
  const latency = async (key: string, ms: number): Promise<void> => {
    await src.ready?.()
    if (src.simulateLatency) await simulatedLatency(key, ms)
  }
  const items = (): MediaItem[] => src.items()
  let indexed: MediaItem[] | null = null
  let index = new Map<string, MediaItem>()
  const byId = (): Map<string, MediaItem> => {
    const list = items()
    if (list !== indexed) {
      indexed = list
      index = new Map(list.map((i) => [i.id, i]))
    }
    return index
  }

  function lastPlayed(item: MediaItem): number {
    if (item.kind === 'movie') return item.progress?.lastPlayed ?? 0
    return Math.max(0, ...episodesOf(item).map((e) => e.progress?.lastPlayed ?? 0))
  }

  // Parts that aren't known yet (no year or genre before metadata) are left out rather than shown blank.
  const dot = (...parts: (string | number | undefined)[]): string => parts.filter(Boolean).join(' · ')
  const yearGenre = (i: MediaItem): string =>
    i.kind === 'show'
      ? dot(`${i.seasons?.length ?? 1} Season${(i.seasons?.length ?? 1) > 1 ? 's' : ''}`, i.genres[0])
      : dot(i.year, i.genres[0])

  function card(i: MediaItem, subtitle = yearGenre(i)): CardModel {
    return { key: i.id, itemId: i.id, image: i.thumb ?? i.backdrop, logo: i.thumb ? null : i.logo, title: i.title, subtitle, color: i.color }
  }

  function remaining(seconds: number): string {
    const m = Math.max(1, Math.round(seconds / 60))
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`
  }

  /** Recents: whatever was played most recently, in progress first-class, finished titles after. */
  function recentCards(): CardModel[] {
    const cards: { at: number; card: CardModel }[] = []
    for (const i of items()) {
      if (i.kind === 'movie') {
        const p = i.progress
        if (!p?.lastPlayed) continue
        const partial = !p.watched && p.position > 0
        cards.push({
          at: p.lastPlayed + (partial ? 1e12 : 0),
          card: { ...card(i, partial ? remaining(p.duration - p.position) : 'Watched'), progress: partial ? p.position / p.duration : undefined }
        })
        continue
      }
      const nx = upNext(i)
      if (!nx || nx.state === 'start') continue
      const e = nx.episode
      cards.push({
        at: lastPlayed(i) + 1e12,
        card: {
          key: e.id,
          itemId: i.id,
          episodeId: e.id,
          image: e.still ?? i.backdrop,
          logo: i.logo,
          title: i.title,
          subtitle: `${nx.state === 'continue' ? 'Continue' : 'Next'} · ${code(e)}`,
          progress: nx.state === 'continue' && e.progress ? e.progress.position / e.progress.duration : undefined,
          color: i.color
        }
      })
    }
    return cards.sort((a, b) => b.at - a.at).map((c) => c.card)
  }

  function isUnwatched(i: MediaItem): boolean {
    if (i.kind === 'movie') return !i.progress
    return !episodesOf(i).some((e) => e.progress)
  }

  /** Same five picks all day, new ones tomorrow. */
  function picksOfTheDay(): MediaItem[] {
    const day = Math.floor(Date.now() / 86_400_000)
    let seed = day * 9301 + 49297
    const rand = (): number => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    // Always lead with anime, then a daily shuffle of everything else.
    const shuffled = [...items()].map((i) => ({ i, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.i)
    const anime = shuffled.filter((i) => i.genres.includes('Anime')).slice(0, 3)
    return [...anime, ...shuffled.filter((i) => !anime.includes(i))].slice(0, 6)
  }

  function genreTiles(): GenreTile[] {
    const map = new Map<string, MediaItem[]>()
    for (const i of items()) for (const g of i.genres) map.set(g, [...(map.get(g) ?? []), i])
    return [...map.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => (a[0] === 'Anime' ? -1 : b[0] === 'Anime' ? 1 : b[1].length - a[1].length)) // Anime leads
      .map(([name, list]) => ({
        name,
        count: list.length,
        images: list.slice(0, 3).map((i) => i.backdrop).filter(Boolean) as string[],
        color: list[0].color
      }))
  }

  /** Lightweight typo-tolerant scorer. Phase 5 replaces it with fuse.js over the SQLite index. */
  function score(item: MediaItem, q: string): number {
    const hay = [item.title, String(item.year), ...item.genres, ...item.cast.map((c) => c.name), item.credit?.name ?? '']
    let best = 0
    for (const field of hay) {
      const f = field.toLowerCase()
      if (f === q) best = Math.max(best, 100)
      else if (f.startsWith(q)) best = Math.max(best, 80)
      else if (f.split(/\s+/).some((w) => w.startsWith(q))) best = Math.max(best, 65)
      else if (f.includes(q)) best = Math.max(best, 50)
      else {
        // Subsequence match lets "intrstlr" find "Interstellar".
        let k = 0
        for (const ch of f) if (ch === q[k]) k++
        if (k === q.length && q.length >= 3) best = Math.max(best, 30 - (f.length - q.length) / 10)
      }
    }
    return item.title.toLowerCase().includes(q) ? best + 10 : best
  }

  // ---------- Files ----------

  const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path
  const folderOf = (path: string): string => path.slice(0, path.length - fileName(path).length - 1)

  /** Every physical file in the library, flattened from movies and episodes. */
  function libraryFiles(): FileEntry[] {
    const out: FileEntry[] = []
    for (const i of items()) {
      if (i.kind === 'movie' && i.file) {
        const p = i.progress
        out.push({
          id: `file-${i.id}`,
          itemId: i.id,
          title: i.title,
          subtitle: dot(i.year, i.genres[0]),
          fileName: fileName(i.file.path),
          folder: folderOf(i.file.path),
          path: i.file.path,
          size: i.file.size,
          duration: i.file.duration,
          width: i.file.width,
          height: i.file.height,
          hdr: i.file.hdr,
          addedAt: i.addedAt,
          lastPlayed: p?.lastPlayed,
          image: i.thumb ?? i.backdrop,
          poster: i.poster,
          color: i.color,
          progress: p && !p.watched ? p.position / p.duration : undefined,
          watched: !!p?.watched,
          starred: i.favorite
        })
        continue
      }
      for (const e of episodesOf(i)) {
        const p = e.progress
        out.push({
          id: `file-${e.id}`,
          itemId: i.id,
          episodeId: e.id,
          title: i.title,
          subtitle: `${code(e)} · ${e.title}`,
          fileName: fileName(e.file.path),
          folder: folderOf(e.file.path),
          path: e.file.path,
          size: e.file.size,
          duration: e.file.duration,
          width: e.file.width,
          height: e.file.height,
          hdr: e.file.hdr,
          // Episodes of a season arrive together; later episodes a little later.
          addedAt: i.addedAt + (e.season * 100 + e.number) * 60_000,
          lastPlayed: p?.lastPlayed,
          image: e.still ?? i.backdrop,
          poster: i.poster,
          color: i.color,
          progress: p && !p.watched ? p.position / p.duration : undefined,
          watched: !!p?.watched,
          starred: i.favorite
        })
      }
    }
    return out
  }

  /** Files added by hand that no metadata has matched yet. */
  const looseFiles: FileEntry[] = []

  /** "The.Grand.Budapest.Hotel.2014.1080p.BluRay.x264.mkv" → "The Grand Budapest Hotel" + 2014 */
  function cleanName(name: string): { title: string; year?: string } {
    const base = name.replace(/\.[a-z0-9]{2,4}$/i, '')
    const year = base.match(/(19|20)\d{2}/)?.[0]
    const cut = base.split(/(19|20)\d{2}|\b(2160p|1080p|720p|480p|bluray|web-?dl|webrip|hdtv|x264|x265|hevc|remux)\b/i)[0]
    const title = cut.replace(/[._]+/g, ' ').replace(/[[(]\s*$/, '').trim()
    return { title: title || base, year }
  }

  function hashColor(s: string): string {
    let h = 0
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360
    return `hsl(${h}, 32%, 26%)`
  }



  const allFiles = (): FileEntry[] => [...looseFiles, ...libraryFiles()].filter((f) => !hidden.has(f.id))

  /** The file record behind a Files-screen entry ("file-<item id>" or "file-<episode id>"). */
  const fileOfEntry = (entryId: string): FileInfo | undefined => {
    const f = allFiles().find((x) => x.id === entryId)
    const item = f?.itemId ? byId().get(f.itemId) : undefined
    if (!item) return undefined
    return f!.episodeId ? episodesOf(item).find((e) => e.id === f!.episodeId)?.file : item.file
  }

  const markFile = (id: string, fn: (target: { progress?: MediaItem['progress']; file?: { duration: number } }) => void): void => {
    const f = allFiles().find((x) => x.id === id)
    if (!f?.itemId) return
    const item = byId().get(f.itemId)
    if (!item) return
    if (f.episodeId) {
      const ep = episodesOf(item).find((e) => e.id === f.episodeId)
      if (ep) fn(ep)
    } else fn(item)
  }

  return {
    async getHome() {
      await latency('home', 900)
      const hero = src.heroIds
        ? src.heroIds.map((id) => byId().get(id)).filter((i): i is MediaItem => !!i)
        : (() => {
            // Newest arrivals with a picture; until frames exist, newest arrivals full stop.
            const newest = [...items()].sort((a, b) => b.addedAt - a.addedAt)
            const pictured = newest.filter((i) => i.backdrop)
            return (pictured.length ? pictured : newest).slice(0, 6)
          })()
      const rows: HomeRow[] = [
        { id: 'recents', title: '', kind: 'cards', cards: recentCards() },
        {
          id: 'recent',
          title: 'Recently Added',
          kind: 'cards',
          cards: [...items()].sort((a, b) => b.addedAt - a.addedAt).slice(0, 10).map((i) => card(i, 'Recently Added'))
        },
        { id: 'picks', title: 'Picks of the Day', kind: 'cards', cards: picksOfTheDay().map((i) => card(i)) },
        { id: 'genres', title: 'Film Genres', kind: 'genres', cards: [], genres: genreTiles() },
        { id: 'unwatched', title: 'Unwatched', kind: 'cards', cards: items().filter(isUnwatched).map((i) => card(i)) },
        {
          id: 'most',
          title: 'Most Watched',
          kind: 'cards',
          cards: items().filter((i) => i.playCount > 0)
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, 10)
            .map((i) => card(i, `Played ${i.playCount} time${i.playCount === 1 ? '' : 's'}`))
        }
      ]
      return { hero, rows: rows.filter((r) => r.cards.length || r.genres?.length) }
    },
    async getItem(id) {
      await latency(`item-${id}`, 450)
      return byId().get(id) ?? null
    },
    async getGenre(name) {
      await latency(`genre-${name}`, 400)
      return items().filter((i) => i.genres.includes(name)).sort((a, b) => b.year - a.year)
    },
    async getFavorites() {
      await latency('favorites', 400)
      return items().filter((i) => i.favorite).sort((a, b) => a.title.localeCompare(b.title))
    },
    async getPersonItems(person) {
      await latency(`person-${person.name}`, 300)
      return items()
        .filter((i) => i.cast.some((c) => (person.id != null && c.id === person.id) || c.name === person.name))
        .sort((a, b) => b.year - a.year)
    },
    async getMoreLikeThis(id) {
      await latency(`more-${id}`, 700)
      const item = byId().get(id)
      if (!item) return []
      return items().filter((i) => i.id !== id)
        .map((i) => ({ i, s: i.genres.filter((g) => item.genres.includes(g)).length + (i.kind === item.kind ? 0.5 : 0) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
        .map((x) => x.i)
    },
    async getCollections() {
      await latency('collections', 300)
      const list = { id: 'my-list', name: 'My List', description: 'Saved for later.', itemIds: items().filter((i) => i.inList).map((i) => i.id) }
      return [list, ...src.collections()]
    },
    async search(query) {
      const q = query.trim().toLowerCase()
      if (!q) return []
      await latency(`search-${q}`, 120)
      return items().map((i) => ({ i, s: score(i, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.i)
    },

    async getFiles() {
      await latency('files', 500)
      return allFiles()
    },
    async getFolders() {
      await latency('folders', 200)
      return src.folders()
    },
    addFolder: (path) => src.addFolder(path),
    removeFolder: (path) => src.removeFolder(path),
    async addFiles(files) {
      const now = Date.now()
      const added = files.map((f, n): FileEntry => {
        const name = fileName(f.path)
        const { title, year } = cleanName(name)
        return {
          id: `loose-${now}-${n}`,
          itemId: null,
          title,
          subtitle: year ? `${year} · Not matched yet` : 'Not matched yet',
          fileName: name,
          folder: folderOf(f.path) || 'Added files',
          path: f.path,
          url: f.url,
          size: f.size ?? 0,
          duration: 0,
          width: 0,
          height: 0,
          hdr: 'SDR',
          addedAt: now + n,
          image: null,
          poster: null,
          color: hashColor(title),
          watched: false,
          starred: false
        }
      })
      looseFiles.unshift(...added)
      return added
    },
    async removeFiles(ids) {
      for (const id of ids) {
        const loose = looseFiles.findIndex((f) => f.id === id)
        if (loose >= 0) looseFiles.splice(loose, 1)
        else hidden.add(id)
      }
      src.hideFiles?.(ids.map(fileOfEntry).filter((x): x is FileInfo => !!x))
    },
    async setFilesStarred(ids, starred) {
      for (const id of ids) {
        const loose = looseFiles.find((f) => f.id === id)
        if (loose) loose.starred = starred
        const f = allFiles().find((x) => x.id === id)
        const item = f?.itemId ? byId().get(f.itemId) : undefined
        if (item) {
          item.favorite = starred
          src.setFavorite?.(item.id, starred)
        }
      }
    },
    async setFilesWatched(ids, watched) {
      for (const id of ids)
        markFile(id, (t) => {
          const d = t.file?.duration ?? 0
          t.progress = watched ? { position: d, duration: d, watched: true, lastPlayed: Date.now() } : undefined
        })
      for (const f of looseFiles) if (ids.includes(f.id)) f.watched = watched
      src.setWatched?.(ids.map(fileOfEntry).filter((x): x is FileInfo => !!x), watched)
    },

    async getPlayback(itemId, episodeId) {
      await latency(`play-${itemId}-${episodeId}`, 200)
      const item = byId().get(itemId)
      if (!item) throw new Error(`Unknown item ${itemId}`)
      const base = {
        url: '',
        itemId,
        title: item.title,
        logo: item.logo,
        backdrop: item.backdrop,
        color: item.color
      }
      if (item.kind === 'movie') {
        const p = item.progress
        return {
          ...base,
          ...src.media(item),
          subtitle: [item.year || '', item.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · '),
          overview: item.overview,
          resumeFraction: p && !p.watched ? p.position / p.duration : 0,
          file: item.file!
        } satisfies PlaybackSource
      }
      const eps = episodesOf(item)
      const ep = (episodeId && eps.find((e) => e.id === episodeId)) || upNext(item)?.episode || eps[0]
      const next = eps[eps.indexOf(ep) + 1]
      return {
        ...base,
        ...src.media(item, ep),
        episodeId: ep.id,
        subtitle: `${code(ep)} · ${ep.title}`,
        overview: ep.overview || item.overview,
        backdrop: ep.still ?? item.backdrop,
        resumeFraction: ep.progress && !ep.progress.watched ? ep.progress.position / ep.progress.duration : 0,
        file: ep.file,
        intro: ep.file?.intro ?? (src.demoIntro ? { start: 4, end: 22 } : undefined),
        next: next && { itemId, episodeId: next.id, title: next.title, label: code(next), still: next.still }
      } satisfies PlaybackSource
    },
    async getFilePlayback(fileId) {
      const f = allFiles().find((x) => x.id === fileId)
      if (!f) throw new Error(`Unknown file ${fileId}`)
      if (f.itemId) return this.getPlayback(f.itemId, f.episodeId)
      return {
        url: f.url ?? '',
        itemId: null,
        title: f.title,
        logo: null,
        subtitle: f.fileName,
        overview: f.path,
        backdrop: null,
        color: f.color,
        resumeFraction: 0,
        file: null
      }
    },
    async saveProgress(itemId, episodeId, position, duration) {
      const item = byId().get(itemId)
      if (!item || !duration) return
      const fraction = Math.min(1, position / duration)
      const target = episodeId ? episodesOf(item).find((e) => e.id === episodeId) : item
      if (!target) return
      const runtime = ('file' in target && target.file ? target.file.duration : 0) || duration
      const watched = fraction > 0.92
      target.progress = { position: watched ? runtime : fraction * runtime, duration: runtime, watched, lastPlayed: Date.now() }
      const file = 'file' in target ? target.file : undefined
      if (file) src.saveProgress?.(file, target.progress.position, runtime)
    },
    async setWatched(itemId, watched) {
      const item = byId().get(itemId)
      if (!item) return null
      const mark = (t: { progress?: MediaItem['progress']; file?: { duration: number } }): void => {
        const d = t.file?.duration ?? 0
        t.progress = watched ? { position: d, duration: d, watched: true, lastPlayed: Date.now() } : undefined
      }
      if (item.kind === 'movie') mark(item)
      else episodesOf(item).forEach(mark)
      src.setWatched?.((item.kind === 'movie' ? [item.file] : episodesOf(item).map((e) => e.file)).filter((x): x is FileInfo => !!x), watched)
      return item
    },
    async toggleFavorite(itemId) {
      const item = byId().get(itemId)
      if (item) {
        item.favorite = !item.favorite
        src.setFavorite?.(item.id, item.favorite)
      }
      return item ?? null
    },
    async toggleList(itemId) {
      const item = byId().get(itemId)
      if (item) {
        item.inList = !item.inList
        src.setInList?.(item.id, item.inList)
      }
      return item ?? null
    },

    async getSettings() {
      return settings
    },
    async setSettings(patch) {
      settings = { ...settings, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* storage unavailable: keep in memory */
      }
      return settings
    },

    openExternal(url) {
      if (window.lantern) window.lantern.openExternal(url)
      else window.open(url, '_blank', 'noopener')
    }
  }
}

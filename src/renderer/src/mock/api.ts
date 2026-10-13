import type { LanternApi } from '@shared/api'
import type { CardModel, Episode, HomeRow, MediaItem, MediaKind, PlaybackSource, Settings } from '@shared/types'
import { COLLECTIONS, FOLDERS, ITEMS, SAMPLE_VIDEOS } from './library'

const SETTINGS_KEY = 'ml.settings'
const DEFAULT_SETTINGS: Settings = {
  profileName: 'Pushkar',
  tmdbKey: '',
  omdbKey: '',
  metadataLanguage: 'en-US',
  reduceMotion: false,
  subtitleSize: 'medium',
  subtitleStyle: 'shadow',
  subtitleLanguage: 'eng',
  audioLanguage: 'eng',
  autoplayNext: true,
  heroPreviews: true
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Developer switch (Settings → Developer) that slows every call so skeletons can be judged. */
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
function latency(key: string, firstMs: number): Promise<void> {
  const ms = slow() ? 1800 : seen.has(key) ? 0 : firstMs
  seen.add(key)
  return new Promise((r) => setTimeout(r, ms))
}

const byId = new Map(ITEMS.map((i) => [i.id, i]))
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

function lastPlayed(item: MediaItem): number {
  if (item.kind === 'movie') return item.progress?.lastPlayed ?? 0
  return Math.max(0, ...episodesOf(item).map((e) => e.progress?.lastPlayed ?? 0))
}

const yearGenre = (i: MediaItem): string =>
  i.kind === 'show'
    ? `${i.seasons?.length ?? 1} Season${(i.seasons?.length ?? 1) > 1 ? 's' : ''} · ${i.genres[0] ?? ''}`
    : `${i.year} · ${i.genres[0] ?? ''}`

function card(i: MediaItem, subtitle = yearGenre(i)): CardModel {
  return { key: i.id, itemId: i.id, image: i.backdrop, logo: i.logo, title: i.title, subtitle, color: i.color }
}

function remaining(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`
}

function continueCards(): CardModel[] {
  const cards: { at: number; card: CardModel }[] = []
  for (const i of ITEMS) {
    if (i.kind === 'movie') {
      const p = i.progress
      if (p && !p.watched && p.position > 0)
        cards.push({ at: p.lastPlayed ?? 0, card: { ...card(i, remaining(p.duration - p.position)), progress: p.position / p.duration } })
      continue
    }
    const nx = upNext(i)
    if (!nx || nx.state === 'start') continue
    const e = nx.episode
    cards.push({
      at: lastPlayed(i),
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

function genreRows(): HomeRow[] {
  const counts = new Map<string, MediaItem[]>()
  for (const i of ITEMS) for (const g of i.genres) counts.set(g, [...(counts.get(g) ?? []), i])
  return [...counts.entries()]
    .filter(([, list]) => list.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([g, list]) => ({ id: `genre-${g}`, title: g, cards: list.map((i) => card(i)) }))
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

export function createMockApi(): LanternApi {
  let settings = readSettings()

  return {
    async getHome() {
      await latency('home', 900)
      const hero = ['movie-693134', 'tv-95396', 'movie-335984', 'tv-126308', 'movie-569094'].map((id) => byId.get(id)!)
      const rows: HomeRow[] = [
        { id: 'continue', title: 'Continue Watching', cards: continueCards() },
        {
          id: 'recent',
          title: 'Recently Added',
          cards: [...ITEMS].sort((a, b) => b.addedAt - a.addedAt).slice(0, 10).map((i) => card(i, 'Recently Added'))
        },
        { id: 'movies', title: 'Movies', cards: ITEMS.filter((i) => i.kind === 'movie').map((i) => card(i)) },
        { id: 'shows', title: 'TV Shows', cards: ITEMS.filter((i) => i.kind === 'show').map((i) => card(i)) },
        { id: 'unwatched', title: 'Unwatched', cards: ITEMS.filter(isUnwatched).map((i) => card(i)) },
        ...genreRows()
      ]
      return { hero, rows: rows.filter((r) => r.cards.length) }
    },
    async getLibrary(kind: MediaKind) {
      await latency(`lib-${kind}`, 500)
      return ITEMS.filter((i) => i.kind === kind).sort((a, b) => a.title.localeCompare(b.title))
    },
    async getItem(id) {
      await latency(`item-${id}`, 450)
      return byId.get(id) ?? null
    },
    async getContinueWatching() {
      await latency('continue', 400)
      return continueCards()
    },
    async getMoreLikeThis(id) {
      await latency(`more-${id}`, 700)
      const item = byId.get(id)
      if (!item) return []
      return ITEMS.filter((i) => i.id !== id)
        .map((i) => ({ i, s: i.genres.filter((g) => item.genres.includes(g)).length + (i.kind === item.kind ? 0.5 : 0) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
        .map((x) => x.i)
    },
    async getCollections() {
      await latency('collections', 400)
      const list = { id: 'my-list', name: 'My List', description: 'Saved for later.', itemIds: ITEMS.filter((i) => i.inList).map((i) => i.id) }
      return [list, ...COLLECTIONS]
    },
    async getFolders() {
      await latency('folders', 300)
      return FOLDERS
    },
    async search(query) {
      const q = query.trim().toLowerCase()
      if (!q) return []
      await latency(`search-${q}`, 120)
      return ITEMS.map((i) => ({ i, s: score(i, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.i)
    },

    async getPlayback(itemId, episodeId) {
      await latency(`play-${itemId}-${episodeId}`, 200)
      const item = byId.get(itemId)
      if (!item) throw new Error(`Unknown item ${itemId}`)
      const [primary, ...alternates] = SAMPLE_VIDEOS
      const base = {
        url: primary,
        alternates,
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
          subtitle: `${item.year} · ${item.genres.slice(0, 2).join(', ')}`,
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
        episodeId: ep.id,
        subtitle: `${code(ep)} · ${ep.title}`,
        overview: ep.overview || item.overview,
        backdrop: ep.still ?? item.backdrop,
        resumeFraction: ep.progress && !ep.progress.watched ? ep.progress.position / ep.progress.duration : 0,
        file: ep.file,
        intro: { start: 4, end: 22 },
        next: next && { itemId, episodeId: next.id, title: next.title, label: code(next), still: next.still }
      } satisfies PlaybackSource
    },
    async saveProgress(itemId, episodeId, position, duration) {
      const item = byId.get(itemId)
      if (!item || !duration) return
      const fraction = Math.min(1, position / duration)
      const target = episodeId ? episodesOf(item).find((e) => e.id === episodeId) : item
      if (!target) return
      const runtime = ('file' in target && target.file ? target.file.duration : 0) || duration
      const watched = fraction > 0.92
      target.progress = { position: watched ? runtime : fraction * runtime, duration: runtime, watched, lastPlayed: Date.now() }
    },
    async setWatched(itemId, watched) {
      const item = byId.get(itemId)
      if (!item) return null
      const mark = (t: { progress?: MediaItem['progress']; file?: { duration: number } }): void => {
        const d = t.file?.duration ?? 0
        t.progress = watched ? { position: d, duration: d, watched: true, lastPlayed: Date.now() } : undefined
      }
      if (item.kind === 'movie') mark(item)
      else episodesOf(item).forEach(mark)
      return item
    },
    async toggleFavorite(itemId) {
      const item = byId.get(itemId)
      if (item) item.favorite = !item.favorite
      return item ?? null
    },
    async toggleList(itemId) {
      const item = byId.get(itemId)
      if (item) item.inList = !item.inList
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

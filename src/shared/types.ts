// Domain types shared by main, engine, preload and renderer.
// Image fields hold TMDB-style paths ("/abc.jpg"). The renderer turns them into URLs,
// so the same model works for remote TMDB images now and the local ml-img:// cache later.

export type MediaKind = 'movie' | 'show'
export type HdrFormat = 'SDR' | 'HDR10' | 'HDR10+' | 'HLG' | 'DV'

export interface Ratings {
  tmdb?: number // 0–10
  imdb?: number // 0–10
  rottenTomatoes?: number // 0–100
  metacritic?: number // 0–100
}

export interface CastMember {
  name: string
  character: string
  profile: string | null
}

export interface AudioTrack {
  index: number
  codec: string // "eac3", "truehd", "aac"…
  language: string
  title: string
  channels: number
  atmos: boolean
  default?: boolean
}

export interface SubtitleTrack {
  index: number
  codec: string
  language: string
  title: string
  forced: boolean
  external: boolean
}

export interface FileInfo {
  path: string
  container: string
  size: number // bytes
  duration: number // seconds
  videoCodec: string
  width: number
  height: number
  hdr: HdrFormat
  bitrate: number // bits per second
  audio: AudioTrack[]
  subtitles: SubtitleTrack[]
}

export interface Progress {
  position: number // seconds
  duration: number // seconds
  watched: boolean
  lastPlayed?: number // epoch ms
}

export interface Episode {
  id: string
  showId: string
  season: number
  number: number
  title: string
  overview: string
  still: string | null
  runtime: number // minutes
  file: FileInfo
  progress?: Progress
}

export interface Season {
  number: number
  name: string
  episodes: Episode[]
}

export interface MediaItem {
  id: string
  kind: MediaKind
  tmdbId: number
  title: string
  year: number
  tagline: string
  overview: string
  runtime: number // minutes (typical episode length for shows)
  certification: string
  genres: string[]
  ratings: Ratings
  poster: string | null
  backdrop: string | null
  logo: string | null
  color: string // cached dominant backdrop color, drives the ambient layer
  trailerKey: string | null
  cast: CastMember[]
  credit: { role: 'Director' | 'Creator'; name: string } | null
  /** Short muted preview clip for the hero (Phase 4 generates these from the file). */
  preview: { url: string; start: number } | null
  addedAt: number
  favorite: boolean
  inList: boolean
  playCount: number
  // Movies
  file?: FileInfo
  progress?: Progress
  // Shows
  seasons?: Season[]
}

/** One tile in a row. Everything the card needs to render without another lookup. */
export interface CardModel {
  key: string
  itemId: string
  episodeId?: string
  image: string | null // 16:9 backdrop or episode still
  logo: string | null
  title: string
  subtitle: string
  progress?: number // 0–1
  color: string
}

export interface GenreTile {
  name: string
  count: number
  images: string[] // up to three backdrops, fanned like glass slides
  color: string
}

export interface HomeRow {
  id: string
  /** Empty for the untitled Recents row directly under the hero. */
  title: string
  kind: 'cards' | 'genres'
  cards: CardModel[]
  genres?: GenreTile[]
}

export interface HomeData {
  hero: MediaItem[]
  rows: HomeRow[]
}

export interface Collection {
  id: string
  name: string
  description: string
  itemIds: string[]
}

export interface LibraryFolder {
  path: string
  items: number
  size: number
  lastScan: number
}

/** One physical file as the Files screen shows it: a movie, an episode, or a file not yet matched. */
export interface FileEntry {
  id: string
  itemId: string | null // null until metadata matches it
  episodeId?: string
  title: string
  subtitle: string // "S2, E3 · Who Is Alive?" or "2024 · Science Fiction"
  fileName: string
  folder: string
  path: string
  /** Direct playable URL for files added by hand (ml-file:// or blob:). */
  url?: string
  size: number
  duration: number
  width: number
  height: number
  hdr: HdrFormat
  addedAt: number
  lastPlayed?: number
  image: string | null // 16:9 still or backdrop
  poster: string | null
  color: string
  progress?: number // 0–1
  watched: boolean
  starred: boolean
}

export type FileSort = 'added' | 'name' | 'size' | 'duration' | 'played'

export interface PlaybackSource {
  url: string
  itemId: string | null
  episodeId?: string
  title: string
  logo: string | null
  subtitle: string // "S1, E3 · Half Loop"
  overview: string
  backdrop: string | null
  color: string
  /** Where to resume, as a fraction of the runtime (0 = start). Fractions survive stream offsets and mock media. */
  resumeFraction: number
  /** Extra candidate URLs to try if `url` fails to load. */
  alternates?: string[]
  file: FileInfo | null
  intro?: { start: number; end: number }
  next?: { itemId: string; episodeId: string; title: string; label: string; still: string | null }
}

export type { Settings } from './settings'

/** One of this week's most-watched titles worldwide, with where it streams in the viewer's country. */
export interface TrendingTitle {
  rank: number
  id: number
  kind: 'movie' | 'tv'
  title: string
  year: number | null
  overview: string
  poster: string | null
  backdrop: string | null
  rating: number | null
  providers: { name: string; logo: string | null }[]
  /** Page listing every service that carries it (links out to each). */
  watchLink: string | null
}

/** App update lifecycle, as the renderer sees it. */
export type UpdateState =
  | { stage: 'available'; version: string; current: string; notes: string }
  | { stage: 'downloading'; version: string; percent: number }
  | { stage: 'ready'; version: string }
  | { stage: 'error'; message: string }

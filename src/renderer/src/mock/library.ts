// Phase 1 mock library. Real TMDB metadata and artwork paths (tmdb-fixture.json) combined with
// believable local-file details, ratings and watch state, so every screen can be judged on real art.
// Replaced by the SQLite-backed engine in Phases 2–3.

import fixture from './tmdb-fixture.json'
import type {
  AudioTrack,
  Collection,
  Episode,
  FileInfo,
  HdrFormat,
  LibraryFolder,
  MediaItem,
  Season,
  SubtitleTrack
} from '@shared/types'

interface FixtureEpisode {
  number: number
  title: string
  overview: string
  still: string | null
  runtime: number | null
}
interface FixtureEntry {
  tmdbId: number
  kind: 'movie' | 'show'
  title: string
  year: number
  certification: string
  genres: string[]
  runtime: number | null
  tmdbScore: number
  tagline: string
  overview: string
  poster: string
  backdrop: string
  logo: string
  trailerKey: string | null
  cast: { name: string; character: string; profile: string | null }[]
  director?: string | null
  creator?: string | null
  seasons?: { number: number; episodes: FixtureEpisode[] }[]
}

type Res = '2160p' | '1080p' | '720p'
interface Extras {
  color: string
  imdb: number
  rt: number
  mc?: number
  res: Res
  hdr: HdrFormat
  audio: 'atmos' | '7.1' | '5.1' | 'stereo'
  addedDaysAgo: number
  favorite?: boolean
  inList?: boolean
  /** Movies: fraction watched. Shows: [season, episode, fraction] of the episode in progress. */
  progress?: number | [number, number, number]
  watched?: boolean
  episodeRuntime?: number
  folder: string
}

/**
 * Open-licensed films used as the playable stand-in for every mock title (Blender Foundation, CC BY).
 * Tried in order; the first one that loads wins. Drop any local video onto the player to use it instead.
 */
export const SAMPLE_VIDEOS = [
  'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov',
  'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4',
  'https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
]

const DAY = 86_400_000
const NOW = Date.now()

const EXTRAS: Record<number, Extras> = {
  693134: { color: '#8a4a1c', imdb: 8.5, rt: 92, mc: 79, res: '2160p', hdr: 'DV', audio: 'atmos', addedDaysAgo: 1, progress: 0.42, favorite: true, folder: 'D:\\Movies' },
  95396: { color: '#24506a', imdb: 8.7, rt: 96, mc: 83, res: '2160p', hdr: 'DV', audio: 'atmos', addedDaysAgo: 3, progress: [2, 3, 0.58], inList: true, folder: 'E:\\TV' },
  335984: { color: '#9a5a1e', imdb: 8.0, rt: 88, mc: 81, res: '2160p', hdr: 'HDR10', audio: 'atmos', addedDaysAgo: 2, folder: 'D:\\Movies' },
  872585: { color: '#7a3a16', imdb: 8.3, rt: 93, mc: 90, res: '2160p', hdr: 'HDR10', audio: '5.1', addedDaysAgo: 5, progress: 0.16, folder: 'D:\\Movies' },
  126308: { color: '#5a2418', imdb: 8.6, rt: 99, mc: 85, res: '2160p', hdr: 'HDR10', audio: '5.1', addedDaysAgo: 4, progress: [1, 4, 0], episodeRuntime: 58, folder: 'E:\\TV' },
  157336: { color: '#5c4a32', imdb: 8.7, rt: 73, mc: 74, res: '2160p', hdr: 'HDR10', audio: '5.1', addedDaysAgo: 40, watched: true, favorite: true, folder: 'D:\\Movies' },
  414906: { color: '#5a1a1a', imdb: 7.8, rt: 85, mc: 72, res: '2160p', hdr: 'DV', audio: 'atmos', addedDaysAgo: 12, folder: 'D:\\Movies' },
  136315: { color: '#1e3e5a', imdb: 8.5, rt: 99, mc: 92, res: '1080p', hdr: 'SDR', audio: '5.1', addedDaysAgo: 9, progress: [2, 6, 0.35], folder: 'E:\\TV' },
  76341: { color: '#a0521a', imdb: 8.1, rt: 97, mc: 90, res: '2160p', hdr: 'HDR10', audio: 'atmos', addedDaysAgo: 60, folder: 'D:\\Movies' },
  329865: { color: '#3c4a52', imdb: 7.9, rt: 94, mc: 81, res: '1080p', hdr: 'SDR', audio: '5.1', addedDaysAgo: 75, watched: true, folder: 'D:\\Movies' },
  94605: { color: '#2a3a6a', imdb: 9.0, rt: 100, mc: 89, res: '2160p', hdr: 'HDR10', audio: '5.1', addedDaysAgo: 20, progress: [1, 5, 0.3], favorite: true, folder: 'E:\\TV' },
  569094: { color: '#6a2a5a', imdb: 8.5, rt: 95, mc: 86, res: '2160p', hdr: 'HDR10', audio: 'atmos', addedDaysAgo: 30, folder: 'D:\\Movies' },
  361743: { color: '#8a6a3a', imdb: 8.2, rt: 96, mc: 78, res: '2160p', hdr: 'DV', audio: 'atmos', addedDaysAgo: 50, watched: true, folder: 'D:\\Movies' },
  313369: { color: '#3a2a6a', imdb: 8.0, rt: 91, mc: 94, res: '1080p', hdr: 'SDR', audio: '7.1', addedDaysAgo: 90, inList: true, folder: 'D:\\Movies' },
  155: { color: '#1e2a3a', imdb: 9.0, rt: 94, mc: 84, res: '2160p', hdr: 'HDR10', audio: '5.1', addedDaysAgo: 120, watched: true, folder: 'D:\\Movies' },
  27205: { color: '#2a3a4a', imdb: 8.8, rt: 87, mc: 74, res: '2160p', hdr: 'HDR10', audio: '5.1', addedDaysAgo: 110, inList: true, folder: 'D:\\Movies' }
}

const RES: Record<Res, [number, number]> = { '2160p': [3840, 2160], '1080p': [1920, 1080], '720p': [1280, 720] }

function audioTracks(kind: Extras['audio']): AudioTrack[] {
  const main: AudioTrack =
    kind === 'atmos'
      ? { index: 1, codec: 'truehd', language: 'eng', title: 'English · Dolby TrueHD Atmos 7.1', channels: 8, atmos: true, default: true }
      : kind === '7.1'
        ? { index: 1, codec: 'dts', language: 'eng', title: 'English · DTS-HD MA 7.1', channels: 8, atmos: false, default: true }
        : kind === '5.1'
          ? { index: 1, codec: 'eac3', language: 'eng', title: 'English · Dolby Digital Plus 5.1', channels: 6, atmos: false, default: true }
          : { index: 1, codec: 'aac', language: 'eng', title: 'English · AAC Stereo', channels: 2, atmos: false, default: true }
  return [
    main,
    { index: 2, codec: 'ac3', language: 'eng', title: 'English · Commentary', channels: 2, atmos: false },
    { index: 3, codec: 'eac3', language: 'spa', title: 'Español · Dolby Digital Plus 5.1', channels: 6, atmos: false }
  ]
}

const SUBS: SubtitleTrack[] = [
  { index: 4, codec: 'subrip', language: 'eng', title: 'English', forced: false, external: false },
  { index: 5, codec: 'subrip', language: 'eng', title: 'English · SDH', forced: false, external: false },
  { index: 6, codec: 'subrip', language: 'spa', title: 'Español', forced: false, external: true },
  { index: 7, codec: 'subrip', language: 'fra', title: 'Français', forced: false, external: true }
]

function fileFor(path: string, x: Extras, minutes: number): FileInfo {
  const [width, height] = RES[x.res]
  const duration = minutes * 60
  const bitrate = x.res === '2160p' ? 58_000_000 : x.res === '1080p' ? 14_000_000 : 6_000_000
  return {
    path,
    container: 'mkv',
    size: Math.round((bitrate / 8) * duration),
    duration,
    videoCodec: x.res === '2160p' ? 'hevc' : 'h264',
    width,
    height,
    hdr: x.hdr,
    bitrate,
    audio: audioTracks(x.audio),
    subtitles: SUBS
  }
}

function releaseTag(x: Extras): string {
  const hdr = x.hdr === 'DV' ? 'DV.HDR' : x.hdr === 'SDR' ? '' : x.hdr
  const audio = x.audio === 'atmos' ? 'TrueHD.Atmos.7.1' : x.audio === '7.1' ? 'DTS-HD.MA.7.1' : x.audio === '5.1' ? 'DDP5.1' : 'AAC2.0'
  return [x.res, x.res === '2160p' ? 'UHD.BluRay.REMUX' : 'BluRay', hdr, x.res === '2160p' ? 'HEVC' : 'x264', audio].filter(Boolean).join('.')
}

// TMDB's TV genres are compound ("Sci-Fi & Fantasy"); split them so movie and TV rows share one vocabulary.
const GENRE_SPLIT: Record<string, string[]> = {
  'Sci-Fi & Fantasy': ['Science Fiction', 'Fantasy'],
  'Action & Adventure': ['Action', 'Adventure'],
  'War & Politics': ['War']
}
const normalizeGenres = (g: string[]): string[] => [...new Set(g.flatMap((x) => GENRE_SPLIT[x] ?? [x]))]

const dotted = (s: string): string => s.replace(/[:']/g, '').replace(/\s+/g, '.')

function build(entry: FixtureEntry): MediaItem {
  const x = EXTRAS[entry.tmdbId]
  const id = `${entry.kind === "show" ? "tv" : "movie"}-${entry.tmdbId}`
  const base: MediaItem = {
    id,
    kind: entry.kind,
    tmdbId: entry.tmdbId,
    title: entry.title,
    year: entry.year,
    tagline: entry.tagline,
    overview: entry.overview,
    runtime: entry.runtime ?? x.episodeRuntime ?? 50,
    certification: entry.certification,
    genres: normalizeGenres(entry.genres),
    ratings: { tmdb: entry.tmdbScore, imdb: x.imdb, rottenTomatoes: x.rt, metacritic: x.mc },
    poster: entry.poster,
    backdrop: entry.backdrop,
    logo: entry.logo,
    color: x.color,
    trailerKey: entry.trailerKey,
    cast: entry.cast,
    credit: entry.director
      ? { role: 'Director', name: entry.director }
      : entry.creator
        ? { role: 'Creator', name: entry.creator }
        : null,
    preview: { url: SAMPLE_VIDEOS[0], start: 0.2 },
    addedAt: NOW - x.addedDaysAgo * DAY,
    favorite: !!x.favorite,
    inList: !!x.inList
  }

  if (entry.kind === 'movie') {
    const folder = `${x.folder}\\${entry.title.replace(/:/g, '')} (${entry.year})`
    const file = fileFor(`${folder}\\${dotted(entry.title)}.${entry.year}.${releaseTag(x)}.mkv`, x, base.runtime)
    base.file = file
    if (x.watched) base.progress = { position: file.duration, duration: file.duration, watched: true, lastPlayed: NOW - 20 * DAY }
    else if (typeof x.progress === 'number')
      base.progress = { position: Math.round(file.duration * x.progress), duration: file.duration, watched: false, lastPlayed: NOW - x.addedDaysAgo * 3_600_000 }
    return base
  }

  const typical = x.episodeRuntime ?? 50
  const [ps, pe, pf] = Array.isArray(x.progress) ? x.progress : [0, 0, 0]
  base.seasons = (entry.seasons ?? []).map((s): Season => ({
    number: s.number,
    name: `Season ${s.number}`,
    episodes: s.episodes.map((e): Episode => {
      const runtime = e.runtime ?? typical
      const code = `S${String(s.number).padStart(2, '0')}E${String(e.number).padStart(2, '0')}`
      const file = fileFor(`${x.folder}\\${entry.title}\\Season ${s.number}\\${dotted(entry.title)}.${code}.${releaseTag(x)}.mkv`, x, runtime)
      const before = s.number < ps || (s.number === ps && e.number < pe)
      const current = s.number === ps && e.number === pe
      const progress = before
        ? { position: file.duration, duration: file.duration, watched: true, lastPlayed: NOW - 4 * DAY }
        : current && pf > 0
          ? { position: Math.round(file.duration * pf), duration: file.duration, watched: false, lastPlayed: NOW - 36 * 3_600_000 }
          : undefined
      return {
        id: `${id}-s${s.number}e${e.number}`,
        showId: id,
        season: s.number,
        number: e.number,
        title: e.title,
        overview: e.overview,
        still: e.still,
        runtime,
        file,
        progress
      }
    })
  }))
  return base
}

export const ITEMS: MediaItem[] = (fixture as FixtureEntry[]).map(build)

export const COLLECTIONS: Collection[] = [
  {
    id: 'nolan',
    name: 'Christopher Nolan',
    description: 'Time, memory and very large IMAX cameras.',
    itemIds: ['movie-872585', 'movie-157336', 'movie-27205', 'movie-155']
  },
  {
    id: 'villeneuve',
    name: 'Denis Villeneuve',
    description: 'Monumental science fiction, quiet and immense.',
    itemIds: ['movie-693134', 'movie-335984', 'movie-329865']
  },
  {
    id: 'after-dark',
    name: 'After Dark',
    description: 'Neon, rain and long shadows.',
    itemIds: ['movie-414906', 'movie-335984', 'tv-95396', 'movie-155']
  },
  {
    id: 'sound-and-fury',
    name: 'Sound and Fury',
    description: 'Turn it up. Atmos everything.',
    itemIds: ['movie-76341', 'movie-361743', 'movie-693134', 'movie-569094']
  }
]

export const FOLDERS: LibraryFolder[] = [
  { path: 'D:\\Movies', items: ITEMS.filter((i) => i.kind === 'movie').length, size: 0, lastScan: NOW - 2 * 3_600_000 },
  { path: 'E:\\TV', items: ITEMS.filter((i) => i.kind === 'show').length, size: 0, lastScan: NOW - 2 * 3_600_000 }
]
for (const f of FOLDERS) {
  f.size = ITEMS.filter((i) => (i.file?.path ?? i.seasons?.[0]?.episodes[0]?.file.path ?? '').startsWith(f.path)).reduce(
    (sum, i) => sum + (i.file?.size ?? i.seasons?.flatMap((s) => s.episodes).reduce((a, e) => a + e.file.size, 0) ?? 0),
    0
  )
}


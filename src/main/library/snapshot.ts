import type { AudioTrack, Episode, FileInfo, HdrFormat, MediaItem, Progress, Season, SubtitleTrack } from '../../shared/types.ts'
import type { Db } from '../db/index.ts'

// The library as the screens see it, built from the database. Films and shows found on disk, with every
// file's real details and watch state. Until metadata arrives (Phase 3) titles come from file names and
// artwork is a frame from the video itself.

export const fileUrl = (path: string): string => `ml-file://local/${encodeURIComponent(path)}`

const LANGS = new Intl.DisplayNames(['en'], { type: 'language' })
function languageName(code: string | null): string {
  if (!code) return 'Unknown'
  try {
    return LANGS.of(code) ?? code
  } catch {
    return code
  }
}

const CODEC: Record<string, string> = {
  truehd: 'Dolby TrueHD', eac3: 'Dolby Digital Plus', ac3: 'Dolby Digital', dts: 'DTS', aac: 'AAC', flac: 'FLAC', opus: 'Opus',
  mp3: 'MP3', vorbis: 'Vorbis', pcm_s16le: 'PCM', pcm_s24le: 'PCM'
}
const layoutName = (channels: number | null, layout: string | null): string =>
  layout?.startsWith('7.1') ? '7.1' : layout?.startsWith('5.1') ? '5.1' : channels === 2 || layout === 'stereo' ? 'Stereo' : channels === 1 ? 'Mono' : layout ?? ''

/** A steady colour per title, so a film without artwork still has its own glow. */
export function hashColor(s: string): string {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h}, 32%, 26%)`
}

interface FileRow {
  id: number
  path: string
  size: number
  duration: number | null
  container: string | null
  video_codec: string | null
  width: number | null
  height: number | null
  hdr: string | null
  bitrate: number | null
  added_at: number
  item_id: number | null
  frame: string | null
  position: number | null
  pduration: number | null
  watched: number | null
  play_count: number | null
  last_played_at: number | null
}

function fileInfo(f: FileRow, streams: Map<number, Record<string, unknown>[]>): FileInfo {
  const own = streams.get(f.id) ?? []
  const audio: AudioTrack[] = own
    .filter((s) => s.type === 'audio')
    .map((s) => {
      const atmos = !!s.is_atmos
      const label = [CODEC[String(s.codec)] ?? String(s.codec ?? '').toUpperCase(), atmos ? 'Atmos' : '', layoutName(s.channels as number, s.layout as string)]
        .filter(Boolean)
        .join(' ')
      return {
        index: Number(s.idx),
        codec: String(s.codec ?? ''),
        language: String(s.language ?? 'und'),
        title: [languageName(s.language as string | null), s.title ? String(s.title) : label].join(' · '),
        channels: Number(s.channels ?? 2),
        atmos,
        default: !!s.is_default
      }
    })
  const subtitles: SubtitleTrack[] = own
    .filter((s) => s.type === 'subtitle')
    .map((s) => ({
      index: Number(s.idx),
      codec: String(s.codec ?? ''),
      language: String(s.language ?? 'und'),
      title: [languageName(s.language as string | null), s.title ? String(s.title) : '', s.is_forced ? 'Forced' : ''].filter(Boolean).join(' · '),
      forced: !!s.is_forced,
      external: false
    }))
  return {
    id: String(f.id),
    path: f.path,
    container: f.container ?? '',
    size: Number(f.size),
    duration: Number(f.duration ?? 0),
    videoCodec: f.video_codec ?? '',
    width: Number(f.width ?? 0),
    height: Number(f.height ?? 0),
    hdr: (f.hdr ?? 'SDR') as HdrFormat,
    bitrate: Number(f.bitrate ?? 0),
    audio,
    subtitles
  }
}

function progressOf(f: FileRow): Progress | undefined {
  if (f.position == null && !f.watched) return undefined
  return {
    position: Number(f.position ?? 0),
    duration: Number(f.pduration ?? f.duration ?? 0),
    watched: !!f.watched,
    lastPlayed: f.last_played_at ? Number(f.last_played_at) : undefined
  }
}

/** The copy to play when there are several: the sharpest picture, then the biggest file. */
const better = (a: FileRow, b: FileRow): FileRow =>
  Number(b.height ?? 0) > Number(a.height ?? 0) || (b.height === a.height && Number(b.size) > Number(a.size)) ? b : a

const frameUrl = (f: FileRow | undefined): string | null => (f?.frame ? fileUrl(f.frame) : null)

export function buildSnapshot(db: Db): MediaItem[] {
  const files = db
    .prepare(
      `SELECT f.id, f.path, f.size, f.duration, f.container, f.video_codec, f.width, f.height, f.hdr, f.bitrate, f.added_at, f.item_id,
              g.local_path AS frame, p.position, p.duration AS pduration, p.watched, p.play_count, p.last_played_at
       FROM files f
       LEFT JOIN generated g ON g.file_id = f.id AND g.type = 'frame'
       LEFT JOIN playback p ON p.file_id = f.id
       WHERE f.missing = 0 AND f.hidden = 0 AND f.video_codec IS NOT NULL AND f.item_id IS NOT NULL`
    )
    .all() as unknown as FileRow[]
  const byId = new Map(files.map((f) => [Number(f.id), f]))

  const streams = new Map<number, Record<string, unknown>[]>()
  for (const s of db.prepare('SELECT * FROM streams ORDER BY file_id, idx').all()) {
    const id = Number(s.file_id)
    if (!byId.has(id)) continue
    streams.set(id, [...(streams.get(id) ?? []), s])
  }
  const listId = (db.prepare("SELECT id FROM collections WHERE is_system = 1 AND name = 'My List'").get() as { id: number } | undefined)?.id
  const inList = new Set(
    listId ? db.prepare('SELECT item_id FROM collection_items WHERE collection_id = ?').all(listId).map((r) => Number(r.item_id)) : []
  )

  const items: MediaItem[] = []
  const base = (r: Record<string, unknown>, kind: 'movie' | 'show'): MediaItem => ({
    id: `${kind === 'movie' ? 'm' : 's'}-${r.id}`,
    kind,
    tmdbId: Number(r.tmdb_id ?? 0),
    title: String(r.title),
    year: Number(r.year ?? 0),
    tagline: String(r.tagline ?? ''),
    overview: String(r.overview ?? ''),
    runtime: Number(r.runtime ?? 0),
    certification: String(r.certification ?? ''),
    genres: [],
    ratings: {},
    poster: null,
    backdrop: null,
    thumb: null,
    logo: null,
    color: hashColor(String(r.title)),
    trailerKey: null,
    cast: [],
    credit: null,
    preview: null,
    addedAt: Number(r.added_at),
    favorite: !!r.favorite,
    inList: inList.has(Number(r.id)),
    playCount: 0
  })

  // Films: one item, its best copy.
  const movieFiles = new Map<number, FileRow>()
  for (const f of files) {
    const id = Number(f.item_id)
    movieFiles.set(id, movieFiles.has(id) ? better(movieFiles.get(id)!, f) : f)
  }
  for (const r of db.prepare("SELECT * FROM items WHERE kind = 'movie'").all()) {
    const f = movieFiles.get(Number(r.id))
    if (!f) continue
    const item = base(r, 'movie')
    item.file = fileInfo(f, streams)
    item.runtime ||= Math.round(Number(f.duration ?? 0) / 60)
    item.progress = progressOf(f)
    item.playCount = Number(f.play_count ?? 0)
    item.backdrop = frameUrl(f)
    // Newest copy decides when the film "arrived".
    item.addedAt = Math.max(item.addedAt, ...files.filter((x) => Number(x.item_id) === Number(r.id)).map((x) => Number(x.added_at)))
    items.push(item)
  }

  // Shows: seasons and episodes that have a file.
  const epFiles = new Map<number, FileRow>()
  for (const r of db.prepare('SELECT file_id, episode_id FROM file_episodes').all()) {
    const f = byId.get(Number(r.file_id))
    if (!f) continue
    const id = Number(r.episode_id)
    epFiles.set(id, epFiles.has(id) ? better(epFiles.get(id)!, f) : f)
  }
  const seasonRows = db.prepare('SELECT id, show_id, number, name FROM seasons ORDER BY show_id, number').all()
  const episodeRows = db.prepare('SELECT * FROM episodes ORDER BY show_id, season_number, number').all()
  for (const r of db.prepare("SELECT * FROM items WHERE kind = 'show'").all()) {
    const showId = Number(r.id)
    const item = base(r, 'show')
    const seasons: Season[] = []
    for (const s of seasonRows.filter((x) => Number(x.show_id) === showId)) {
      const episodes: Episode[] = []
      for (const e of episodeRows.filter((x) => Number(x.show_id) === showId && Number(x.season_number) === Number(s.number))) {
        const f = epFiles.get(Number(e.id))
        if (!f) continue
        episodes.push({
          id: `e-${e.id}`,
          showId: item.id,
          season: Number(s.number),
          number: Number(e.number),
          title: e.title ? String(e.title) : `Episode ${e.number}`,
          overview: String(e.overview ?? ''),
          still: frameUrl(f),
          runtime: Math.round(Number(f.duration ?? 0) / 60),
          file: fileInfo(f, streams),
          progress: progressOf(f)
        })
        item.playCount += Number(f.play_count ?? 0)
        item.addedAt = Math.max(item.addedAt, Number(f.added_at))
      }
      if (episodes.length) seasons.push({ number: Number(s.number), name: String(s.name ?? `Season ${s.number}`), poster: null, episodes })
    }
    if (!seasons.length) continue
    // Specials go last, after the real seasons.
    seasons.sort((a, b) => (a.number === 0 ? 1 : b.number === 0 ? -1 : a.number - b.number))
    item.seasons = seasons
    const first = seasons[0].episodes[0]
    item.backdrop = first.still
    item.runtime ||= first.runtime
    items.push(item)
  }
  return items
}

// ---------- Changes from the interface ----------

const fileIdOf = (id: string | undefined): number | null => (id && /^\d+$/.test(id) ? Number(id) : null)
export const itemIdOf = (id: string): number | null => {
  const m = /^[ms]-(\d+)$/.exec(id)
  return m ? Number(m[1]) : null
}

/** Where the viewer got to. 92% through counts as watched; finishing again counts another play. */
export function saveProgress(db: Db, fileId: string, position: number, duration: number, now = Date.now()): void {
  const id = fileIdOf(fileId)
  if (id == null || !(duration > 0)) return
  const watched = position / duration > 0.92
  const before = db.prepare('SELECT watched FROM playback WHERE file_id = ?').get(id) as { watched: number } | undefined
  const finishedNow = watched && !before?.watched
  db.prepare(
    `INSERT INTO playback (file_id, position, duration, watched, play_count, last_played_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET position = excluded.position, duration = excluded.duration, watched = excluded.watched,
       play_count = playback.play_count + ?, last_played_at = excluded.last_played_at`
  ).run(id, watched ? duration : position, duration, +watched, +finishedNow, now, +finishedNow)
}

export function setWatched(db: Db, fileIds: string[], watched: boolean, now = Date.now()): void {
  for (const raw of fileIds) {
    const id = fileIdOf(raw)
    if (id == null) continue
    if (!watched) {
      db.prepare('DELETE FROM playback WHERE file_id = ?').run(id)
      continue
    }
    const d = Number((db.prepare('SELECT duration FROM files WHERE id = ?').get(id) as { duration: number } | undefined)?.duration ?? 0)
    db.prepare(
      `INSERT INTO playback (file_id, position, duration, watched, play_count, last_played_at) VALUES (?, ?, ?, 1, 1, ?)
       ON CONFLICT(file_id) DO UPDATE SET position = excluded.position, watched = 1, last_played_at = excluded.last_played_at`
    ).run(id, d, d, now)
  }
}

export function setFavorite(db: Db, itemId: string, favorite: boolean): void {
  const id = itemIdOf(itemId)
  if (id != null) db.prepare('UPDATE items SET favorite = ? WHERE id = ?').run(+favorite, id)
}

export function setInList(db: Db, itemId: string, inList: boolean): void {
  const id = itemIdOf(itemId)
  const list = (db.prepare("SELECT id FROM collections WHERE is_system = 1 AND name = 'My List'").get() as { id: number } | undefined)?.id
  if (id == null || list == null) return
  if (inList) db.prepare('INSERT OR IGNORE INTO collection_items (collection_id, item_id, ord) VALUES (?, ?, ?)').run(list, id, Date.now())
  else db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND item_id = ?').run(list, id)
}

/** "Remove from library": the file stays on disk and is skipped from now on. */
export function hideFiles(db: Db, fileIds: string[]): void {
  for (const raw of fileIds) {
    const id = fileIdOf(raw)
    if (id != null) db.prepare('UPDATE files SET hidden = 1 WHERE id = ?').run(id)
  }
}

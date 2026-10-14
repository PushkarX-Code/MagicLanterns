import type { Db } from '../db/index.ts'
import { parseVideo, titleKey, type Parsed } from './parse.ts'

// Turns scanned files into the library's films and shows. Every file gets its parsed name; films become one
// item per title (several copies of a film share it), episodes are filed under their show, season and number.
// Items start as "pending": the metadata lookup (Phase 3) fills in artwork and details later.

export interface IdentifyResult {
  movies: number
  episodes: number
  extras: number
  unknown: number
}

function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Same title and the years agree (or one side doesn't know its year). */
function findItem(db: Db, kind: 'movie' | 'show', key: string, year: number | null): number | null {
  const rows = db.prepare('SELECT id, year FROM items WHERE kind = ? AND match_key = ? ORDER BY id').all(kind, key)
  const hit = rows.find((r) => year == null || r.year == null || Number(r.year) === year) ?? null
  if (hit && year != null && hit.year == null) db.prepare('UPDATE items SET year = ? WHERE id = ?').run(year, hit.id)
  return hit ? Number(hit.id) : null
}

function createItem(db: Db, kind: 'movie' | 'show', p: Parsed, now: number): number {
  return Number(
    db
      .prepare('INSERT INTO items (kind, title, sort_title, year, match_key, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(kind, p.title, p.title.replace(/^(the|a|an)\s+/i, ''), p.year, titleKey(p.title), now, now).lastInsertRowid
  )
}

function fileEpisode(db: Db, showId: number, fileId: number, season: number, number: number): void {
  db.prepare('INSERT INTO seasons (show_id, number, name) VALUES (?, ?, ?) ON CONFLICT(show_id, number) DO NOTHING').run(
    showId,
    season,
    season === 0 ? 'Specials' : `Season ${season}`
  )
  const seasonId = Number((db.prepare('SELECT id FROM seasons WHERE show_id = ? AND number = ?').get(showId, season) as { id: number }).id)
  db.prepare(
    'INSERT INTO episodes (show_id, season_id, season_number, number) VALUES (?, ?, ?, ?) ON CONFLICT(show_id, season_number, number) DO NOTHING'
  ).run(showId, seasonId, season, number)
  const episodeId = Number(
    (db.prepare('SELECT id FROM episodes WHERE show_id = ? AND season_number = ? AND number = ?').get(showId, season, number) as { id: number }).id
  )
  db.prepare('INSERT OR IGNORE INTO file_episodes (file_id, episode_id) VALUES (?, ?)').run(fileId, episodeId)
}

/** Files in this folder that haven't been identified yet (new, or found again after a rename). */
export function identifyFolder(db: Db, folder: { id: number; path: string }, now = Date.now()): IdentifyResult {
  const result: IdentifyResult = { movies: 0, episodes: 0, extras: 0, unknown: 0 }
  const files = db.prepare('SELECT id, path FROM files WHERE folder_id = ? AND missing = 0 AND parsed_title IS NULL').all(folder.id)
  inTransaction(db, () => {
    const setParsed = db.prepare(
      'UPDATE files SET parsed_title = ?, parsed_year = ?, parsed_season = ?, parsed_episode = ?, kind = ?, item_id = ? WHERE id = ?'
    )
    for (const f of files) {
      const id = Number(f.id)
      const p = parseVideo(String(f.path), folder.path)
      if (p.extra || p.kind === 'unknown') {
        setParsed.run(p.title, p.year, null, null, 'unknown', null, id)
        if (p.extra) result.extras++
        else result.unknown++
        continue
      }
      if (p.kind === 'movie') {
        const itemId = findItem(db, 'movie', titleKey(p.title), p.year) ?? createItem(db, 'movie', p, now)
        setParsed.run(p.title, p.year, null, null, 'movie', itemId, id)
        result.movies++
      } else {
        const showId = findItem(db, 'show', titleKey(p.title), p.year) ?? createItem(db, 'show', p, now)
        for (const n of p.episodes) fileEpisode(db, showId, id, p.season ?? 1, n)
        setParsed.run(p.title, p.year, p.season, p.episodes[0] ?? null, 'episode', showId, id)
        result.episodes++
      }
    }
  })
  return result
}

/** A file that turned out not to be playable video (damaged, or audio only) is not a film or an episode. */
export function dropUnplayable(db: Db, folderId: number): void {
  inTransaction(db, () => {
    const bad = "SELECT id FROM files WHERE folder_id = ? AND probed_at IS NOT NULL AND video_codec IS NULL"
    db.prepare(`DELETE FROM file_episodes WHERE file_id IN (${bad})`).run(folderId)
    db.prepare(`UPDATE files SET kind = 'unknown', item_id = NULL WHERE id IN (${bad})`).run(folderId)
  })
}

/**
 * Removes films, shows, seasons and episodes that no longer have any file at all (their folder was removed).
 * Files that are only missing (an unplugged drive) still count, so nothing disappears while a drive is away.
 */
export function pruneOrphans(db: Db): void {
  inTransaction(db, () => {
    db.exec(`
      DELETE FROM episodes WHERE id NOT IN (SELECT episode_id FROM file_episodes);
      DELETE FROM seasons WHERE id NOT IN (SELECT season_id FROM episodes WHERE season_id IS NOT NULL);
      DELETE FROM items WHERE kind = 'show' AND id NOT IN (SELECT show_id FROM episodes);
      DELETE FROM items WHERE kind = 'movie' AND id NOT IN (SELECT item_id FROM files WHERE item_id IS NOT NULL);
    `)
  })
}

export interface LibraryCounts {
  movies: number
  shows: number
  episodes: number
}

export function libraryCounts(db: Db): LibraryCounts {
  const n = (sql: string): number => Number((db.prepare(sql).get() as { n: number }).n)
  return {
    movies: n("SELECT COUNT(*) AS n FROM items WHERE kind = 'movie'"),
    shows: n("SELECT COUNT(*) AS n FROM items WHERE kind = 'show'"),
    episodes: n('SELECT COUNT(*) AS n FROM episodes')
  }
}

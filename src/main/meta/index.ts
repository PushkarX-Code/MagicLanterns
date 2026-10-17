import type { Db } from '../db/index.ts'
import { applyMatch } from './apply.ts'
import type { MatchCandidate } from '../../shared/types.ts'
import { findMatch, type Candidate, type Tmdb } from './match.ts'
import { basename, dirname } from 'node:path'
import { titleAndYear, titleKey } from '../library/parse.ts'

// Looks up every film and show that hasn't been looked up yet. A few at a time, well inside TMDB's limits.

export interface MatchResult {
  matched: number
  unmatched: number
  failed: number
}

// Folders that say where a film is kept, not what it is.
const GENERIC = /^(movies?|films?|videos?|downloads?|media|library|new folder|complete|torrents?|[a-z]|my videos|desktop|documents)$/
// Container titles that name the release group or a site, not the film.
const RELEASE_TAG = /www\.|\.(com|org|net|to|mx)\b|\b(yts|yify|rarbg|encoded|ripped|torrent)\b/i

/**
 * Every name a film goes by, best first: the title from its file name, then its folder, then the title stored
 * inside the file. Shows already take their name from their folders, so they search under that alone.
 */
export function namesFor(db: Db, id: number, kind: 'movie' | 'show', title: string): string[] {
  if (kind !== 'movie') return [title]
  const names = [title]
  const roots = new Set(db.prepare('SELECT path FROM folders').all().map((r) => String(r.path)))
  for (const f of db.prepare('SELECT path, embedded_title FROM files WHERE item_id = ?').all(id)) {
    const dir = dirname(String(f.path))
    const folder = roots.has(dir) ? '' : titleAndYear(basename(dir)).title
    if (folder && !GENERIC.test(titleKey(folder))) names.push(folder)
    const inside = f.embedded_title ? String(f.embedded_title) : ''
    if (inside && !RELEASE_TAG.test(inside)) names.push(titleAndYear(inside).title)
  }
  return names.filter((n, i) => titleKey(n).length > 1 && names.findIndex((m) => titleKey(m) === titleKey(n)) === i)
}

export async function matchPending(db: Db, tmdb: Tmdb, onItem: () => void = () => {}, { concurrency = 3, now = Date.now } = {}): Promise<MatchResult> {
  const result: MatchResult = { matched: 0, unmatched: 0, failed: 0 }
  const pending = db
    .prepare("SELECT id, kind, title, year FROM items WHERE match_state = 'pending' ORDER BY added_at DESC")
    .all()
    .map((r) => ({ id: Number(r.id), kind: r.kind as 'movie' | 'show', title: String(r.title), year: r.year == null ? null : Number(r.year) }))
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < pending.length) {
      const it = pending[next++]
      // Merged away by an earlier match in this run.
      if (!db.prepare('SELECT 1 FROM items WHERE id = ?').get(it.id)) continue
      try {
        const match = await findMatch(tmdb, it.kind, namesFor(db, it.id, it.kind, it.title), it.year)
        if (match) {
          await applyMatch(db, tmdb, it.id, it.kind, match, now())
          result.matched++
        } else {
          db.prepare("UPDATE items SET match_state = 'unmatched', meta_fetched_at = ? WHERE id = ?").run(now(), it.id)
          result.unmatched++
        }
        onItem()
      } catch {
        // Offline or rate limited: stays pending, tried again on the next scan.
        result.failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
  return result
}

/** Fix Match: what TMDB has under a title, best known first. */
export async function searchCandidates(tmdb: Tmdb, kind: 'movie' | 'show', query: string, year: number | null): Promise<MatchCandidate[]> {
  const path = kind === 'movie' ? '/search/movie' : '/search/tv'
  const y = year ? `&${kind === 'movie' ? 'year' : 'first_air_date_year'}=${year}` : ''
  const { results } = await tmdb<{ results: Candidate[] }>(`${path}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US${y}`)
  return (results ?? []).slice(0, 12).map((c) => {
    const date = c.release_date || c.first_air_date
    return { id: c.id, title: c.title ?? c.name ?? '', year: date ? Number(date.slice(0, 4)) : null, overview: c.overview ?? '', poster: c.poster_path ?? null }
  })
}

/** Fix Match: the viewer's choice wins and is never second-guessed by later lookups. */
export async function fixMatch(db: Db, tmdb: Tmdb, itemId: number, tmdbId: number): Promise<number | null> {
  const row = db.prepare('SELECT kind FROM items WHERE id = ?').get(itemId) as { kind: 'movie' | 'show' } | undefined
  if (!row) return null
  return applyMatch(db, tmdb, itemId, row.kind, { id: tmdbId, score: 1, state: 'manual' })
}

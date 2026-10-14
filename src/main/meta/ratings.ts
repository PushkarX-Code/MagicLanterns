import type { Db } from '../db/index.ts'

// Critics' and audiences' scores, by IMDb id: IMDb, Rotten Tomatoes and Metacritic. Refreshed monthly,
// which keeps a big library well inside the free daily allowance.

export type Omdb = <T>(imdbId: string) => Promise<T | null>

interface OmdbTitle {
  Response?: string
  imdbRating?: string
  Ratings?: { Source: string; Value: string }[]
}

const MONTH = 30 * 86_400_000

export function parseRatings(t: OmdbTitle): { imdb: number | null; rt: number | null; mc: number | null } {
  const num = (v: string | undefined): number | null => {
    const n = parseFloat(v ?? '')
    return Number.isFinite(n) ? n : null
  }
  const from = (source: string): string | undefined => t.Ratings?.find((r) => r.Source === source)?.Value
  return {
    imdb: num(t.imdbRating),
    rt: num(from('Rotten Tomatoes')?.replace('%', '')),
    mc: num(from('Metacritic')?.split('/')[0])
  }
}

export async function refreshRatings(db: Db, omdb: Omdb, now = Date.now()): Promise<number> {
  const due = db
    .prepare('SELECT id, imdb_id FROM items WHERE imdb_id IS NOT NULL AND (ratings_fetched_at IS NULL OR ratings_fetched_at < ?)')
    .all(now - MONTH)
  let updated = 0
  for (const r of due) {
    const t = await omdb<OmdbTitle>(String(r.imdb_id)).catch(() => null)
    // No ratings key in this build, or offline: nothing to do now.
    if (!t) break
    if (t.Response === 'False') {
      db.prepare('UPDATE items SET ratings_fetched_at = ? WHERE id = ?').run(now, r.id)
      continue
    }
    const x = parseRatings(t)
    db.prepare('UPDATE items SET rating_imdb = ?, rating_rt = ?, rating_mc = ?, ratings_fetched_at = ? WHERE id = ?').run(x.imdb, x.rt, x.mc, now, r.id)
    updated++
  }
  return updated
}

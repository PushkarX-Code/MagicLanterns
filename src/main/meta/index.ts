import type { Db } from '../db/index.ts'
import { applyMatch } from './apply.ts'
import type { MatchCandidate } from '../../shared/types.ts'
import { findMatch, type Candidate, type Tmdb } from './match.ts'

// Looks up every film and show that hasn't been looked up yet. A few at a time, well inside TMDB's limits.

export interface MatchResult {
  matched: number
  unmatched: number
  failed: number
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
        const match = await findMatch(tmdb, it.kind, it.title, it.year)
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

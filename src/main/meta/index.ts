import type { Db } from '../db/index.ts'
import { applyMatch } from './apply.ts'
import { findMatch, type Tmdb } from './match.ts'

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

import { titleKey } from '../library/parse.ts'

// Finds the TMDB entry for a title parsed from a file name. Scores every search result on how close the
// title is (either the English or the original title), whether the year agrees, and how well known it is,
// so "Dune Part Two 2024" lands on Dune: Part Two and not on Dune (1984).

export type Tmdb = <T>(path: string) => Promise<T>

export interface Candidate {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  popularity?: number
  vote_count?: number
  overview?: string
  poster_path?: string | null
}

export interface Match {
  id: number
  score: number
  state: 'matched' | 'low_confidence' | 'manual'
}

/** Edit distance between two strings, as a similarity from 0 to 1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

const yearOf = (c: Candidate): number | null => {
  const d = c.release_date || c.first_air_date
  return d ? Number(d.slice(0, 4)) || null : null
}

export function scoreCandidate(c: Candidate, title: string, year: number | null): number {
  const want = titleKey(title)
  const names = [c.title, c.name, c.original_title, c.original_name].filter(Boolean).map((t) => titleKey(t!))
  // "Spiderman" and "Spider-Man" are the same title: also compare with the spaces taken out.
  const tight = (t: string): string => t.replace(/ /g, '')
  let s = Math.max(0, ...names.map((n) => Math.max(similarity(want, n), similarity(tight(want), tight(n)))))
  // "Dune Part Two" vs "Dune: Part Two – Special Edition": a title that starts the same still counts.
  if (names.some((n) => n.startsWith(want + ' ') || want.startsWith(n + ' '))) s = Math.max(s, 0.8)
  const y = yearOf(c)
  if (year && y) s += y === year ? 0.3 : Math.abs(y - year) === 1 ? 0.15 : -0.35
  // A tiny nudge for well-known titles breaks ties between remakes of the same name.
  s += Math.min(0.1, Math.log10(1 + (c.vote_count ?? 0)) / 40)
  // The real release has a poster; fan films and stubs under the same name usually don't.
  if (!c.poster_path) s -= 0.2
  return s
}

const MATCHED = 0.95
const LOW = 0.6

/** The best result for any of the names the file goes by (file name, folder, the title stored inside it). */
export function pickBest(results: Candidate[], titles: string | string[], year: number | null): Match | null {
  const names = typeof titles === 'string' ? [titles] : titles
  let best: Match | null = null
  for (const c of results) {
    const score = Math.max(...names.map((t) => scoreCandidate(c, t, year)))
    if (!best || score > best.score) best = { id: c.id, score, state: score >= MATCHED ? 'matched' : 'low_confidence' }
  }
  return best && best.score >= LOW ? best : null
}

/**
 * Searches under each name the file goes by, in order, until one gives a confident match that has a poster.
 * Every result seen so far competes, so a weak first name can still be rescued by the folder or embedded title.
 */
export async function findMatch(tmdb: Tmdb, kind: 'movie' | 'show', titles: string | string[], year: number | null): Promise<Match | null> {
  const path = kind === 'movie' ? '/search/movie' : '/search/tv'
  const yearParam = kind === 'movie' ? 'year' : 'first_air_date_year'
  const given = typeof titles === 'string' ? [titles] : titles
  const names = given.filter((t, i) => titleKey(t) && given.findIndex((u) => titleKey(u) === titleKey(t)) === i)
  const search = async (name: string, withYear: boolean): Promise<Candidate[]> =>
    (await tmdb<{ results: Candidate[] }>(`${path}?query=${encodeURIComponent(name)}&include_adult=false&language=en-US${withYear && year ? `&${yearParam}=${year}` : ''}`))
      .results ?? []
  const seen = new Map<number, Candidate>()
  for (const name of names) {
    // With the year first (precise); without it if that finds nothing (files often carry a wrong year).
    let results = year ? await search(name, true) : []
    if (!results.length) results = await search(name, false)
    for (const c of results.slice(0, 10)) if (!seen.has(c.id)) seen.set(c.id, c)
    const best = pickBest([...seen.values()], names, year)
    if (best?.state === 'matched' && seen.get(best.id)?.poster_path) return best
  }
  return pickBest([...seen.values()], names, year)
}

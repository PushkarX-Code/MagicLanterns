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
  let s = Math.max(0, ...names.map((n) => similarity(want, n)))
  // "Dune Part Two" vs "Dune: Part Two – Special Edition": a title that starts the same still counts.
  if (names.some((n) => n.startsWith(want + ' ') || want.startsWith(n + ' '))) s = Math.max(s, 0.8)
  const y = yearOf(c)
  if (year && y) s += y === year ? 0.3 : Math.abs(y - year) === 1 ? 0.15 : -0.35
  // A tiny nudge for well-known titles breaks ties between remakes of the same name.
  s += Math.min(0.1, Math.log10(1 + (c.vote_count ?? 0)) / 40)
  return s
}

const MATCHED = 0.95
const LOW = 0.6

export function pickBest(results: Candidate[], title: string, year: number | null): Match | null {
  let best: Match | null = null
  for (const c of results) {
    const score = scoreCandidate(c, title, year)
    if (!best || score > best.score) best = { id: c.id, score, state: score >= MATCHED ? 'matched' : 'low_confidence' }
  }
  return best && best.score >= LOW ? best : null
}

export async function findMatch(tmdb: Tmdb, kind: 'movie' | 'show', title: string, year: number | null): Promise<Match | null> {
  const path = kind === 'movie' ? '/search/movie' : '/search/tv'
  const yearParam = kind === 'movie' ? 'year' : 'first_air_date_year'
  const q = `query=${encodeURIComponent(title)}&include_adult=false&language=en-US`
  const search = async (withYear: boolean): Promise<Candidate[]> =>
    (await tmdb<{ results: Candidate[] }>(`${path}?${q}${withYear && year ? `&${yearParam}=${year}` : ''}`)).results ?? []
  // With the year first (precise); without it if that finds nothing (files often carry a wrong year).
  let results = year ? await search(true) : []
  if (!results.length) results = await search(false)
  return pickBest(results.slice(0, 10), title, year)
}

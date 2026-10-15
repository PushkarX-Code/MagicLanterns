import type { PersonCredit, PersonDetails } from '@shared/types'
import type { Db } from '../db/index.ts'
import type { Tmdb } from './match.ts'

// A cast member's page: TMDB's person record and combined credits, kept for a week.

export const PERSON_TTL = 7 * 24 * 60 * 60 * 1000

interface RawCredit {
  id: number
  media_type: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  character?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  episode_count?: number
  genre_ids?: number[]
}
export interface RawPerson {
  id: number
  name: string
  profile_path: string | null
  known_for_department?: string
  biography?: string
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  combined_credits?: { cast?: RawCredit[] }
}

const TALK = [10763, 10764, 10767] // news, reality, talk: appearances, not roles

const date = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Roles worth showing: real films and series, each once, newest first. */
export function mapPerson(p: RawPerson): PersonDetails {
  const seen = new Set<string>()
  const credits: (PersonCredit & { weight: number })[] = []
  for (const c of p.combined_credits?.cast ?? []) {
    if (c.media_type !== 'movie' && c.media_type !== 'tv') continue
    if (c.genre_ids?.some((g) => TALK.includes(g))) continue
    if (/\b(himself|herself|themselves|self)\b/i.test(c.character ?? '')) continue
    const key = `${c.media_type}-${c.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const when = c.release_date || c.first_air_date
    credits.push({
      id: c.id,
      kind: c.media_type,
      title: c.title ?? c.name ?? '',
      year: when ? Number(when.slice(0, 4)) : null,
      character: (c.character ?? '').trim(),
      overview: c.overview ?? '',
      poster: c.poster_path ?? null,
      backdrop: c.backdrop_path ?? null,
      rating: c.vote_average ? Math.round(c.vote_average * 10) / 10 : null,
      weight: (c.vote_count ?? 0) + (c.popularity ?? 0) * 10
    })
  }
  // Barely-seen entries (no artwork, a handful of votes) are noise on a page like this.
  const shown = credits.filter((c) => c.poster && c.weight >= 20)
  shown.sort((a, b) => (b.year ?? 9999) - (a.year ?? 9999) || b.weight - a.weight)
  const born = date(p.birthday)
  return {
    id: p.id,
    name: p.name,
    profile: p.profile_path,
    knownFor: p.known_for_department === 'Acting' ? 'Actor' : (p.known_for_department ?? ''),
    biography: (p.biography ?? '').trim(),
    born: born ? [born, p.place_of_birth].filter(Boolean).join(', ') : null,
    died: date(p.deathday),
    credits: shown.map(({ weight: _, ...c }) => c)
  }
}

/** The person's page data, from the cache when it is under a week old. */
export async function personDetails(db: Db, tmdb: Tmdb, id: number, now = Date.now()): Promise<PersonDetails> {
  const hit = db.prepare('SELECT json, fetched_at FROM person_cache WHERE tmdb_id = ?').get(id) as { json: string; fetched_at: number } | undefined
  if (hit && now - Number(hit.fetched_at) < PERSON_TTL) return JSON.parse(hit.json) as PersonDetails
  try {
    const details = mapPerson(await tmdb<RawPerson>(`/person/${id}?language=en-US&append_to_response=combined_credits`))
    db.prepare('INSERT INTO person_cache (tmdb_id, json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(tmdb_id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at').run(
      id,
      JSON.stringify(details),
      now
    )
    return details
  } catch (e) {
    if (hit) return JSON.parse(hit.json) as PersonDetails // offline: a stale page beats none
    throw e
  }
}

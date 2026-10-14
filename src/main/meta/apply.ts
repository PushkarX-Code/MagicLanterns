import type { Db } from '../db/index.ts'
import type { Match, Tmdb } from './match.ts'

// Fetches a matched title's full details from TMDB and writes them into the library: titles, overview,
// certification, runtime, rating, trailer, genres, cast and crew, and the artwork each screen uses:
//   poster   2:3 key art               backdrop  textless wide still (banners)
//   thumb    wide art with the title    logo      the title treatment shown over banners
// For shows, every season and episode that has a file gets its own name, overview, poster and still.

interface Img {
  file_path: string
  iso_639_1: string | null
  vote_average?: number
  width?: number
}
interface Images {
  posters?: Img[]
  backdrops?: Img[]
  logos?: Img[]
}
interface Person {
  id: number
  name: string
  profile_path: string | null
  character?: string
  roles?: { character: string }[]
  job?: string
  order?: number
}
interface Details {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  original_language?: string
  release_date?: string
  first_air_date?: string
  tagline?: string
  overview?: string
  runtime?: number
  episode_run_time?: number[]
  status?: string
  vote_average?: number
  poster_path?: string | null
  backdrop_path?: string | null
  imdb_id?: string
  genres?: { id: number; name: string }[]
  images?: Images
  videos?: { results: { key: string; site: string; type: string; official?: boolean }[] }
  credits?: { cast: Person[]; crew: Person[] }
  aggregate_credits?: { cast: Person[] }
  created_by?: Person[]
  external_ids?: { imdb_id?: string | null }
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[] }
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] }
}
interface SeasonDetails {
  name?: string
  overview?: string
  poster_path?: string | null
  air_date?: string | null
  episodes?: { episode_number: number; name?: string; overview?: string; still_path?: string | null; runtime?: number | null; air_date?: string | null; vote_average?: number }[]
}

const byVotes = (a: Img, b: Img): number => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.width ?? 0) - (a.width ?? 0)
const best = (list: Img[] | undefined, test: (i: Img) => boolean): string | null => [...(list ?? [])].filter(test).sort(byVotes)[0]?.file_path ?? null
const textless = (i: Img): boolean => !i.iso_639_1 || i.iso_639_1 === 'xx'

export function pickArtwork(d: Details): { poster: string | null; backdrop: string | null; thumb: string | null; logo: string | null } {
  const im = d.images ?? {}
  return {
    poster: best(im.posters, (i) => i.iso_639_1 === 'en') ?? d.poster_path ?? best(im.posters, () => true),
    backdrop: best(im.backdrops, textless) ?? d.backdrop_path ?? best(im.backdrops, () => true),
    thumb: best(im.backdrops, (i) => i.iso_639_1 === 'en'),
    // A PNG logo reads best over a picture; an English one if there is one.
    logo: best(im.logos, (i) => i.iso_639_1 === 'en' && i.file_path.endsWith('.png')) ?? best(im.logos, (i) => i.iso_639_1 === 'en') ?? null
  }
}

// TMDB's TV genres are compound; split them so films and shows share one set of genre rows.
const SPLIT: Record<string, string[]> = {
  'Sci-Fi & Fantasy': ['Science Fiction', 'Fantasy'],
  'Action & Adventure': ['Action', 'Adventure'],
  'War & Politics': ['War', 'Politics']
}
export function genresOf(d: Details): string[] {
  const out = (d.genres ?? []).flatMap((g) => SPLIT[g.name] ?? [g.name])
  // Japanese animation gets its own row.
  if (d.original_language === 'ja' && (d.genres ?? []).some((g) => g.id === 16)) out.unshift('Anime')
  return [...new Set(out)]
}

export function certificationOf(d: Details, region = 'US'): string | null {
  const rel = d.release_dates?.results.find((r) => r.iso_3166_1 === region)?.release_dates
  if (rel) return (rel.find((x) => x.type === 3 && x.certification) ?? rel.find((x) => x.certification))?.certification ?? null
  return d.content_ratings?.results.find((r) => r.iso_3166_1 === region)?.rating || null
}

const trailerOf = (d: Details): string | null => {
  const yt = (d.videos?.results ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer')
  return (yt.find((v) => v.official) ?? yt[0])?.key ?? null
}

function imageId(db: Db, path: string | null | undefined): number | null {
  if (!path) return null
  db.prepare('INSERT INTO images (source_url) VALUES (?) ON CONFLICT(source_url) DO NOTHING').run(path)
  return Number((db.prepare('SELECT id FROM images WHERE source_url = ?').get(path) as { id: number }).id)
}

function personId(db: Db, p: Person): number {
  db.prepare('INSERT INTO people (tmdb_id, name, profile_img) VALUES (?, ?, ?) ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name, profile_img = excluded.profile_img').run(
    p.id,
    p.name,
    imageId(db, p.profile_path)
  )
  return Number((db.prepare('SELECT id FROM people WHERE tmdb_id = ?').get(p.id) as { id: number }).id)
}

function tx(db: Db, fn: () => void): void {
  db.exec('BEGIN')
  try {
    fn()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * Two parsed titles can turn out to be the same film or show ("Dune Part Two" and "Dune: Part Two"):
 * fold this item into the one already matched, keeping every file, season and episode.
 */
function mergeInto(db: Db, from: number, into: number): void {
  db.prepare('UPDATE files SET item_id = ? WHERE item_id = ?').run(into, from)
  for (const e of db.prepare('SELECT id, season_number, number FROM episodes WHERE show_id = ?').all(from)) {
    const season = Number(e.season_number)
    db.prepare('INSERT INTO seasons (show_id, number, name) VALUES (?, ?, ?) ON CONFLICT(show_id, number) DO NOTHING').run(into, season, season ? `Season ${season}` : 'Specials')
    const sid = Number((db.prepare('SELECT id FROM seasons WHERE show_id = ? AND number = ?').get(into, season) as { id: number }).id)
    db.prepare('INSERT INTO episodes (show_id, season_id, season_number, number) VALUES (?, ?, ?, ?) ON CONFLICT(show_id, season_number, number) DO NOTHING').run(into, sid, season, e.number)
    const target = Number((db.prepare('SELECT id FROM episodes WHERE show_id = ? AND season_number = ? AND number = ?').get(into, season, e.number) as { id: number }).id)
    db.prepare('UPDATE OR IGNORE file_episodes SET episode_id = ? WHERE episode_id = ?').run(target, e.id)
  }
  db.prepare('UPDATE OR IGNORE collection_items SET item_id = ? WHERE item_id = ?').run(into, from)
  db.prepare('UPDATE items SET favorite = MAX(favorite, (SELECT favorite FROM items WHERE id = ?)) WHERE id = ?').run(from, into)
  db.prepare('DELETE FROM items WHERE id = ?').run(from)
}

/** Fetches and stores everything about a matched item. Returns the id it ended up under (after a merge). */
export async function applyMatch(db: Db, tmdb: Tmdb, itemId: number, kind: 'movie' | 'show', match: Match, now = Date.now()): Promise<number> {
  const d =
    kind === 'movie'
      ? await tmdb<Details>(`/movie/${match.id}?language=en-US&append_to_response=images,credits,release_dates,videos&include_image_language=en,null`)
      : await tmdb<Details>(`/tv/${match.id}?language=en-US&append_to_response=images,aggregate_credits,content_ratings,videos,external_ids&include_image_language=en,null`)

  // Season details for the seasons that have files, fetched before writing so the write is one transaction.
  const seasons: { number: number; data: SeasonDetails | null }[] = []
  if (kind === 'show')
    for (const s of db.prepare('SELECT number FROM seasons WHERE show_id = ? ORDER BY number').all(itemId)) {
      const n = Number(s.number)
      seasons.push({ number: n, data: await tmdb<SeasonDetails>(`/tv/${match.id}/season/${n}?language=en-US`).catch(() => null) })
    }

  let id = itemId
  tx(db, () => {
    const already = db.prepare('SELECT id FROM items WHERE kind = ? AND tmdb_id = ? AND id != ?').get(kind, d.id, itemId) as { id: number } | undefined
    if (already) {
      mergeInto(db, itemId, Number(already.id))
      id = Number(already.id)
    }
    const art = pickArtwork(d)
    const title = d.title ?? d.name ?? ''
    const date = d.release_date || d.first_air_date || ''
    db.prepare(
      `UPDATE items SET tmdb_id = ?, imdb_id = ?, title = ?, original_title = ?, sort_title = ?, year = ?, tagline = ?, overview = ?,
         runtime = ?, certification = ?, status = ?, rating_tmdb = ?, trailer_key = ?,
         poster_img = ?, backdrop_img = ?, thumb_img = ?, logo_img = ?,
         match_state = ?, match_score = ?, meta_fetched_at = ?, updated_at = ? WHERE id = ?`
    ).run(
      d.id,
      d.imdb_id ?? d.external_ids?.imdb_id ?? null,
      title,
      d.original_title ?? d.original_name ?? null,
      title.replace(/^(the|a|an)\s+/i, ''),
      date ? Number(date.slice(0, 4)) : null,
      d.tagline ?? '',
      d.overview ?? '',
      d.runtime ?? d.episode_run_time?.[0] ?? null,
      certificationOf(d),
      d.status ?? null,
      d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
      trailerOf(d),
      imageId(db, art.poster),
      imageId(db, art.backdrop),
      imageId(db, art.thumb),
      imageId(db, art.logo),
      match.state,
      Math.round(match.score * 1000) / 1000,
      now,
      now,
      id
    )

    db.prepare('DELETE FROM item_genres WHERE item_id = ?').run(id)
    for (const g of genresOf(d)) {
      db.prepare('INSERT INTO genres (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(g)
      const gid = Number((db.prepare('SELECT id FROM genres WHERE name = ?').get(g) as { id: number }).id)
      db.prepare('INSERT OR IGNORE INTO item_genres (item_id, genre_id) VALUES (?, ?)').run(id, gid)
    }

    db.prepare('DELETE FROM credits WHERE item_id = ?').run(id)
    const cast = (d.credits?.cast ?? d.aggregate_credits?.cast ?? []).slice(0, 12)
    cast.forEach((p, ord) =>
      db.prepare("INSERT INTO credits (item_id, person_id, kind, character, ord) VALUES (?, ?, 'cast', ?, ?)").run(id, personId(db, p), p.character ?? p.roles?.[0]?.character ?? '', ord)
    )
    const director = d.credits?.crew.find((c) => c.job === 'Director')
    if (director) db.prepare("INSERT INTO credits (item_id, person_id, kind, job, ord) VALUES (?, ?, 'crew', 'Director', 0)").run(id, personId(db, director))
    const creator = d.created_by?.[0]
    if (creator) db.prepare("INSERT INTO credits (item_id, person_id, kind, job, ord) VALUES (?, ?, 'crew', 'Creator', 0)").run(id, personId(db, creator))

    for (const s of seasons) {
      if (!s.data) continue
      db.prepare('UPDATE seasons SET name = ?, overview = ?, poster_img = ?, air_date = ? WHERE show_id = ? AND number = ?').run(
        s.data.name || (s.number ? `Season ${s.number}` : 'Specials'),
        s.data.overview ?? '',
        imageId(db, s.data.poster_path),
        s.data.air_date ?? null,
        id,
        s.number
      )
      for (const e of s.data.episodes ?? [])
        db.prepare('UPDATE episodes SET title = ?, overview = ?, still_img = ?, runtime = ?, air_date = ?, rating = ? WHERE show_id = ? AND season_number = ? AND number = ?').run(
          e.name ?? null,
          e.overview ?? '',
          imageId(db, e.still_path),
          e.runtime ?? null,
          e.air_date ?? null,
          e.vote_average ?? null,
          id,
          s.number,
          e.episode_number
        )
    }
  })
  return id
}

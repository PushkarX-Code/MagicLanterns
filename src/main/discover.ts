import { app, ipcMain } from 'electron'
import type { DiscoverDetails, DiscoverList, TrendingTitle } from '@shared/types'
import { hasMetadata, tmdb } from './keys'

// Discover rows: Top 10 This Week, Top 10 This Month and Greatest of All Time, refreshed automatically
// from TMDB, with where each title streams in the viewer's country. Cached for six hours.

const TTL = 6 * 60 * 60 * 1000
const cache = new Map<DiscoverList, { at: number; region: string; items: TrendingTitle[] }>()

interface RawTitle {
  id: number
  media_type: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
}
interface RawProviders {
  results: Record<string, { link?: string; flatrate?: Raw[]; free?: Raw[]; ads?: Raw[]; rent?: Raw[]; buy?: Raw[] }>
}
interface Raw {
  provider_name: string
  logo_path: string | null
}

async function providersFor(kind: 'movie' | 'tv', id: number, region: string): Promise<Pick<TrendingTitle, 'providers' | 'watchLink'>> {
  try {
    const p = (await tmdb<RawProviders>(`/${kind}/${id}/watch/providers`)).results[region]
    if (!p) return { providers: [], watchLink: `https://www.themoviedb.org/${kind}/${id}/watch` }
    const seen = new Set<string>()
    const providers: TrendingTitle['providers'] = []
    // Streaming first, then free, then rent/buy.
    for (const x of [...(p.flatrate ?? []), ...(p.free ?? []), ...(p.ads ?? []), ...(p.rent ?? []), ...(p.buy ?? [])]) {
      if (seen.has(x.provider_name) || seen.size >= 5) continue
      seen.add(x.provider_name)
      providers.push({ name: x.provider_name, logo: x.logo_path })
    }
    return { providers, watchLink: p.link ?? `https://www.themoviedb.org/${kind}/${id}/watch` }
  } catch {
    return { providers: [], watchLink: `https://www.themoviedb.org/${kind}/${id}/watch` }
  }
}

const isoDaysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

/** The ten raw titles behind each list. */
async function rawList(list: DiscoverList): Promise<(RawTitle & { media_type: 'movie' | 'tv' })[]> {
  if (list === 'week') {
    const { results } = await tmdb<{ results: RawTitle[] }>('/trending/all/week?language=en-US')
    return results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10) as never
  }
  if (list === 'month') {
    // The most popular films and series that premiered in the last 30 days.
    const since = isoDaysAgo(30)
    const [films, shows] = await Promise.all([
      tmdb<{ results: (RawTitle & { popularity: number })[] }>(`/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${since}&with_release_type=2|3|4|5&language=en-US`),
      tmdb<{ results: (RawTitle & { popularity: number })[] }>(`/discover/tv?sort_by=popularity.desc&first_air_date.gte=${since}&language=en-US`)
    ])
    return [...films.results.map((r) => ({ ...r, media_type: 'movie' as const })), ...shows.results.map((r) => ({ ...r, media_type: 'tv' as const }))]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 10)
  }
  if (list === 'series' || list === 'anime') {
    // Must-watch: the best-rated series with enough votes to trust. Anime is Japanese animation; series excludes animation.
    const q =
      list === 'anime'
        ? '/discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=800&language=en-US'
        : '/discover/tv?without_genres=16,10764,10767&sort_by=vote_average.desc&vote_count.gte=3000&language=en-US'
    const { results } = await tmdb<{ results: RawTitle[] }>(q)
    return results.slice(0, 10).map((r) => ({ ...r, media_type: 'tv' as const }))
  }
  // Greatest of all time: the highest-rated films with a large number of votes.
  const { results } = await tmdb<{ results: RawTitle[] }>('/discover/movie?sort_by=vote_average.desc&vote_count.gte=12000&language=en-US')
  return results.slice(0, 10).map((r) => ({ ...r, media_type: 'movie' as const }))
}

async function discover(list: DiscoverList): Promise<TrendingTitle[]> {
  if (!hasMetadata()) return []
  const region = (app.getLocaleCountryCode() || 'US').toUpperCase()
  const hit = cache.get(list)
  if (hit && hit.region === region && Date.now() - hit.at < TTL) return hit.items
  const top = await rawList(list)
  const items = await Promise.all(
    top.map(async (r, i): Promise<TrendingTitle> => {
      const date = r.release_date || r.first_air_date
      return {
        rank: i + 1,
        id: r.id,
        kind: r.media_type,
        title: r.title ?? r.name ?? '',
        year: date ? Number(date.slice(0, 4)) : null,
        overview: r.overview,
        poster: r.poster_path,
        backdrop: r.backdrop_path,
        rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
        ...(await providersFor(r.media_type, r.id, region))
      }
    })
  )
  cache.set(list, { at: Date.now(), region, items })
  return items
}

interface RawDetails {
  tagline?: string
  runtime?: number
  episode_run_time?: number[]
  genres?: { name: string }[]
  created_by?: { name: string }[]
  images?: { logos?: { file_path: string; iso_639_1: string | null }[] }
  credits?: { cast?: { id: number; name: string; character: string; profile_path: string | null }[]; crew?: { name: string; job: string }[] }
  videos?: { results?: { key: string; site: string; type: string }[] }
}

async function details(kind: 'movie' | 'tv', id: number): Promise<DiscoverDetails | null> {
  if (!hasMetadata()) return null
  const d = await tmdb<RawDetails>(`/${kind}/${id}?language=en-US&append_to_response=images,credits,videos&include_image_language=en,null`)
  const logo = d.images?.logos?.find((l) => l.iso_639_1 === 'en') ?? d.images?.logos?.[0]
  const director = d.credits?.crew?.find((c) => c.job === 'Director')
  const creator = d.created_by?.[0]
  const trailer = d.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
  return {
    logo: logo?.file_path ?? null,
    tagline: d.tagline ?? '',
    runtime: d.runtime ?? d.episode_run_time?.[0] ?? null,
    genres: (d.genres ?? []).map((g) => g.name),
    credit: director ? { role: 'Director', name: director.name } : creator ? { role: 'Created by', name: creator.name } : null,
    cast: (d.credits?.cast ?? []).slice(0, 12).map((c) => ({ id: c.id, name: c.name, character: c.character, profile: c.profile_path })),
    trailerKey: trailer?.key ?? null,
    ...(await providersFor(kind, id, (app.getLocaleCountryCode() || 'US').toUpperCase()))
  }
}

export function initDiscover(): void {
  ipcMain.handle('discover:list', (_e, list: DiscoverList) => discover(list).catch(() => cache.get(list)?.items ?? []))
  ipcMain.handle('discover:details', (_e, kind: 'movie' | 'tv', id: number) => details(kind, id).catch(() => null))
}

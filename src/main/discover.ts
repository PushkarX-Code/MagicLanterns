import { app, ipcMain } from 'electron'
import type { TrendingTitle } from '@shared/types'
import { TMDB_API_KEY } from './keys'

// "Top 10 This Week": the most-watched films and series worldwide, refreshed automatically from TMDB,
// with where each one streams in the viewer's country. Cached for six hours.

const API = 'https://api.themoviedb.org/3'
const TTL = 6 * 60 * 60 * 1000
let cache: { at: number; region: string; items: TrendingTitle[] } | null = null

async function tmdb<T>(path: string): Promise<T> {
  // Accept either a v3 API key or a v4 read-access token.
  const bearer = TMDB_API_KEY.length > 40
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}${bearer ? '' : `api_key=${TMDB_API_KEY}`}`
  const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${TMDB_API_KEY}` } : {} })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return (await res.json()) as T
}

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

async function trending(): Promise<TrendingTitle[]> {
  if (!TMDB_API_KEY) return []
  const region = (app.getLocaleCountryCode() || 'US').toUpperCase()
  if (cache && cache.region === region && Date.now() - cache.at < TTL) return cache.items
  const { results } = await tmdb<{ results: RawTitle[] }>('/trending/all/week?language=en-US')
  const top = results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10)
  const items = await Promise.all(
    top.map(async (r, i): Promise<TrendingTitle> => {
      const kind = r.media_type as 'movie' | 'tv'
      let providers: TrendingTitle['providers'] = []
      let watchLink: string | null = null
      try {
        const p = (await tmdb<RawProviders>(`/${kind}/${r.id}/watch/providers`)).results[region]
        if (p) {
          watchLink = p.link ?? null
          const seen = new Set<string>()
          // Streaming first, then free, then rent/buy.
          for (const x of [...(p.flatrate ?? []), ...(p.free ?? []), ...(p.ads ?? []), ...(p.rent ?? []), ...(p.buy ?? [])]) {
            if (seen.has(x.provider_name) || seen.size >= 5) continue
            seen.add(x.provider_name)
            providers.push({ name: x.provider_name, logo: x.logo_path })
          }
        }
      } catch {
        providers = []
      }
      const date = r.release_date || r.first_air_date
      return {
        rank: i + 1,
        id: r.id,
        kind,
        title: r.title ?? r.name ?? '',
        year: date ? Number(date.slice(0, 4)) : null,
        overview: r.overview,
        poster: r.poster_path,
        backdrop: r.backdrop_path,
        rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
        providers,
        watchLink: watchLink ?? `https://www.themoviedb.org/${kind}/${r.id}/watch`
      }
    })
  )
  cache = { at: Date.now(), region, items }
  return items
}

export function initDiscover(): void {
  ipcMain.handle('discover:trending', () => trending().catch(() => cache?.items ?? []))
}

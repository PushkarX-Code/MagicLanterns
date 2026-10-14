// Metadata access, main process only (the interface never sees keys or URLs).
//
// Release builds talk to the metadata proxy (worker/), which holds the real keys on the server, so no key
// ships inside the app. Without a proxy URL (local builds) the keys from .env are built in, scrambled so
// they don't sit in the bundle as plain text.

declare const __META_PROXY__: string
declare const __META_KEYS__: { tmdb: number[]; omdb: number[]; pad: number[] }

const PROXY = __META_PROXY__.replace(/\/+$/, '')
const unscramble = (b: number[]): string => String.fromCharCode(...b.map((c, i) => c ^ __META_KEYS__.pad[i % __META_KEYS__.pad.length]))
const TMDB_KEY = unscramble(__META_KEYS__.tmdb)
const OMDB_KEY = unscramble(__META_KEYS__.omdb)

export const hasMetadata = (): boolean => PROXY.length > 0 || TMDB_KEY.length > 0

/** GET a TMDB v3 path such as "/trending/all/week?language=en-US". */
export async function tmdb<T>(path: string): Promise<T> {
  let res: Response
  if (PROXY) res = await fetch(`${PROXY}/tmdb${path}`)
  else {
    // Accept either a v3 API key or a v4 read-access token.
    const bearer = TMDB_KEY.length > 40
    const url = `https://api.themoviedb.org/3${path}${path.includes('?') ? '&' : '?'}${bearer ? '' : `api_key=${TMDB_KEY}`}`
    res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${TMDB_KEY}` } : {} })
  }
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return (await res.json()) as T
}

/** Ratings lookup by IMDb id (Phase 3). */
export async function omdb<T>(imdbId: string): Promise<T | null> {
  const q = `i=${encodeURIComponent(imdbId)}`
  const url = PROXY ? `${PROXY}/omdb?${q}` : OMDB_KEY ? `https://www.omdbapi.com/?${q}&apikey=${OMDB_KEY}` : ''
  if (!url) return null
  const res = await fetch(url)
  return res.ok ? ((await res.json()) as T) : null
}

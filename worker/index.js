// Magic Lanterns metadata proxy. The app calls this instead of the metadata services, and this adds the
// keys on the server, so no key ever ships inside the app or travels over the user's connection.
// Only the read-only lookups the app makes are allowed, and answers are cached at the edge for six hours.

const TMDB = 'https://api.themoviedb.org/3'
const TMDB_PATHS = [
  /^\/trending\/(all|movie|tv)\/(day|week)$/,
  /^\/discover\/(movie|tv)$/,
  /^\/search\/(movie|tv|multi)$/,
  /^\/genre\/(movie|tv)\/list$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/(watch\/providers|images|credits|aggregate_credits|videos|external_ids|release_dates|content_ratings|similar|recommendations)$/,
  /^\/tv\/\d+\/season\/\d+$/
]
const TTL = 6 * 60 * 60

const reply = (status, text) => new Response(text, { status, headers: { 'content-type': 'text/plain' } })

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return reply(405, 'Method not allowed')
    const url = new URL(request.url)

    let upstream
    let headers = {}
    if (url.pathname.startsWith('/tmdb/')) {
      const path = url.pathname.slice(5)
      if (!env.TMDB_API_KEY || !TMDB_PATHS.some((re) => re.test(path))) return reply(404, 'Not found')
      upstream = new URL(TMDB + path)
      url.searchParams.forEach((v, k) => k !== 'api_key' && upstream.searchParams.set(k, v))
      // Either a v3 API key or a v4 read-access token.
      if (env.TMDB_API_KEY.length > 40) headers = { Authorization: `Bearer ${env.TMDB_API_KEY}` }
      else upstream.searchParams.set('api_key', env.TMDB_API_KEY)
    } else if (url.pathname === '/omdb') {
      const id = url.searchParams.get('i') ?? ''
      if (!/^tt\d+$/.test(id) || !env.OMDB_API_KEY) return reply(404, 'Not found')
      upstream = new URL('https://www.omdbapi.com/')
      upstream.searchParams.set('i', id)
      upstream.searchParams.set('apikey', env.OMDB_API_KEY)
    } else {
      return reply(404, 'Not found')
    }

    const cache = caches.default
    const key = new Request(url.toString())
    const hit = await cache.match(key)
    if (hit) return hit

    const res = await fetch(upstream, { headers })
    const out = new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } })
    if (res.ok) {
      out.headers.set('cache-control', `public, max-age=${TTL}`)
      ctx.waitUntil(cache.put(key, out.clone()))
    }
    return out
  }
}

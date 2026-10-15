import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openDb } from '../db/index.ts'
import { buildSnapshot } from '../library/snapshot.ts'
import { certificationOf, genresOf, pickArtwork } from './apply.ts'
import { matchPending } from './index.ts'
import { pickBest, similarity, type Tmdb } from './match.ts'

// ---------- Scoring ----------

test('title similarity', () => {
  assert.equal(similarity('dune part two', 'dune part two'), 1)
  assert.ok(similarity('interstelar', 'interstellar') > 0.9)
  assert.ok(similarity('dune', 'arrival') < 0.3)
})

test('the year decides between a film and its remake or original', () => {
  const dunes = [
    { id: 841, title: 'Dune', release_date: '1984-12-14', vote_count: 3000 },
    { id: 438631, title: 'Dune', release_date: '2021-09-15', vote_count: 12000 }
  ]
  assert.equal(pickBest(dunes, 'Dune', 1984)!.id, 841)
  assert.equal(pickBest(dunes, 'Dune', 2021)!.id, 438631)
  // No year: the better-known one.
  assert.equal(pickBest(dunes, 'Dune', null)!.id, 438631)
})

test('punctuation, original titles, near misses and no match', () => {
  const r = [{ id: 693134, title: 'Dune: Part Two', release_date: '2024-02-27', vote_count: 5000 }]
  assert.deepEqual([pickBest(r, 'Dune Part Two', 2024)!.id, pickBest(r, 'Dune Part Two', 2024)!.state], [693134, 'matched'])
  const anime = [{ id: 1429, name: 'Attack on Titan', original_name: '進撃の巨人', first_air_date: '2013-04-07' }]
  assert.equal(pickBest(anime, 'Attack on Titan', null)!.id, 1429)
  // A wrong year with the right title is a weaker, flagged match.
  assert.equal(pickBest(r, 'Dune Part Two', 2019)!.state, 'low_confidence')
  assert.equal(pickBest([{ id: 1, title: 'Arrival', release_date: '2016-01-01' }], 'My Holiday Video', 2019), null)
})

// ---------- Details ----------

test('artwork: textless backdrop for banners, titled art for cards, English PNG logo', () => {
  const art = pickArtwork({
    id: 1,
    poster_path: '/p.jpg',
    backdrop_path: '/fallback.jpg',
    images: {
      posters: [{ file_path: '/fr.jpg', iso_639_1: 'fr', vote_average: 9 }, { file_path: '/en.jpg', iso_639_1: 'en', vote_average: 5 }],
      backdrops: [
        { file_path: '/titled.jpg', iso_639_1: 'en', vote_average: 6 },
        { file_path: '/clean-low.jpg', iso_639_1: null, vote_average: 4 },
        { file_path: '/clean-best.jpg', iso_639_1: null, vote_average: 8 }
      ],
      logos: [{ file_path: '/logo.svg', iso_639_1: 'en', vote_average: 9 }, { file_path: '/logo.png', iso_639_1: 'en', vote_average: 5 }]
    }
  })
  assert.deepEqual(art, { poster: '/en.jpg', backdrop: '/clean-best.jpg', thumb: '/titled.jpg', logo: '/logo.png' })
})

test('genres are split and Japanese animation is Anime; certification from the US release', () => {
  assert.deepEqual(genresOf({ id: 1, original_language: 'ja', genres: [{ id: 16, name: 'Animation' }, { id: 10759, name: 'Action & Adventure' }] }), [
    'Anime', 'Animation', 'Action', 'Adventure'
  ])
  assert.equal(
    certificationOf({ id: 1, release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: '', type: 1 }, { certification: 'PG-13', type: 3 }] }] } }),
    'PG-13'
  )
  assert.equal(certificationOf({ id: 1, content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] } }), 'TV-MA')
})

// ---------- The whole lookup against a fake TMDB ----------

const RESPONSES: Record<string, unknown> = {
  '/search/movie?query=Dune%20Part%20Two&include_adult=false&language=en-US&year=2024': {
    results: [{ id: 693134, title: 'Dune: Part Two', release_date: '2024-02-27', vote_count: 6000 }, { id: 438631, title: 'Dune', release_date: '2021-09-15' }]
  },
  '/search/movie?query=Dune%3A%20Part%20Two&include_adult=false&language=en-US': {
    results: [{ id: 693134, title: 'Dune: Part Two', release_date: '2024-02-27', vote_count: 6000 }]
  },
  '/search/movie?query=Holiday%202019&include_adult=false&language=en-US': { results: [] },
  '/movie/693134?language=en-US&append_to_response=images,credits,release_dates,videos&include_image_language=en,null': {
    id: 693134, title: 'Dune: Part Two', original_title: 'Dune: Part Two', release_date: '2024-02-27', tagline: 'Long live the fighters.',
    overview: 'Paul Atreides unites with Chani and the Fremen.', runtime: 167, vote_average: 8.15, imdb_id: 'tt15239678', original_language: 'en',
    genres: [{ id: 878, name: 'Science Fiction' }, { id: 12, name: 'Adventure' }],
    images: { posters: [{ file_path: '/poster.jpg', iso_639_1: 'en' }], backdrops: [{ file_path: '/banner.jpg', iso_639_1: null }, { file_path: '/thumb.jpg', iso_639_1: 'en' }], logos: [{ file_path: '/logo.png', iso_639_1: 'en' }] },
    credits: { cast: [{ id: 1190668, name: 'Timothée Chalamet', character: 'Paul Atreides', profile_path: '/tc.jpg' }, { id: 505710, name: 'Zendaya', character: 'Chani', profile_path: '/z.jpg' }], crew: [{ id: 137427, name: 'Denis Villeneuve', job: 'Director', profile_path: null }] },
    release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13', type: 3 }] }] },
    videos: { results: [{ key: 'Way9Dexny3w', site: 'YouTube', type: 'Trailer', official: true }] }
  },
  '/search/tv?query=Attack%20on%20Titan&include_adult=false&language=en-US': {
    results: [{ id: 1429, name: 'Attack on Titan', original_name: '進撃の巨人', first_air_date: '2013-04-07', vote_count: 7000 }]
  },
  '/tv/1429?language=en-US&append_to_response=images,aggregate_credits,content_ratings,videos,external_ids&include_image_language=en,null': {
    id: 1429, name: 'Attack on Titan', original_name: '進撃の巨人', first_air_date: '2013-04-07', overview: 'Humanity behind walls.', episode_run_time: [24],
    vote_average: 8.7, original_language: 'ja', genres: [{ id: 16, name: 'Animation' }, { id: 10759, name: 'Action & Adventure' }],
    images: { posters: [{ file_path: '/aot.jpg', iso_639_1: 'en' }], backdrops: [{ file_path: '/aot-bg.jpg', iso_639_1: null }], logos: [] },
    aggregate_credits: { cast: [{ id: 1, name: 'Yuki Kaji', roles: [{ character: 'Eren Yeager' }], profile_path: '/yk.jpg' }] },
    created_by: [{ id: 99, name: 'Hajime Isayama', profile_path: null }],
    content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] },
    external_ids: { imdb_id: 'tt2560140' }
  },
  '/tv/1429/season/1?language=en-US': {
    name: 'Season 1', overview: 'The walls fall.', poster_path: '/aot-s1.jpg', air_date: '2013-04-07',
    episodes: [{ episode_number: 1, name: 'To You, in 2000 Years', overview: 'The fall of Shiganshina.', still_path: '/ep1.jpg', runtime: 25 }]
  }
}

const fakeTmdb = (calls: string[], offline = false): Tmdb => async <T,>(path: string): Promise<T> => {
  calls.push(path)
  if (offline) throw new Error('offline')
  if (!(path in RESPONSES)) throw new Error(`Unexpected ${path}`)
  return RESPONSES[path] as T
}

function seeded() {
  const dir = mkdtempSync(join(tmpdir(), 'ml-meta-'))
  const db = openDb(join(dir, 'library.db'))
  db.prepare('INSERT INTO folders (path, added_at) VALUES (?, 0)').run('/lib')
  const item = (kind: string, title: string, year: number | null) =>
    Number(db.prepare('INSERT INTO items (kind, title, year, match_key, added_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)').run(kind, title, year, title.toLowerCase(), ).lastInsertRowid)
  const file = (itemId: number, path: string) =>
    Number(db.prepare("INSERT INTO files (folder_id, path, size, mtime, added_at, item_id, kind, video_codec, duration, probed_at) VALUES (1, ?, 10, 0, 0, ?, 'movie', 'h264', 6000, 1)").run(path, itemId).lastInsertRowid)
  const dune = item('movie', 'Dune Part Two', 2024)
  file(dune, '/lib/Dune.Part.Two.2024.2160p.mkv')
  const dune2 = item('movie', 'Dune: Part Two', null)
  file(dune2, '/lib/Dune Part Two/1080p.mkv')
  item('movie', 'Holiday 2019', null)
  const aot = item('show', 'Attack on Titan', null)
  db.prepare("INSERT INTO seasons (show_id, number, name) VALUES (?, 1, 'Season 1')").run(aot)
  db.prepare('INSERT INTO episodes (show_id, season_id, season_number, number) VALUES (?, 1, 1, 1)').run(aot)
  const ep = file(aot, '/lib/AoT/Attack.on.Titan.S01E01.mkv')
  db.exec(`INSERT INTO file_episodes (file_id, episode_id) VALUES (${ep}, 1)`)
  db.prepare('UPDATE items SET favorite = 1 WHERE id = ?').run(dune2)
  return { db, done: () => (db.close(), rmSync(dir, { recursive: true, force: true })) }
}

test('pending titles are matched, enriched, merged when they are the same film, and shown with their artwork', async () => {
  const { db, done } = seeded()
  const r = await matchPending(db, fakeTmdb([]), () => {}, { concurrency: 1 })
  assert.deepEqual(r, { matched: 3, unmatched: 1, failed: 0 })

  const items = buildSnapshot(db)
  const dune = items.filter((i) => i.kind === 'movie')
  assert.equal(dune.length, 1, 'both copies of Dune: Part Two became one film')
  const d = dune[0]
  assert.deepEqual([d.title, d.year, d.certification, d.runtime, d.ratings.tmdb, d.trailerKey], ['Dune: Part Two', 2024, 'PG-13', 167, 8.2, 'Way9Dexny3w'])
  assert.deepEqual([d.poster, d.backdrop, d.thumb, d.logo], ['/poster.jpg', '/banner.jpg', '/thumb.jpg', '/logo.png'])
  assert.deepEqual(d.genres, ['Adventure', 'Science Fiction'])
  assert.deepEqual(d.cast.map((c) => `${c.name} as ${c.character}`), ['Timothée Chalamet as Paul Atreides', 'Zendaya as Chani'])
  assert.deepEqual(d.credit, { role: 'Director', name: 'Denis Villeneuve' })
  assert.equal(d.favorite, true, "the merged copy's favourite survives")
  assert.equal(d.file!.path, '/lib/Dune.Part.Two.2024.2160p.mkv')

  const aot = items.find((i) => i.kind === 'show')!
  assert.deepEqual([aot.genres[0], aot.certification, aot.credit?.name, aot.cast[0].character], ['Anime', 'TV-MA', 'Hajime Isayama', 'Eren Yeager'])
  assert.equal(aot.seasons![0].poster, '/aot-s1.jpg')
  const ep = aot.seasons![0].episodes[0]
  assert.deepEqual([ep.title, ep.overview, ep.still, ep.runtime], ['To You, in 2000 Years', 'The fall of Shiganshina.', '/ep1.jpg', 25])

  const holiday = db.prepare("SELECT match_state FROM items WHERE title = 'Holiday 2019'").get() as { match_state: string }
  assert.equal(holiday.match_state, 'unmatched')

  // Nothing pending: nothing is looked up again.
  const calls: string[] = []
  await matchPending(db, fakeTmdb(calls))
  assert.equal(calls.length, 0)
  done()
})

test('offline: titles stay pending and are tried again later', async () => {
  const { db, done } = seeded()
  const r = await matchPending(db, fakeTmdb([], true))
  assert.equal(r.failed, 4)
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS n FROM items WHERE match_state = 'pending'").get() as { n: number }).n), 4)
  done()
})

// ---------- Step 13: saved artwork, glow colours, ratings, Fix Match ----------

import { readFileSync } from 'node:fs'
import { cacheImages, glowColor } from './images.ts'
import { parseRatings, refreshRatings } from './ratings.ts'
import { fixMatch, searchCandidates } from './index.ts'

test('glow colour: the picture\'s hue, deep enough to sit behind white text', () => {
  const px = (r: number, g: number, b: number, n = 100) => new Uint8Array(Array.from({ length: n }, () => [r, g, b, 255]).flat())
  const orange = glowColor(px(230, 120, 30))
  assert.match(orange, /^#[0-9a-f]{6}$/)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(orange.slice(i, i + 2), 16))
  assert.ok(r > g && g > b, `still orange: ${orange}`)
  assert.ok(r < 110, 'dark enough for an ambient glow')
  // Platform bitmaps come as BGRA.
  assert.equal(glowColor(px(30, 120, 230), 'bgra'), orange)
  // A black frame doesn't produce a colour.
  assert.match(glowColor(px(0, 0, 0)), /^#/)
})

test('every picture the library uses is saved once, at the size its job needs', async () => {
  const { db, done } = seeded()
  await matchPending(db, fakeTmdb([]), () => {}, { concurrency: 1 })
  const dir = mkdtempSync(join(tmpdir(), 'ml-img-'))
  const asked: string[] = []
  const r = await cacheImages(
    db,
    dir,
    async (url) => {
      asked.push(url)
      if (url.includes('/z.jpg')) throw new Error('404')
      return Buffer.from(url)
    },
    (input, o) => ({ data: input, ext: o.png ? 'png' : 'jpg', width: o.maxWidth, height: 1, color: o.color ? '#402010' : null }),
    { concurrency: 2 }
  )
  assert.ok(asked.includes('https://image.tmdb.org/t/p/original/banner.jpg'), 'banners at full quality')
  assert.ok(asked.includes('https://image.tmdb.org/t/p/w780/thumb.jpg'))
  assert.ok(asked.includes('https://image.tmdb.org/t/p/w500/logo.png'))
  assert.ok(asked.includes('https://image.tmdb.org/t/p/w185/tc.jpg'), 'faces small')
  assert.ok(asked.includes('https://image.tmdb.org/t/p/w780/ep1.jpg'))
  assert.equal(r.failed, 1)
  const items = buildSnapshot(db)
  const dune = items.find((i) => i.kind === 'movie')!
  assert.match(dune.backdrop!, /^ml-file:\/\/local\//)
  assert.ok(readFileSync(decodeURIComponent(dune.logo!.replace('ml-file://local/', ''))).length > 0)
  assert.equal(dune.color, '#402010', 'glow comes from the banner')
  assert.equal(dune.cast.find((c) => c.name === 'Zendaya')!.profile, '/z.jpg', 'a picture that failed stays online')
  // Second run: only the one that failed is tried again.
  asked.length = 0
  await cacheImages(db, dir, async (u) => (asked.push(u), Buffer.from(u)), (i) => ({ data: i, ext: 'jpg', width: 1, height: 1, color: null }))
  assert.deepEqual(asked, ['https://image.tmdb.org/t/p/w185/z.jpg'])
  rmSync(dir, { recursive: true, force: true })
  done()
})

test('ratings from IMDb, Rotten Tomatoes and Metacritic, refreshed monthly', async () => {
  assert.deepEqual(
    parseRatings({ imdbRating: '8.5', Ratings: [{ Source: 'Internet Movie Database', Value: '8.5/10' }, { Source: 'Rotten Tomatoes', Value: '92%' }, { Source: 'Metacritic', Value: '79/100' }] }),
    { imdb: 8.5, rt: 92, mc: 79 }
  )
  assert.deepEqual(parseRatings({ imdbRating: 'N/A' }), { imdb: null, rt: null, mc: null })
  const { db, done } = seeded()
  await matchPending(db, fakeTmdb([]), () => {}, { concurrency: 1 })
  const calls: string[] = []
  const omdb = async <T,>(id: string): Promise<T | null> => (calls.push(id), { imdbRating: '8.6', Ratings: [{ Source: 'Rotten Tomatoes', Value: '93%' }] } as T)
  assert.equal(await refreshRatings(db, omdb, 1e12), 2)
  assert.deepEqual(calls.sort(), ['tt15239678', 'tt2560140'])
  const dune = buildSnapshot(db).find((i) => i.kind === 'movie')!
  assert.deepEqual(dune.ratings, { tmdb: 8.2, imdb: 8.6, rottenTomatoes: 93 })
  // Within the month: no new requests. No key in the build: nothing happens.
  assert.equal(await refreshRatings(db, omdb, 1e12 + 1000), 0)
  assert.equal(calls.length, 2)
  assert.equal(await refreshRatings(db, async () => null, 1e13), 0)
  done()
})

test('Fix Match: search shows choices; picking one wins and is never redone automatically', async () => {
  const { db, done } = seeded()
  await matchPending(db, fakeTmdb([]), () => {}, { concurrency: 1 })
  const holiday = Number((db.prepare("SELECT id FROM items WHERE title = 'Holiday 2019'").get() as { id: number }).id)
  const found = await searchCandidates(fakeTmdb([]), 'movie', 'Dune: Part Two', null)
  assert.deepEqual(found.map((c) => [c.id, c.title, c.year]), [[693134, 'Dune: Part Two', 2024]])
  // The home video was really a copy of Dune: Part Two; it joins the existing film.
  const into = await fixMatch(db, fakeTmdb([]), holiday, 693134)
  const dune = Number((db.prepare("SELECT id FROM items WHERE tmdb_id = 693134").get() as { id: number }).id)
  assert.equal(into, dune)
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS n FROM items WHERE kind = 'movie'").get() as { n: number }).n), 1)
  assert.equal((db.prepare('SELECT match_state FROM items WHERE id = ?').get(dune) as { match_state: string }).match_state, 'manual')
  done()
})

// ---------- Cast pages ----------

test('a filmography keeps real roles, once each, newest first', async () => {
  const { mapPerson } = await import('./person.ts')
  const p = mapPerson({
    id: 1190668,
    name: 'Timothée Chalamet',
    profile_path: '/p.jpg',
    known_for_department: 'Acting',
    biography: ' An actor. ',
    birthday: '1995-12-27',
    place_of_birth: 'New York City, New York, USA',
    combined_credits: {
      cast: [
        { id: 438631, media_type: 'movie', title: 'Dune', release_date: '2021-09-15', character: 'Paul Atreides', poster_path: '/d.jpg', vote_count: 12000 },
        { id: 693134, media_type: 'movie', title: 'Dune: Part Two', release_date: '2024-02-27', character: 'Paul Atreides', poster_path: '/d2.jpg', vote_count: 6000 },
        { id: 693134, media_type: 'movie', title: 'Dune: Part Two', release_date: '2024-02-27', character: 'Paul', poster_path: '/d2.jpg', vote_count: 6000 },
        { id: 1, media_type: 'tv', name: 'A Talk Show', first_air_date: '2020-01-01', character: 'Himself', poster_path: '/t.jpg', vote_count: 900 },
        { id: 2, media_type: 'tv', name: 'Late Night', first_air_date: '2022-01-01', character: 'Guest', poster_path: '/l.jpg', vote_count: 900, genre_ids: [10767] },
        { id: 3, media_type: 'movie', title: 'Unseen Short', release_date: '2012-01-01', character: 'Boy', poster_path: null, vote_count: 2 }
      ]
    }
  })
  assert.deepEqual(p.credits.map((c) => c.title), ['Dune: Part Two', 'Dune'])
  assert.equal(p.knownFor, 'Actor')
  assert.equal(p.biography, 'An actor.')
  assert.equal(p.born, '27 Dec 1995, New York City, New York, USA')
})

test('person pages are cached for a week and survive going offline', async () => {
  const { personDetails, PERSON_TTL } = await import('./person.ts')
  const dir = mkdtempSync(join(tmpdir(), 'ml-person-'))
  const db = openDb(join(dir, 'library.db'))
  let calls = 0
  let online = true
  const tmdb = (async () => {
    calls++
    if (!online) throw new Error('offline')
    return { id: 7, name: 'Zendaya', profile_path: null, combined_credits: { cast: [] } }
  }) as Tmdb
  await personDetails(db, tmdb, 7, 0)
  await personDetails(db, tmdb, 7, PERSON_TTL - 1)
  assert.equal(calls, 1)
  online = false
  assert.equal((await personDetails(db, tmdb, 7, PERSON_TTL + 1)).name, 'Zendaya')
  assert.equal(calls, 2)
  db.close()
  rmSync(dir, { recursive: true })
})

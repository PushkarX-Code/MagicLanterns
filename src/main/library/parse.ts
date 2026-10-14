import { basename, dirname, extname } from 'node:path'

// Works out what a video file is from its name and the folders around it:
//   Dune.Part.Two.2024.2160p.UHD.BluRay.x265-GROUP.mkv      → movie "Dune Part Two" (2024)
//   Arrival (2016)/movie.mkv                                 → movie "Arrival" (2016), from the folder
//   Severance/Season 2/Severance.S02E03E04.1080p.mkv         → "Severance" S2 E3–4
//   Shogun (2024)/Season 1/03 - Tomorrow is Tomorrow.mkv     → "Shogun" S1 E3, from the folders
//   [SubsPlease] Jujutsu Kaisen - 05 (1080p) [A1B2C3].mkv    → "Jujutsu Kaisen" S1 E5
// Pure: no file system access, so it can be tested on names alone.

export interface Parsed {
  kind: 'movie' | 'episode' | 'unknown'
  title: string
  year: number | null
  season: number | null
  episodes: number[]
  /** Samples, trailers and bonus features: kept out of the library. */
  extra: boolean
}

// Words that only describe the release. Everything from the first of these on is not the title.
const JUNK =
  /^(2160p|1080[pi]|720p|576p|480p|4k|uhd|hdr10\+?|hdr|dv|dovi|sdr|hevc|x26[45]|h\.?26[45]|av1|avc|xvid|divx|10bit|8bit|bluray|blu-ray|bdrip|brrip|bdremux|remux|web-?dl|webrip|web|hdtv|dvdrip|dvd|hdrip|amzn|nf|dsnp|hmax|atvp|aac\d?|ac3|eac3|ddp?\d?|dts(-hd)?|truehd|atmos|flac|opus|mp3|5\.1|7\.1|2\.0|proper|repack|extended|unrated|remastered|imax|internal|limited|multi|dual|subbed|dubbed|complete)$/i

const EXTRA_WORDS = /(^|[\s._-])(sample|trailer|teaser|featurette|behind[\s._-]the[\s._-]scenes|deleted[\s._-]scenes?|interview|making[\s._-]of|extras?)([\s._-]|$)/i
const EXTRA_DIRS = /^(extras?|featurettes?|samples?|trailers?|behind the scenes|deleted scenes|interviews|bonus|specials? features?|shorts|other)$/i
const SEASON_DIR = /^(?:season|series|staffel|saison|temporada|s)[\s._-]*(\d{1,3})$/i
const SPECIALS_DIR = /^specials?$/i

const YEAR = /(?:^|[\s.(_\[-])((?:19|20)\d{2})(?=$|[\s.)_\]-])/g

/** Dots and underscores to spaces, bracketed release tags dropped, spaces tidied. */
function tidy(s: string): string {
  return s
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/(?<=[A-Za-z])\.(?=[A-Za-z]\.)|(?<=\b[A-Z])\.(?=\s|$)/g, '\u0000') // keep the dots in S.H.I.E.L.D.
    .replace(/[._]+/g, ' ')
    .replace(/\u0000/g, '.')
    .replace(/\s+-\s*$|^\s*-\s+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** The part of a release name before its tags; the year (last plausible one) pulled out separately. */
export function titleAndYear(raw: string): { title: string; year: number | null } {
  let s = raw.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
  // The year is the last 19xx/20xx that isn't the very start (so "2001: A Space Odyssey" and "1917" stay titles).
  let year: number | null = null
  let cut = -1
  for (const m of s.matchAll(YEAR)) {
    const at = m.index + m[0].indexOf(m[1])
    if (at === 0) continue
    year = Number(m[1])
    cut = at
  }
  if (cut > 0) s = s.slice(0, cut)
  const words = s.split(/[\s._]+/)
  const stop = words.findIndex((w) => JUNK.test(w.replace(/[()]/g, '')))
  const kept = (stop >= 0 ? words.slice(0, stop) : words).join(' ')
  return { title: tidy(kept.replace(/[(\s-]+$/, '')), year }
}

function episodeFromName(name: string): { at: number; season: number | null; episodes: number[] } | null {
  // S01E02, S01E02E03, S01E02-E03, s1e2
  let m = /(?:^|[\s._\-[(])s(\d{1,3})[\s._-]?e(\d{1,4})((?:[\s._-]?-?e\d{1,4})*)/i.exec(name)
  if (m) {
    const eps = [Number(m[2]), ...[...m[3].matchAll(/e(\d{1,4})/gi)].map((x) => Number(x[1]))]
    const first = eps[0], last = eps[eps.length - 1]
    // S01E01-E03 means 1, 2 and 3.
    const all = /-\s?e/i.test(m[3]) && last > first ? Array.from({ length: last - first + 1 }, (_, i) => first + i) : eps
    return { at: m.index, season: Number(m[1]), episodes: all }
  }
  // 1x02
  m = /(?:^|[\s._\-[(])(\d{1,2})x(\d{2,3})(?=$|[\s._\-\])])/i.exec(name)
  if (m) return { at: m.index, season: Number(m[1]), episodes: [Number(m[2])] }
  // "Episode 5", "Ep 05", "E05"
  m = /(?:^|[\s._\-[(])(?:episode|ep|e)[\s._]?(\d{1,4})(?=$|[\s._\-\])])/i.exec(name)
  if (m) return { at: m.index, season: null, episodes: [Number(m[1])] }
  // Anime style: "Title - 05", "Title - 1071 [1080p]"; not a year.
  m = /\s-\s(\d{1,4})(?:v\d)?(?=$|\s|[[(])/.exec(name)
  if (m && !/^(19|20)\d{2}$/.test(m[1])) return { at: m.index, season: null, episodes: [Number(m[1])] }
  return null
}

export function parseVideo(path: string, root = ''): Parsed {
  const name = basename(path, extname(path))
  const dirs = dirname(path)
    .slice(root ? root.replace(/[\\/]+$/, '').length : 0)
    .split(/[\\/]/)
    .filter(Boolean)
  const parent = dirs[dirs.length - 1] ?? ''
  const grand = dirs[dirs.length - 2] ?? ''
  const extra = EXTRA_WORDS.test(name) || dirs.some((d) => EXTRA_DIRS.test(d))

  const ep = episodeFromName(name)
  const seasonDir = SEASON_DIR.exec(parent)
  const specialsDir = SPECIALS_DIR.test(parent)
  // A bare number inside a season folder is an episode: "Season 1/03 - Title.mkv".
  const bare = !ep && (seasonDir || specialsDir) ? /^(\d{1,3})(?=$|[\s._-])/.exec(name) : null

  if (ep || bare) {
    const fromName = ep ? tidy(titleAndYear(name.slice(0, ep.at)).title) : ''
    const showDir = seasonDir || specialsDir ? grand : parent
    const fromDir = titleAndYear(showDir)
    const title = fromName || fromDir.title
    if (!title) return { kind: 'unknown', title: tidy(name), year: null, season: null, episodes: [], extra }
    const season = ep?.season ?? (seasonDir ? Number(seasonDir[1]) : specialsDir ? 0 : 1)
    const yearOfShow = (ep ? titleAndYear(name.slice(0, ep.at)).year : null) ?? fromDir.year
    return { kind: 'episode', title, year: yearOfShow, season, episodes: ep?.episodes ?? [Number(bare![1])], extra }
  }

  const own = titleAndYear(name)
  const folder = titleAndYear(parent)
  // A folder named like a film ("Arrival (2016)") is more trustworthy than a scene file name or "movie.mkv".
  const useFolder = !!folder.year && (!own.year || own.title.length < 3 || /^(movie|film|video|title|main)$/i.test(own.title))
  const pick = useFolder ? folder : own
  if (!pick.title) return { kind: 'unknown', title: tidy(name), year: null, season: null, episodes: [], extra }
  return { kind: 'movie', title: pick.title, year: pick.year ?? folder.year, season: null, episodes: [], extra }
}

/** One spelling for comparing titles: "Spider-Man: Across the Spider-Verse" and "spider man across the spider verse" match. */
export function titleKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

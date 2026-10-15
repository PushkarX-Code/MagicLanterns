import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { langKey } from '../../shared/text.ts'
import { parseSubtitles, type Cue } from '../../shared/subs.ts'

// Subtitles for the player: tracks inside the file are read out with FFmpeg, and subtitle files sitting
// next to the film (or in a Subs folder beside it) are picked up by name. Everything becomes timed lines.

export const SIDECAR_EXT = ['.srt', '.ass', '.ssa', '.vtt']
/** Tracks stored as pictures (Blu-ray, DVD). They can't be turned into lines of text. */
export const PICTURE_SUBS = new Set(['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub', 'dvb_subtitle', 'xsub'])

export interface Sidecar {
  path: string
  language: string // ISO code, or 'und'
  label: string // anything else the name says: "SDH", "Forced", "Commentary"
  forced: boolean
}


/** "Movie.en.forced.srt", "Movie.English.SDH.srt", "2_English.srt" → language and labels. */
export function describeSidecar(path: string, videoBase: string): Sidecar {
  const name = basename(path, extname(path))
  const rest = name.toLowerCase().startsWith(videoBase.toLowerCase()) ? name.slice(videoBase.length) : name
  const words = rest
    .split(/[\s._\-\[\]()]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w && !/^\d+$/.test(w))
  let language = 'und'
  const labels: string[] = []
  let forced = false
  for (const w of words) {
    if (language === 'und' && langKey(w, true)) language = langKey(w, true)!
    else if (w === 'forced' || w === 'foreign') forced = true
    else if (w === 'sdh' || w === 'cc' || w === 'hi') labels.push('SDH')
    else if (w === 'commentary') labels.push('Commentary')
  }
  return { path, language, label: [...new Set(labels)].join(' · '), forced }
}

const isSub = (f: string): boolean => SIDECAR_EXT.includes(extname(f).toLowerCase())
const list = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Subtitle files that belong to this video: same name beside it, or inside a Subs/Subtitles folder next to it. */
export function findSidecars(video: string): Sidecar[] {
  const dir = dirname(video)
  const base = basename(video, extname(video))
  const lower = base.toLowerCase()
  const found: string[] = []
  const siblings = list(dir)
  for (const f of siblings) if (isSub(f) && f.toLowerCase().startsWith(lower)) found.push(join(dir, f))
  const videos = siblings.filter((f) => /\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv)$/i.test(f)).length
  for (const folder of siblings.filter((f) => /^(subs?|subtitles?)$/i.test(f))) {
    const sub = join(dir, folder)
    // Per-episode folders (Subs/<episode name>/2_English.srt), else the folder's files when the film is alone.
    const own = list(sub).find((f) => f.toLowerCase() === lower)
    if (own) for (const f of list(join(sub, own))) isSub(f) && found.push(join(sub, own, f))
    else
      for (const f of list(sub))
        if (isSub(f) && (videos <= 1 || f.toLowerCase().startsWith(lower))) found.push(join(sub, f))
  }
  return [...new Set(found)].sort().map((p) => describeSidecar(p, base))
}

/** Text from a subtitle file in the right character set: a byte-order mark or valid UTF-8 wins, then the chosen encoding. */
export function decodeText(bytes: Uint8Array, encoding: string): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (encoding === 'auto' || encoding === 'utf-8') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      if (encoding === 'utf-8') return new TextDecoder('utf-8').decode(bytes)
    }
    return new TextDecoder('windows-1252').decode(bytes) // the usual suspect for older files
  }
  try {
    return new TextDecoder(encoding).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export function readSidecar(path: string, encoding: string): Cue[] {
  if (!existsSync(path) || statSync(path).size > 20 * 1024 * 1024) return []
  return parseSubtitles(decodeText(readFileSync(path), encoding), extname(path).slice(1))
}

const extracted = new Map<string, Promise<Cue[]>>()

/** Reads one subtitle track out of the film. Large files take a little while (the whole file is read once), so it's kept. */
export function readEmbedded(ffmpeg: string, video: string, index: number, codec: string): Promise<Cue[]> {
  const key = `${video}|${statSync(video).mtimeMs}|${index}`
  let job = extracted.get(key)
  if (!job) {
    const ass = /^(ass|ssa)$/.test(codec)
    job = new Promise<Cue[]>((resolve, reject) =>
      execFile(
        ffmpeg,
        ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', video, '-map', `0:${index}`, '-vn', '-an', '-c:s', ass ? 'ass' : 'srt', '-f', ass ? 'ass' : 'srt', '-'],
        { timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (err, out) => (err ? reject(err) : resolve(parseSubtitles(out, ass ? 'ass' : 'srt')))
      )
    )
    job.catch(() => extracted.delete(key))
    extracted.set(key, job)
    if (extracted.size > 24) extracted.delete(extracted.keys().next().value!)
  }
  return job
}

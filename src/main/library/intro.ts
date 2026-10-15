import { execFile, spawn } from 'node:child_process'
import type { Db } from '../db/index.ts'

// Skip Intro. An intro is the same music at the start of every episode, so the opening minutes of
// neighbouring episodes are compared by sound: each slice of audio becomes a 32-bit fingerprint of how
// its pitch bands rise and fall, and the longest stretch two episodes share is the intro. A chapter
// named "Intro" or "Opening" in the file wins over the guess.

export const RATE = 4000 // samples per second; plenty for music shapes, fast to decode
export const FRAME = 512 // samples per fingerprint window (0.128 s)
export const HOP = 128 // a fingerprint every 32 ms, so two episodes' slices never sit more than 16 ms apart
const SCAN = 600 // seconds from the start of each episode to compare
const MIN_INTRO = 15
const MAX_INTRO = 150

export interface Marker {
  start: number
  end: number
}

// ---------- Fingerprints ----------

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const ur = re[i + k]
        const ui = im[i + k]
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr
        im[i + k + len / 2] = ui - vi
      }
  }
}

const BANDS = 33
// Log-spaced band edges between 250 Hz and 1950 Hz, as FFT bin numbers.
const EDGES = Array.from({ length: BANDS + 1 }, (_, i) => Math.round((250 * Math.pow(1950 / 250, i / BANDS) * FRAME) / RATE))

/** One fingerprint per 32 ms (over a 128 ms window), and whether that slice was loud enough to mean anything (silence matches everything). */
export function fingerprint(samples: Int16Array): { hashes: Uint32Array; valid: Uint8Array } {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1)
  const hashes = new Uint32Array(frames)
  const valid = new Uint8Array(frames)
  const re = new Float64Array(FRAME)
  const im = new Float64Array(FRAME)
  const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)))
  let prev = new Float64Array(BANDS)
  for (let f = 0; f < frames; f++) {
    let power = 0
    for (let i = 0; i < FRAME; i++) {
      const s = samples[f * HOP + i] / 32768
      power += s * s
      re[i] = s * window[i]
      im[i] = 0
    }
    fft(re, im)
    const bands = new Float64Array(BANDS)
    for (let b = 0; b < BANDS; b++) for (let k = EDGES[b]; k < Math.max(EDGES[b + 1], EDGES[b] + 1); k++) bands[b] += re[k] * re[k] + im[k] * im[k]
    let h = 0
    for (let b = 0; b < BANDS - 1; b++) if (bands[b] - bands[b + 1] - (prev[b] - prev[b + 1]) > 0) h |= 1 << b
    hashes[f] = h >>> 0
    valid[f] = power / FRAME > 1e-5 ? 1 : 0
    prev = bands
  }
  return { hashes, valid }
}

const bits = (x: number): number => {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/**
 * The longest stretch of sound two episodes share, as seconds in each. Candidate alignments come from
 * fingerprints that partly match; each is then walked frame by frame, tolerating a few noisy slices.
 */
export function sharedStretch(a: ReturnType<typeof fingerprint>, b: ReturnType<typeof fingerprint>): { a: Marker; b: Marker } | null {
  const sec = HOP / RATE
  // Whole fingerprints rarely survive two encodes exactly, but their halves often do: vote on each half.
  const halves = (h: number): [number, number] => [h & 0xffff, 0x10000 | (h >>> 16)]
  const index = new Map<number, number[]>()
  for (let j = 0; j < b.hashes.length; j++) if (b.valid[j]) for (const k of halves(b.hashes[j])) (index.get(k) ?? index.set(k, []).get(k)!).push(j)
  const votes = new Map<number, number>()
  for (let i = 0; i < a.hashes.length; i++) {
    if (!a.valid[i]) continue
    for (const k of halves(a.hashes[i])) for (const j of index.get(k) ?? []) votes.set(j - i, (votes.get(j - i) ?? 0) + 1)
  }
  const offsets = [...votes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([o]) => o)
  let best: { i: number; len: number; off: number } | null = null
  const SMOOTH = Math.round(1 / sec) // one second
  for (const off of offsets) {
    const from = Math.max(0, -off)
    const to = Math.min(a.hashes.length, b.hashes.length - off)
    const ok: number[] = []
    for (let i = from; i < to; i++) ok.push(a.valid[i] && b.valid[i + off] && bits(a.hashes[i] ^ b.hashes[i + off]) <= 10 ? 1 : 0)
    let runStart = -1
    let sum = 0
    for (let k = 0; k <= ok.length; k++) {
      if (k < ok.length) sum += ok[k] - (k >= SMOOTH ? ok[k - SMOOTH] : 0)
      const good = k < ok.length && k >= SMOOTH - 1 && sum >= SMOOTH * 0.5
      if (good && runStart < 0) runStart = k - SMOOTH + 1
      if (!good && runStart >= 0) {
        // Trim the edges back to the first and last real match.
        let s = runStart
        let e = k - 1
        while (s < e && !ok[s]) s++
        while (e > s && !ok[e]) e--
        const len = e - s + 1
        if (!best || len > best.len) best = { i: from + s, len, off }
        runStart = -1
      }
    }
  }
  if (!best) return null
  const length = best.len * sec
  if (length < MIN_INTRO || length > MAX_INTRO) return null
  const round = (x: number): number => Math.round(x * 100) / 100
  return {
    a: { start: round(best.i * sec), end: round((best.i + best.len) * sec) },
    b: { start: round((best.i + best.off) * sec), end: round((best.i + best.off + best.len) * sec) }
  }
}

// ---------- Reading the files ----------

/** The opening minutes of an episode as mono 4 kHz samples. */
export function openingAudio(ffmpeg: string, file: string, seconds = SCAN): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-t', String(seconds), '-i', file, '-vn', '-sn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], {
      windowsHide: true
    })
    const chunks: Buffer[] = []
    p.stdout.on('data', (c: Buffer) => chunks.push(c))
    p.on('error', reject)
    p.on('close', (code) => {
      const buf = Buffer.concat(chunks)
      if (code && !buf.length) return reject(new Error(`ffmpeg exited ${code}`))
      resolve(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2)))
    })
  })
}

/** A chapter the file itself calls the intro or opening, if it has one. */
export function introChapter(chapters: { start_time?: string; end_time?: string; tags?: { title?: string } }[]): Marker | null {
  const c = chapters.find((x) => /^(intro|opening|op|opening credits|title sequence|theme)$/i.test((x.tags?.title ?? '').trim()))
  if (!c) return null
  const start = Number(c.start_time)
  const end = Number(c.end_time)
  return end - start >= 5 && end - start <= MAX_INTRO && start < SCAN ? { start, end } : null
}

function chaptersOf(ffprobe: string, file: string): Promise<Marker | null> {
  return new Promise((resolve) =>
    execFile(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_chapters', file], { timeout: 20_000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      try {
        resolve(introChapter((JSON.parse(out) as { chapters?: [] }).chapters ?? []))
      } catch {
        resolve(null)
      }
    })
  )
}

const save = (db: Db, fileId: number, m: Marker | null, now: number): void => {
  db.prepare("DELETE FROM generated WHERE file_id = ? AND type = 'intro'").run(fileId)
  db.prepare("INSERT INTO generated (file_id, type, local_path, meta_json, created_at) VALUES (?, 'intro', '', ?, ?)").run(fileId, JSON.stringify(m), now)
}

/**
 * Finds intros for every season that has new episodes. Each episode is compared with the one after it
 * (the last with the one before), so a season of ten costs ten short audio reads.
 */
export async function detectIntros(db: Db, ffmpeg: string, ffprobe: string, onFound: () => void, now = Date.now()): Promise<number> {
  const seasons = db
    .prepare(
      `SELECT DISTINCT f.item_id, f.parsed_season FROM files f
       WHERE f.kind = 'episode' AND f.missing = 0 AND f.hidden = 0 AND f.item_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM generated g WHERE g.file_id = f.id AND g.type = 'intro')`
    )
    .all() as { item_id: number; parsed_season: number | null }[]
  let found = 0
  for (const s of seasons) {
    const eps = db
      .prepare(
        `SELECT f.id, f.path, EXISTS (SELECT 1 FROM generated g WHERE g.file_id = f.id AND g.type = 'intro') AS done FROM files f
         WHERE f.kind = 'episode' AND f.missing = 0 AND f.hidden = 0 AND f.item_id = ? AND f.parsed_season IS ?
         ORDER BY f.parsed_episode, f.path`
      )
      .all(s.item_id, s.parsed_season) as { id: number; path: string; done: number }[]
    const prints = new Map<number, ReturnType<typeof fingerprint> | null>()
    const printOf = async (i: number): Promise<ReturnType<typeof fingerprint> | null> => {
      if (!prints.has(i)) prints.set(i, await openingAudio(ffmpeg, eps[i].path).then(fingerprint).catch(() => null))
      return prints.get(i)!
    }
    for (let i = 0; i < eps.length; i++) {
      if (eps[i].done) continue
      let marker = await chaptersOf(ffprobe, eps[i].path)
      if (!marker && eps.length > 1) {
        const other = i + 1 < eps.length ? i + 1 : i - 1
        const [mine, theirs] = [await printOf(i), await printOf(other)]
        marker = mine && theirs ? (sharedStretch(mine, theirs)?.a ?? null) : null
      }
      // A season of one episode has nothing to compare with yet; try again when another arrives.
      if (!marker && eps.length < 2) continue
      save(db, eps[i].id, marker, now)
      if (marker) {
        found++
        onFound()
      }
      prints.delete(i - 1) // only neighbours are needed again
    }
  }
  return found
}

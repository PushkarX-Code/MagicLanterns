import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/index.ts'

// Keeps a local copy of every picture the library uses, so screens load instantly and work offline.
// Each picture is fetched at the size its job needs (banners at full quality, faces small), and posters
// and banners also give the title its glow colour.

export interface Processed {
  data: Buffer
  ext: 'jpg' | 'png'
  width: number
  height: number
  /** Average colour, for banners and posters; null for everything else. */
  color: string | null
}
export type Processor = (input: Buffer, opts: { maxWidth: number; png: boolean; color: boolean }) => Processed | null
export type Download = (url: string) => Promise<Buffer>

type Role = 'backdrop' | 'thumb' | 'poster' | 'logo' | 'still' | 'profile'
const ROLES: Record<Role, { size: string; maxWidth: number; png?: boolean; color?: boolean }> = {
  // Banners fill the screen: the original, capped at 2560 wide.
  backdrop: { size: 'original', maxWidth: 2560, color: true },
  thumb: { size: 'w780', maxWidth: 780 },
  poster: { size: 'w500', maxWidth: 500, color: true },
  logo: { size: 'w500', maxWidth: 500, png: true },
  still: { size: 'w780', maxWidth: 780 },
  profile: { size: 'w185', maxWidth: 185 }
}

/** Every picture not yet saved, with the job it does (the first, if it does several). */
function wanted(db: Db): { id: number; path: string; role: Role }[] {
  const rows = db
    .prepare(
      `SELECT i.id, i.source_url AS path, r.role FROM images i JOIN (
         SELECT backdrop_img AS id, 'backdrop' AS role, 1 AS o FROM items
         UNION ALL SELECT poster_img, 'poster', 2 FROM items
         UNION ALL SELECT thumb_img, 'thumb', 3 FROM items
         UNION ALL SELECT logo_img, 'logo', 4 FROM items
         UNION ALL SELECT poster_img, 'poster', 5 FROM seasons
         UNION ALL SELECT still_img, 'still', 6 FROM episodes
         UNION ALL SELECT profile_img, 'profile', 7 FROM people
       ) r ON r.id = i.id
       WHERE i.local_path IS NULL AND i.source_url LIKE '/%'
       ORDER BY r.o`
    )
    .all()
  const seen = new Set<number>()
  const out: { id: number; path: string; role: Role }[] = []
  for (const r of rows) {
    const id = Number(r.id)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, path: String(r.path), role: r.role as Role })
  }
  return out
}

export async function cacheImages(
  db: Db,
  dir: string,
  download: Download,
  process: Processor,
  { concurrency = 4, onSaved = () => {} }: { concurrency?: number; onSaved?: () => void } = {}
): Promise<{ saved: number; failed: number }> {
  mkdirSync(dir, { recursive: true })
  const todo = wanted(db)
  const result = { saved: 0, failed: 0 }
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const job = todo[next++]
      const role = ROLES[job.role]
      try {
        const raw = await download(`https://image.tmdb.org/t/p/${role.size}${job.path}`)
        const out = process(raw, { maxWidth: role.maxWidth, png: !!role.png, color: !!role.color })
        if (!out) throw new Error('unreadable image')
        const file = join(dir, `${createHash('sha1').update(job.path).digest('hex').slice(0, 20)}.${out.ext}`)
        writeFileSync(file, out.data)
        db.prepare('UPDATE images SET local_path = ?, width = ?, height = ?, dominant_color = ?, bytes = ?, fetched_at = ? WHERE id = ?').run(
          file,
          out.width,
          out.height,
          out.color,
          out.data.length,
          Date.now(),
          job.id
        )
        result.saved++
        onSaved()
      } catch {
        // Offline or missing on the server: the screens keep using the online copy; tried again next time.
        result.failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker))
  return result
}

/**
 * The colour a title glows with: the picture's average, kept deep and moderately saturated so it reads as
 * ambient light behind white text rather than as a flat fill.
 */
export function glowColor(rgba: Uint8Array | Buffer, order: 'rgba' | 'bgra' = 'rgba'): string {
  let r = 0, g = 0, b = 0, w = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const R = rgba[i + (order === 'rgba' ? 0 : 2)], G = rgba[i + 1], B = rgba[i + (order === 'rgba' ? 2 : 0)]
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    // Colourful, mid-bright pixels count most; near-black and near-white ones barely.
    const weight = 0.05 + ((max - min) / 255) * (1 - Math.abs(max + min - 255) / 255)
    r += R * weight; g += G * weight; b += B * weight; w += weight
  }
  if (!w) return '#1c1c20'
  const [h, s] = rgbToHsl(r / w, g / w, b / w)
  return hslToHex(h, Math.min(0.55, Math.max(0.18, s)), 0.24)
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number): string => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

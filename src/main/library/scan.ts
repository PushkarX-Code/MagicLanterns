import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { dropUnplayable, identifyFolder, pruneOrphans, type IdentifyResult } from './identify.ts'
import { insertFile, knownFiles, markMissing, markScanned, saveProbe, touchFile, type Db, type ProbeRow } from '../db/index.ts'

// Finds every video under a library folder, records new and changed files, and reads their details.
// Incremental: a file whose size and modified time haven't changed isn't read again.

export const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.m4v', '.mov', '.avi', '.wmv', '.webm', '.ts', '.m2ts', '.mts', '.mpg', '.mpeg', '.flv', '.ogv', '.3gp', '.vob'])

// System and hidden folders never hold a library.
const SKIP_DIRS = /^(\$recycle\.bin|system volume information|recovery|\$windows\..*|node_modules)$/i

export interface Found {
  path: string
  size: number
  mtime: number
}

export async function findVideos(root: string, seen = new Set<string>()): Promise<Found[]> {
  const out: Found[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable folder: skip it, keep the rest
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.test(e.name)) await walk(full)
      } else if (e.isFile() && VIDEO_EXTENSIONS.has(extname(e.name).toLowerCase())) {
        const s = await stat(full).catch(() => null)
        if (s && !seen.has(full)) {
          seen.add(full)
          out.push({ path: full, size: s.size, mtime: Math.floor(s.mtimeMs) })
        }
      }
    }
  }
  await walk(root)
  return out
}

export interface ScanProgress {
  folder: string
  phase: 'finding' | 'reading' | 'done'
  found: number
  toRead: number
  read: number
  current: string | null
}

export interface ScanResult {
  folder: string
  found: number
  added: number
  changed: number
  missing: number
  read: number
  unreadable: number
  identified?: IdentifyResult
  skipped?: 'offline'
}

type Probe = (path: string, ext: string) => Promise<ProbeRow>

export async function scanFolder(
  db: Db,
  folder: { id: number; path: string },
  probe: Probe,
  onProgress: (p: ScanProgress) => void = () => {},
  {
    concurrency = 3,
    now = Date.now,
    afterRead
  }: { concurrency?: number; now?: () => number; afterRead?: (fileId: number, path: string, info: ProbeRow) => Promise<void> } = {}
): Promise<ScanResult> {
  const result: ScanResult = { folder: folder.path, found: 0, added: 0, changed: 0, missing: 0, read: 0, unreadable: 0 }
  // An unplugged drive or a disconnected share: leave everything as it was.
  const root = await stat(folder.path).catch(() => null)
  if (!root?.isDirectory()) return { ...result, skipped: 'offline' }

  onProgress({ folder: folder.path, phase: 'finding', found: 0, toRead: 0, read: 0, current: null })
  const found = await findVideos(folder.path)
  result.found = found.length
  const known = knownFiles(db, folder.id)
  const toRead: { id: number; path: string }[] = []
  const t = now()
  for (const f of found) {
    const k = known.get(f.path)
    if (!k) {
      toRead.push({ id: insertFile(db, folder.id, f, t), path: f.path })
      result.added++
    } else {
      known.delete(f.path)
      const changed = k.size !== f.size || k.mtime !== f.mtime
      touchFile(db, k.id, f, changed)
      if (changed) result.changed++
      if (changed || !k.probed) toRead.push({ id: k.id, path: f.path })
    }
  }
  const gone = [...known.values()].map((k) => k.id)
  markMissing(db, gone)
  result.missing = gone.length
  // Names are enough to file things under films and shows, so the library fills in before files are read.
  result.identified = identifyFolder(db, folder, t)

  let next = 0
  const report = (current: string | null): void =>
    onProgress({ folder: folder.path, phase: 'reading', found: result.found, toRead: toRead.length, read: result.read, current })
  report(null)
  const worker = async (): Promise<void> => {
    while (next < toRead.length) {
      const f = toRead[next++]
      report(f.path)
      const info = await probe(f.path, extname(f.path)).catch(() => null)
      saveProbe(db, f.id, info, now())
      if (info?.videoCodec && afterRead) await afterRead(f.id, f.path, info).catch(() => undefined)
      result.read++
      if (!info) result.unreadable++
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toRead.length) }, worker))

  dropUnplayable(db, folder.id)
  pruneOrphans(db)
  markScanned(db, folder.id, now())
  onProgress({ folder: folder.path, phase: 'done', found: result.found, toRead: toRead.length, read: result.read, current: null })
  return result
}

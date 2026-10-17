import { statSync } from 'node:fs'
import { isAbsolute, join, normalize, sep } from 'node:path'
import ffprobePath from '@ffprobe-installer/ffprobe'
import ffmpegPath from 'ffmpeg-static'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { LibraryFolder, MediaItem, ScanStatus } from '@shared/types'
import { addFolder, folderRows, listFolders, openDb, removeFolder, type Db } from '../db/index.ts'
import { pruneOrphans } from './identify.ts'
import { probeFile } from './probe.ts'
import { countVideos, scanFolder } from './scan.ts'
import { buildSnapshot, hideFiles, itemIdOf, saveProgress, setFavorite, setInList, setWatched } from './snapshot.ts'
import { createWatcher } from './watch.ts'
import { hasMetadata, omdb, tmdb } from '../keys'
import { cacheImages } from '../meta/images.ts'
import { fixMatch, matchPending, searchCandidates } from '../meta/index.ts'
import { download, processImage } from '../meta/native.ts'
import { refreshRatings } from '../meta/ratings.ts'
import { personDetails } from '../meta/person.ts'
import { detectIntros } from './intro.ts'

// The library lives in %APPDATA%/Magic Lanterns/library.db. Folders are scanned when added, at every launch
// and whenever files arrive or leave while the app is open; only new or changed files are read again.

let db: Db | null = null
const open = (): Db => (db ??= openDb(join(app.getPath('userData'), 'library.db')))

// Inside the installed app the binaries are unpacked next to the archive, not inside it.
const unpacked = (p: string): string => p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`).replace('app.asar/', 'app.asar.unpacked/')
const FFPROBE = unpacked(ffprobePath.path)
const FFMPEG = unpacked(ffmpegPath ?? 'ffmpeg')
const cacheDir = (): string => join(app.getPath('userData'), 'cache')
const imagesDir = (): string => join(cacheDir(), 'images')

function checkedFolder(path: unknown): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Not a folder path')
  const clean = normalize(path).replace(/[\\/]+$/, '') || path
  if (!statSync(clean, { throwIfNoEntry: false })?.isDirectory()) throw new Error('That folder no longer exists')
  return clean
}

/** The path of a library file by its database id, if it's present. */
export function libraryFilePath(fileId: string): string | null {
  if (!db || !/^\d+$/.test(fileId)) return null
  const r = db.prepare('SELECT path FROM files WHERE id = ? AND missing = 0').get(Number(fileId)) as { path: string } | undefined
  return r?.path ?? null
}

export const binaries = { ffmpeg: FFMPEG, ffprobe: FFPROBE }

/** Only files inside library folders or the app's own cache may be streamed to the interface. */
export function isLibraryPath(path: string): boolean {
  const norm = normalize(path)
  const inside = (root: string): boolean => {
    const r = normalize(root).replace(/[\\/]+$/, '') + sep
    return process.platform === 'win32' ? norm.toLowerCase().startsWith(r.toLowerCase()) : norm.startsWith(r)
  }
  return inside(cacheDir()) || (!!db && folderRows(db).some((f) => inside(f.path)))
}

// ---------- Change notices ----------

function send(channel: string, value: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, value)
}
let changeTimer: NodeJS.Timeout | null = null
/** Screens refetch when the library changes; bursts during a scan arrive as one notice. */
function changed(): void {
  if (changeTimer) return
  changeTimer = setTimeout(() => {
    changeTimer = null
    send('library:changed', Date.now())
  }, 400)
}

// ---------- Scan queue: one folder at a time, each folder queued at most once ----------

const queue: string[] = []
let status: ScanStatus = { scanning: false, folder: null, found: 0, toRead: 0, read: 0, current: null, queued: 0 }
const broadcast = (): void => send('scan:progress', status)

let running = false
async function drain(): Promise<void> {
  if (running) return
  running = true
  while (queue.length) {
    const path = queue.shift()!
    const folder = folderRows(open()).find((f) => f.path === path)
    if (!folder) continue
    status = { scanning: true, folder: path, found: 0, toRead: 0, read: 0, current: null, queued: queue.length }
    broadcast()
    let last = 0
    let readSince = 0
    try {
      await scanFolder(
        open(),
        folder,
        (file, ext) => probeFile(FFPROBE, file, ext),
        (p) => {
          status = { scanning: true, folder: path, found: p.found, toRead: p.toRead, read: p.read, current: p.current, queued: queue.length }
          // A few updates a second is plenty for a progress line.
          if (Date.now() - last > 200 || p.phase !== 'reading') {
            last = Date.now()
            broadcast()
          }
        },
        {
          afterRead: async () => {
            // A long first scan shows films as they're read, not all at the end.
            if (++readSince % 10 === 0) changed()
          }
        }
      )
    } catch (e) {
      console.error('Scan failed', path, e)
    }
    changed()
  }
  status = { scanning: false, folder: null, found: 0, toRead: 0, read: 0, current: null, queued: 0 }
  broadcast()
  // Then fetch artwork and details for anything new; each title appears as soon as it's done.
  if (hasMetadata()) await enrich()
  // Last, and slowest: listen for each season's opening titles so Skip Intro can offer itself.
  await detectIntros(open(), FFMPEG, FFPROBE, changed).catch((e) => console.error('Intro detection failed', e))
  running = false
  // Folders that changed while titles were being looked up.
  if (queue.length) void drain()
}

/** Details, then ratings, then local copies of every picture. Each part is skipped quietly when offline. */
async function enrich(): Promise<void> {
  await matchPending(open(), tmdb, changed).catch((e) => console.error('Metadata lookup failed', e))
  await refreshRatings(open(), omdb).then((n) => n && changed()).catch(() => undefined)
  let saved = 0
  await cacheImages(open(), imagesDir(), download, processImage, { onSaved: () => ++saved % 12 === 0 && changed() }).catch(() => undefined)
  if (saved) changed()
}

function enqueue(paths: string[]): void {
  for (const p of paths) if (!queue.includes(p) && status.folder !== p) queue.push(p)
  void drain()
}

const watcher = createWatcher((folder) => enqueue([folder]))
const rewatch = (): void => watcher.sync(folderRows(open()).map((f) => f.path))

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function initLibrary(): void {
  open()
  ipcMain.handle('library:folders', (): LibraryFolder[] => listFolders(open()))
  // First run: the usual places films live on this computer, with how many videos each holds.
  ipcMain.handle('library:suggest-folders', async (): Promise<{ path: string; label: string; videos: number }[]> => {
    const home = app.getPath('home')
    const places = (['videos', 'downloads', 'desktop'] as const)
      .map((key) => ({ path: app.getPath(key), label: key[0].toUpperCase() + key.slice(1) }))
      // Where a special folder isn't set up it falls back to the home folder; offer each place once, never home itself.
      .filter((p, i, all) => p.path !== home && all.findIndex((q) => q.path === p.path) === i)
    const found = await Promise.all(places.map(async (p) => ({ ...p, videos: await countVideos(p.path).catch(() => 0) })))
    return found.filter((f) => f.videos > 0)
  })
  ipcMain.handle('library:add-folder', (_e, path: unknown): LibraryFolder[] => {
    const clean = checkedFolder(path)
    addFolder(open(), clean)
    enqueue([clean])
    rewatch()
    return listFolders(open())
  })
  ipcMain.handle('library:remove-folder', (_e, path: unknown): LibraryFolder[] => {
    if (typeof path === 'string') {
      const i = queue.indexOf(path)
      if (i >= 0) queue.splice(i, 1)
      removeFolder(open(), path)
      pruneOrphans(open())
      rewatch()
      changed()
    }
    return listFolders(open())
  })
  ipcMain.handle('library:rescan', () => {
    rewatch()
    enqueue(folderRows(open()).map((f) => f.path))
  })
  ipcMain.handle('library:scan-status', (): ScanStatus => status)
  ipcMain.handle('meta:search', (_e, kind: unknown, query: unknown, year: unknown) =>
    hasMetadata() && (kind === 'movie' || kind === 'show') && typeof query === 'string'
      ? searchCandidates(tmdb, kind, query, typeof year === 'number' ? year : null)
      : []
  )
  ipcMain.handle('meta:fix', async (_e, itemId: unknown, tmdbId: unknown): Promise<string | null> => {
    const id = typeof itemId === 'string' ? itemIdOf(itemId) : null
    if (id == null || typeof tmdbId !== 'number' || !hasMetadata()) return null
    const kind = (open().prepare('SELECT kind FROM items WHERE id = ?').get(id) as { kind: string } | undefined)?.kind
    const into = await fixMatch(open(), tmdb, id, tmdbId)
    changed()
    void enrich()
    return into == null ? null : `${kind === 'show' ? 's' : 'm'}-${into}`
  })
  ipcMain.handle('meta:person', (_e, id: unknown) =>
    hasMetadata() && typeof id === 'number' && Number.isInteger(id) && id > 0 ? personDetails(open(), tmdb, id).catch(() => null) : null
  )
  ipcMain.handle('meta:status', () => {
    const n = (sql: string): number => Number((open().prepare(sql).get() as { n: number }).n)
    return {
      enabled: hasMetadata(),
      matched: n("SELECT COUNT(*) AS n FROM items WHERE match_state IN ('matched', 'low_confidence', 'manual')"),
      pending: n("SELECT COUNT(*) AS n FROM items WHERE match_state = 'pending'"),
      unmatched: n("SELECT COUNT(*) AS n FROM items WHERE match_state = 'unmatched'")
    }
  })

  // What the screens show, and the changes they make.
  ipcMain.handle('library:snapshot', (): MediaItem[] => buildSnapshot(open()))
  ipcMain.handle('library:save-progress', (_e, fileId: unknown, position: unknown, duration: unknown) => {
    if (typeof fileId === 'string') saveProgress(open(), fileId, Number(position), Number(duration))
  })
  ipcMain.handle('library:set-watched', (_e, fileIds: unknown, watched: unknown) => setWatched(open(), strings(fileIds), !!watched))
  ipcMain.handle('library:set-favorite', (_e, itemId: unknown, on: unknown) => typeof itemId === 'string' && setFavorite(open(), itemId, !!on))
  ipcMain.handle('library:set-in-list', (_e, itemId: unknown, on: unknown) => typeof itemId === 'string' && setInList(open(), itemId, !!on))
  ipcMain.handle('library:hide-files', (_e, fileIds: unknown) => {
    hideFiles(open(), strings(fileIds))
    pruneOrphans(open())
  })

  // Catch up on anything that changed while the app was closed.
  enqueue(folderRows(open()).map((f) => f.path))
  rewatch()
  app.on('will-quit', () => {
    watcher.close()
    db?.close()
    db = null
  })
}

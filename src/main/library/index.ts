import { statSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import ffprobePath from '@ffprobe-installer/ffprobe'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { LibraryFolder, ScanStatus } from '@shared/types'
import { addFolder, folderRows, listFolders, openDb, removeFolder, type Db } from '../db/index.ts'
import { pruneOrphans } from './identify.ts'
import { probeFile } from './probe.ts'
import { scanFolder } from './scan.ts'
import { createWatcher } from './watch.ts'

// The library lives in %APPDATA%/Magic Lanterns/library.db. Folders are scanned when added, at every launch
// and whenever files arrive or leave while the app is open; only new or changed files are read again.

let db: Db | null = null
const open = (): Db => (db ??= openDb(join(app.getPath('userData'), 'library.db')))

// Inside the installed app the binary is unpacked next to the archive, not inside it.
const FFPROBE = ffprobePath.path.replace('app.asar', 'app.asar.unpacked')

function checkedFolder(path: unknown): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Not a folder path')
  const clean = normalize(path).replace(/[\\/]+$/, '') || path
  if (!statSync(clean, { throwIfNoEntry: false })?.isDirectory()) throw new Error('That folder no longer exists')
  return clean
}

// ---------- Scan queue: one folder at a time, each folder queued at most once ----------

const queue: string[] = []
let status: ScanStatus = { scanning: false, folder: null, found: 0, toRead: 0, read: 0, current: null, queued: 0 }

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('scan:progress', status)
}

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
    try {
      await scanFolder(open(), folder, (file, ext) => probeFile(FFPROBE, file, ext), (p) => {
        status = { scanning: true, folder: path, found: p.found, toRead: p.toRead, read: p.read, current: p.current, queued: queue.length }
        // A few updates a second is plenty for a progress line.
        if (Date.now() - last > 200 || p.phase !== 'reading') {
          last = Date.now()
          broadcast()
        }
      })
    } catch (e) {
      console.error('Scan failed', path, e)
    }
  }
  status = { scanning: false, folder: null, found: 0, toRead: 0, read: 0, current: null, queued: 0 }
  broadcast()
  running = false
}

function enqueue(paths: string[]): void {
  for (const p of paths) if (!queue.includes(p) && status.folder !== p) queue.push(p)
  void drain()
}

const watcher = createWatcher((folder) => enqueue([folder]))
const rewatch = (): void => watcher.sync(folderRows(open()).map((f) => f.path))

export function initLibrary(): void {
  open()
  ipcMain.handle('library:folders', (): LibraryFolder[] => listFolders(open()))
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
    }
    return listFolders(open())
  })
  ipcMain.handle('library:rescan', () => {
    rewatch()
    enqueue(folderRows(open()).map((f) => f.path))
  })
  ipcMain.handle('library:scan-status', (): ScanStatus => status)
  // Catch up on anything that changed while the app was closed.
  enqueue(folderRows(open()).map((f) => f.path))
  rewatch()
  app.on('will-quit', () => {
    watcher.close()
    db?.close()
    db = null
  })
}

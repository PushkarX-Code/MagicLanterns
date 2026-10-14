import { watch, type FSWatcher } from 'node:fs'
import { extname } from 'node:path'
import { VIDEO_EXTENSIONS } from './scan.ts'

// Notices films arriving in (or leaving) a library folder while the app is open, and asks for a rescan of
// that folder once things settle. A big copy keeps sending changes, so the rescan waits for a quiet moment,
// but never more than a minute: a file still copying is read again once it's finished.

export interface FolderWatcher {
  /** Watch exactly these folders. */
  sync(paths: string[]): void
  close(): void
}

export function createWatcher(onSettled: (folder: string) => void, { quiet = 4000, maxWait = 60_000 } = {}): FolderWatcher {
  const watchers = new Map<string, FSWatcher>()
  const timers = new Map<string, { timer: NodeJS.Timeout; first: number }>()

  const schedule = (folder: string): void => {
    const pending = timers.get(folder)
    const first = pending?.first ?? Date.now()
    if (pending) clearTimeout(pending.timer)
    const wait = Math.max(0, Math.min(quiet, first + maxWait - Date.now()))
    timers.set(folder, {
      first,
      timer: setTimeout(() => {
        timers.delete(folder)
        onSettled(folder)
      }, wait)
    })
  }

  const open = (folder: string): void => {
    try {
      const w = watch(folder, { recursive: true, persistent: false }, (_event, name) => {
        const ext = name ? extname(String(name)).toLowerCase() : ''
        // No extension: probably a folder being added, renamed or deleted, which can carry videos with it.
        if (!name || !ext || VIDEO_EXTENSIONS.has(ext)) schedule(folder)
      })
      // A drive pulled out mid-watch: stop quietly; the next launch or Scan Again picks it up.
      w.on('error', () => {
        w.close()
        watchers.delete(folder)
      })
      watchers.set(folder, w)
    } catch {
      // Offline or unreadable right now.
    }
  }

  return {
    sync(paths) {
      for (const [folder, w] of watchers)
        if (!paths.includes(folder)) {
          w.close()
          watchers.delete(folder)
        }
      for (const p of paths) if (!watchers.has(p)) open(p)
    },
    close() {
      for (const w of watchers.values()) w.close()
      for (const t of timers.values()) clearTimeout(t.timer)
      watchers.clear()
      timers.clear()
    }
  }
}

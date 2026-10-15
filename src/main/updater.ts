import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

// Updates come from the public MagicLanterns-Releases repo, which holds installers only. Nothing downloads or installs on its own:
// the app checks once at launch, asks, and only restarts when the person chooses to.

/** Release notes arrive as HTML from GitHub; the prompt shows plain sentences. */
function plain(notes: unknown): string {
  const raw = Array.isArray(notes) ? notes.map((n) => (n as { note?: string }).note ?? '').join('\n') : String(notes ?? '')
  return raw
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function initUpdater(skipped: () => string | undefined, skip: (version: string) => void): void {
  let state: UpdateState | null = null
  let manual = false // a check the person asked for shows the update even if they skipped it before
  const publish = (next: UpdateState): void => {
    state = next
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:state', next)
  }

  ipcMain.handle('update:state', () => state)
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().catch(() => undefined))
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(false, true))
  ipcMain.handle('update:skip', (_e, version: string) => {
    skip(version)
    state = null
  })

  // "Check for Updates" on the More Info page. Resolves to what the person should be told.
  ipcMain.handle('update:check', async (): Promise<'dev' | 'store' | 'latest' | 'available' | 'offline'> => {
    if (!app.isPackaged) return 'dev'
    if (process.windowsStore) return 'store'
    try {
      manual = true
      const r = await autoUpdater.checkForUpdates()
      return r && r.updateInfo.version !== app.getVersion() ? 'available' : 'latest'
    } catch {
      return 'offline'
    } finally {
      manual = false
    }
  })

  // Dev builds never update themselves; Microsoft Store copies are kept current by the Store.
  if (!app.isPackaged || process.windowsStore) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('update-available', (info) => {
    if (!manual && info.version === skipped()) return
    publish({ stage: 'available', version: info.version, current: app.getVersion(), notes: plain(info.releaseNotes) })
  })
  autoUpdater.on('download-progress', (p) => {
    if (state && 'version' in state) publish({ stage: 'downloading', version: state.version, percent: p.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    autoUpdater.autoInstallOnAppQuit = true // "Later" still installs quietly the next time the app closes
    publish({ stage: 'ready', version: info.version })
  })
  autoUpdater.on('error', (e) => {
    if (state) publish({ stage: 'error', message: e?.message ?? String(e) }) // stay silent when offline at launch
  })

  // Once per launch, after the window has settled.
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 5000)
}

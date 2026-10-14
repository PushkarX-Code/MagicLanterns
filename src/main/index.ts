import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, session, shell } from 'electron'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

// ---------- Launch preferences (read before the GPU process starts) ----------
interface Prefs {
  hwDecode: 'auto' | 'off'
}
const prefsPath = (): string => join(app.getPath('userData'), 'prefs.json')
function readPrefs(): Prefs {
  try {
    return { hwDecode: 'auto', ...JSON.parse(readFileSync(prefsPath(), 'utf8')) }
  } catch {
    return { hwDecode: 'auto' }
  }
}
if (readPrefs().hwDecode === 'off') app.commandLine.appendSwitch('disable-accelerated-video-decode')

// ml-file:// streams local media with HTTP Range so the native player can seek.
protocol.registerSchemesAsPrivileged([
  { scheme: 'ml-file', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
])

const VIDEO_EXT = ['mkv', 'mp4', 'avi', 'mov', 'm4v', 'webm', 'ts', 'wmv']
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ts': 'video/mp2t',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv'
}

function serveFile(request: Request): Response {
  // ml-file://local/<encoded absolute path>
  const path = decodeURIComponent(new URL(request.url).pathname.slice(1))
  if (!existsSync(path)) return new Response('Not found', { status: 404 })
  const size = statSync(path).size
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
    })
  }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } })
}

// Production CSP. Dev relies on Vite's inline React refresh preamble, so it is only enforced when packaged.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://image.tmdb.org",
  "media-src 'self' blob: https: ml-file:",
  "connect-src 'self' https: ml-file:"
].join('; ')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0A0A0B',
    title: 'Magic Lanterns',
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#E8E8EA', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Links never navigate the app window; they open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen', false))
  win.on('minimize', () => win.webContents.send('window:minimized', true))
  win.on('restore', () => win.webContents.send('window:minimized', false))

  if (isDev) win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const fromSender = (e: Electron.IpcMainInvokeEvent): BrowserWindow | null => BrowserWindow.fromWebContents(e.sender)

ipcMain.on('shell:open-external', (_e, url: unknown) => {
  if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url)
})
ipcMain.handle('window:toggle-fullscreen', (e) => {
  const win = fromSender(e)
  if (!win) return false
  win.setFullScreen(!win.isFullScreen())
  return win.isFullScreen()
})
ipcMain.handle('window:set-fullscreen', (e, on: boolean) => fromSender(e)?.setFullScreen(!!on))
ipcMain.handle('window:always-on-top', (e, on: boolean) => fromSender(e)?.setAlwaysOnTop(!!on, 'floating'))

ipcMain.handle('dialog:open-folder', async (e) => {
  const win = fromSender(e)
  const r = win ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] }) : null
  return r && !r.canceled ? r.filePaths[0] : null
})
ipcMain.handle('dialog:open-files', async (e) => {
  const win = fromSender(e)
  const r = win
    ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: VIDEO_EXT }] })
    : null
  if (!r || r.canceled) return []
  return r.filePaths.map((path) => ({ path, url: `ml-file://local/${encodeURIComponent(path)}`, size: statSync(path).size }))
})

// Snapshot, saved to Pictures\Magic Lanterns. The renderer sends the full-resolution frame
// when it can read the pixels; otherwise (protected streams) we capture the video area of the window.
ipcMain.handle('player:snapshot', async (e, frame: { bytes?: Uint8Array; rect?: Electron.Rectangle }, format: 'png' | 'jpg', name: string) => {
  const image = frame.bytes ? null : await e.sender.capturePage(frame.rect)
  const dir = join(app.getPath('pictures'), 'Magic Lanterns')
  await mkdir(dir, { recursive: true })
  const safe = name.replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'Snapshot'
  const file = join(dir, `${safe} ${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`)
  await writeFile(file, frame.bytes ? Buffer.from(frame.bytes) : format === 'jpg' ? image!.toJPEG(92) : image!.toPNG())
  return file
})
ipcMain.handle('shell:show-item', (_e, path: string) => shell.showItemInFolder(path))

ipcMain.handle('prefs:set', (_e, patch: Partial<Prefs>) => {
  writeFileSync(prefsPath(), JSON.stringify({ ...readPrefs(), ...patch }))
})

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  protocol.handle('ml-file', serveFile)
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
    })
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

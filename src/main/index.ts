import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, session, shell } from 'electron'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

// Production CSP. Dev relies on Vite's inline React refresh preamble, so it is only enforced when packaged.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://image.tmdb.org",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:"
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

  if (isDev) win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.on('shell:open-external', (_e, url: unknown) => {
  if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url)
})
ipcMain.handle('window:toggle-fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return false
  win.setFullScreen(!win.isFullScreen())
  return win.isFullScreen()
})

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
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

import { contextBridge, ipcRenderer } from 'electron'
import type { LanternBridge } from './bridge'

const listen =
  (channel: string) =>
  (cb: (value: boolean) => void): (() => void) => {
    const listener = (_e: unknown, value: boolean): void => cb(value)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

// The only surface the renderer can reach. Phase 2 adds library and metadata channels here.
const bridge: LanternBridge = {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  showInFolder: (path) => ipcRenderer.invoke('shell:show-item', path),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  setFullscreen: (on) => ipcRenderer.invoke('window:set-fullscreen', on),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('window:always-on-top', on),
  onFullscreen: listen('window:fullscreen'),
  onMinimized: listen('window:minimized'),
  pickFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  pickFiles: () => ipcRenderer.invoke('dialog:open-files'),
  snapshot: (frame, format, name) => ipcRenderer.invoke('player:snapshot', frame, format, name),
  setLaunchPrefs: (prefs) => ipcRenderer.invoke('prefs:set', prefs),
  getTrending: () => ipcRenderer.invoke('discover:trending'),
  updateState: () => ipcRenderer.invoke('update:state'),
  onUpdate: (cb) => {
    const listener = (_e: unknown, state: Parameters<typeof cb>[0]): void => cb(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  },
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  skipUpdate: (version) => ipcRenderer.invoke('update:skip', version)
}

contextBridge.exposeInMainWorld('lantern', bridge)

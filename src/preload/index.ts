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
  snapshot: (rect, format, name) => ipcRenderer.invoke('player:snapshot', rect, format, name),
  setLaunchPrefs: (prefs) => ipcRenderer.invoke('prefs:set', prefs)
}

contextBridge.exposeInMainWorld('lantern', bridge)

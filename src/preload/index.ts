import { contextBridge, ipcRenderer } from 'electron'
import type { LanternBridge } from './bridge'

// The only surface the renderer can reach. Phase 2+ adds library, metadata and player channels here.
const bridge: LanternBridge = {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  onFullscreen: (cb) => {
    const listener = (_e: unknown, value: boolean): void => cb(value)
    ipcRenderer.on('window:fullscreen', listener)
    return () => ipcRenderer.removeListener('window:fullscreen', listener)
  }
}

contextBridge.exposeInMainWorld('lantern', bridge)

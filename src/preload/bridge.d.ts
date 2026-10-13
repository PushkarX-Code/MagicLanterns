export interface PickedFile {
  path: string
  url: string
  size: number
}

export interface LanternBridge {
  platform: string
  versions: { electron: string; chrome: string }
  openExternal(url: string): void
  showInFolder(path: string): Promise<void>
  toggleFullscreen(): Promise<boolean>
  setFullscreen(on: boolean): Promise<void>
  setAlwaysOnTop(on: boolean): Promise<void>
  onFullscreen(cb: (fullscreen: boolean) => void): () => void
  onMinimized(cb: (minimized: boolean) => void): () => void
  pickFolder(): Promise<string | null>
  pickFiles(): Promise<PickedFile[]>
  snapshot(rect: { x: number; y: number; width: number; height: number } | undefined, format: 'png' | 'jpg', name: string): Promise<string>
  setLaunchPrefs(prefs: { hwDecode?: 'auto' | 'off' }): Promise<void>
}

import type { DiscoverDetails, DiscoverList, TrendingTitle, UpdateState } from '../shared/types'

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
  /** Save a snapshot: encoded frame bytes, or a window region to capture. Resolves to the saved file path. */
  snapshot(frame: { bytes?: Uint8Array; rect?: { x: number; y: number; width: number; height: number } }, format: 'png' | 'jpg', name: string): Promise<string>
  setLaunchPrefs(prefs: { hwDecode?: 'auto' | 'off' }): Promise<void>
  /** A discover row; empty when no metadata key was built in or offline. */
  getDiscover(list: DiscoverList): Promise<TrendingTitle[]>
  getDiscoverDetails(kind: 'movie' | 'tv', id: number): Promise<DiscoverDetails | null>
  updateState(): Promise<UpdateState | null>
  onUpdate(cb: (state: UpdateState) => void): () => void
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  skipUpdate(version: string): Promise<void>
  checkForUpdates(): Promise<'dev' | 'latest' | 'available' | 'offline'>
}

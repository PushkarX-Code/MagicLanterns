import type { DiscoverDetails, DiscoverList, LibraryFolder, MediaItem, ScanStatus, TrendingTitle, UpdateState } from '../shared/types'

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
  /** Library folders saved in the library database. Add rejects a path that isn't an existing folder. */
  getFolders(): Promise<LibraryFolder[]>
  addFolder(path: string): Promise<LibraryFolder[]>
  removeFolder(path: string): Promise<LibraryFolder[]>
  /** Look through every folder again for new, changed or removed files. */
  rescan(): Promise<void>
  scanStatus(): Promise<ScanStatus>
  onScan(cb: (status: ScanStatus) => void): () => void
  /** Every film and show found in the library folders. */
  getLibrary(): Promise<MediaItem[]>
  /** The library changed on disk (a scan found something, a folder was removed). */
  onLibraryChanged(cb: (at: number) => void): () => void
  saveProgress(fileId: string, position: number, duration: number): Promise<void>
  setWatched(fileIds: string[], watched: boolean): Promise<void>
  setFavorite(itemId: string, on: boolean): Promise<void>
  setInList(itemId: string, on: boolean): Promise<void>
  /** Take files out of the library (they stay on disk). */
  hideFiles(fileIds: string[]): Promise<void>
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

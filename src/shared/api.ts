import type {
  Collection,
  FileEntry,
  HomeData,
  LibraryFolder,
  MediaItem,
  PlaybackSource,
  Settings
} from './types'

/**
 * The single contract between the UI and everything behind it.
 * The mock implements it today; the library engine implements it over IPC in Phase 2.
 * Screens never import anything but this interface.
 */
export interface LanternApi {
  getHome(): Promise<HomeData>
  getItem(id: string): Promise<MediaItem | null>
  getGenre(name: string): Promise<MediaItem[]>
  getFavorites(): Promise<MediaItem[]>
  getMoreLikeThis(id: string): Promise<MediaItem[]>
  /** Library titles a cast member appears in, newest first. */
  getPersonItems(person: { id?: number; name: string }): Promise<MediaItem[]>
  getCollections(): Promise<Collection[]>
  getCollection(id: string): Promise<{ collection: Collection; items: MediaItem[] } | null>
  search(query: string): Promise<MediaItem[]>

  // Files
  getFiles(): Promise<FileEntry[]>
  getFolders(): Promise<LibraryFolder[]>
  addFolder(path: string): Promise<LibraryFolder[]>
  removeFolder(path: string): Promise<LibraryFolder[]>
  addFiles(files: { path: string; url: string; size?: number }[]): Promise<FileEntry[]>
  removeFiles(ids: string[]): Promise<void>
  setFilesStarred(ids: string[], starred: boolean): Promise<void>
  setFilesWatched(ids: string[], watched: boolean): Promise<void>

  // Playback
  getPlayback(itemId: string, episodeId?: string): Promise<PlaybackSource>
  getFilePlayback(fileId: string): Promise<PlaybackSource>
  saveProgress(itemId: string, episodeId: string | undefined, position: number, duration: number): Promise<void>
  setWatched(itemId: string, watched: boolean): Promise<MediaItem | null>
  toggleFavorite(itemId: string): Promise<MediaItem | null>
  toggleList(itemId: string): Promise<MediaItem | null>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>

  openExternal(url: string): void
}

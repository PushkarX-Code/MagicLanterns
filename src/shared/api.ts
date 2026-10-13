import type {
  CardModel,
  Collection,
  HomeData,
  LibraryFolder,
  MediaItem,
  MediaKind,
  PlaybackSource,
  Settings
} from './types'

/**
 * The single contract between the UI and everything behind it.
 * Phase 1 ships a mock implementation; later phases implement it over IPC.
 * Screens never import anything but this interface.
 */
export interface LanternApi {
  getHome(): Promise<HomeData>
  getLibrary(kind: MediaKind): Promise<MediaItem[]>
  getItem(id: string): Promise<MediaItem | null>
  getContinueWatching(): Promise<CardModel[]>
  getMoreLikeThis(id: string): Promise<MediaItem[]>
  getCollections(): Promise<Collection[]>
  getFolders(): Promise<LibraryFolder[]>
  search(query: string): Promise<MediaItem[]>

  getPlayback(itemId: string, episodeId?: string): Promise<PlaybackSource>
  saveProgress(itemId: string, episodeId: string | undefined, position: number, duration: number): Promise<void>
  setWatched(itemId: string, watched: boolean): Promise<MediaItem | null>
  toggleFavorite(itemId: string): Promise<MediaItem | null>
  toggleList(itemId: string): Promise<MediaItem | null>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>

  openExternal(url: string): void
}

import type { LanternApi } from '@shared/api'
import type { MediaItem } from '@shared/types'
import { createMockApi } from '../mock/api'
import { useLibraryVersion } from '../state/library'
import { createLibraryApi } from './engine'

// In the desktop app every screen shows the real library from the library database. In a plain browser
// (development previews, screenshots) it shows the built-in demo library instead.
function create(): LanternApi {
  const bridge = typeof window !== 'undefined' ? window.lantern : undefined
  if (!bridge?.getLibrary) return createMockApi()

  let items: MediaItem[] = []
  const refresh = (): Promise<void> =>
    bridge.getLibrary().then((next) => {
      items = next
    })
  const first = refresh()
  bridge.onLibraryChanged(() => {
    void refresh().then(() => useLibraryVersion.getState().bump())
  })

  return createLibraryApi({
    items: () => items,
    ready: () => first,
    collections: () => [],
    folders: () => bridge.getFolders(),
    addFolder: (path) => bridge.addFolder(path),
    removeFolder: (path) => bridge.removeFolder(path),
    media: (item, episode) => {
      const path = (episode?.file ?? item.file)?.path ?? ''
      return { url: `ml-file://local/${encodeURIComponent(path)}` }
    },
    saveProgress: (file, position, duration) => file.id && void bridge.saveProgress(file.id, position, duration),
    setWatched: (files, watched) => void bridge.setWatched(files.map((f) => f.id).filter((x): x is string => !!x), watched),
    setFavorite: (itemId, on) => void bridge.setFavorite(itemId, on),
    setInList: (itemId, on) => void bridge.setInList(itemId, on),
    hideFiles: (files) => void bridge.hideFiles(files.map((f) => f.id).filter((x): x is string => !!x))
  })
}

export const api: LanternApi = create()

/** True in the desktop app, where the library is real (and can be empty). */
export const isRealLibrary = typeof window !== 'undefined' && !!window.lantern?.getLibrary

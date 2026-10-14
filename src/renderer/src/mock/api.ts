import type { LanternApi } from '@shared/api'
import { createLibraryApi } from '../lib/engine'
import { COLLECTIONS, FOLDERS, ITEMS, SAMPLE_VIDEOS } from './library'

export { SLOW_KEY } from '../lib/engine'

/** The demo library: real film data and artwork, every title playing the open-licensed sample film. */
export function createMockApi(): LanternApi {
  const folders = [...FOLDERS]
  return createLibraryApi({
    items: () => ITEMS,
    collections: () => COLLECTIONS,
    async folders() {
      return folders
    },
    async addFolder(path) {
      if (!folders.some((f) => f.path === path)) folders.push({ path, items: 0, size: 0, lastScan: Date.now() })
      return folders
    },
    async removeFolder(path) {
      const i = folders.findIndex((f) => f.path === path)
      if (i >= 0) folders.splice(i, 1)
      return folders
    },
    media: () => ({ url: SAMPLE_VIDEOS[0], alternates: SAMPLE_VIDEOS.slice(1) }),
    heroIds: ['movie-693134', 'tv-1429', 'tv-95396', 'tv-85937', 'movie-335984', 'movie-569094'],
    simulateLatency: true,
    demoIntro: true
  })
}

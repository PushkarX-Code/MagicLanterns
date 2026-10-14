// Image URLs. Phase 1 reads TMDB's CDN directly; Phase 3 points this at the local ml-img:// cache.

export type ImgSize = 'w92' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

export function img(path: string | null | undefined, size: ImgSize): string | null {
  if (!path) return null
  if (/^(https?|blob|data|ml-img):/.test(path)) return path
  return `https://image.tmdb.org/t/p/${size}${path}`
}

/** Full-bleed backdrops: TMDB originals only when the screen can actually show the extra pixels. */
/** Banners are always the full-resolution original; the blur-up placeholder covers the load. */
export const backdropSize = (): ImgSize => 'original'

/** URLs that have fully decoded once. Cards that remount skip the fade so revisits are instant. */
const loaded = new Set<string>()
export const isLoaded = (url: string): boolean => loaded.has(url)
export const markLoaded = (url: string): void => {
  loaded.add(url)
}

export function preload(url: string | null): Promise<void> {
  if (!url || loaded.has(url)) return Promise.resolve()
  return new Promise((resolve) => {
    const i = new Image()
    i.decoding = 'async'
    i.onload = () => {
      loaded.add(url)
      resolve()
    }
    i.onerror = () => resolve()
    i.src = url
  })
}

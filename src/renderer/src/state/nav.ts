import { create } from 'zustand'

export type Section = 'search' | 'home' | 'movies' | 'shows' | 'continue' | 'collections' | 'folders' | 'settings'

/** Where a card was on screen when it was opened, so the detail page can grow out of it. */
export interface Origin {
  rect: { x: number; y: number; width: number; height: number }
  src: string | null
  color: string
}

export type Route =
  | { name: Section }
  | { name: 'collection'; id: string }
  | { name: 'detail'; id: string; origin?: Origin }
  | { name: 'player'; itemId: string; episodeId?: string; fresh?: boolean }

export interface Entry {
  key: number
  route: Route
}

interface NavState {
  stack: Entry[]
  section: Section
  go: (section: Section) => void
  push: (route: Route) => void
  replace: (route: Route) => void
  back: () => void
}

let nextKey = 1

export const useNav = create<NavState>((set, get) => ({
  stack: [{ key: 0, route: { name: 'home' } }],
  section: 'home',
  go: (section) => {
    const top = get().stack[0]
    if (get().stack.length === 1 && top.route.name === section) return
    set({ stack: [{ key: nextKey++, route: { name: section } }], section })
  },
  push: (route) => set((s) => ({ stack: [...s.stack, { key: nextKey++, route }] })),
  replace: (route) => set((s) => ({ stack: [...s.stack.slice(0, -1), { key: nextKey++, route }] })),
  back: () => set((s) => (s.stack.length > 1 ? { stack: s.stack.slice(0, -1) } : s))
}))

export const isSection = (r: Route): r is { name: Section } =>
  ['search', 'home', 'movies', 'shows', 'continue', 'collections', 'folders', 'settings'].includes(r.name)

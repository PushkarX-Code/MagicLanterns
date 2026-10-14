import { create } from 'zustand'

/** Goes up whenever the library on disk changes, so every screen showing it refetches. */
export const useLibraryVersion = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 }))
}))

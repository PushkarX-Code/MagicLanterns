import { create } from 'zustand'

/** The focused item's dominant color, bled softly into the page background (Apple TV behavior). */
interface AmbientState {
  color: string
  set: (color: string | null | undefined) => void
}

export const useAmbient = create<AmbientState>((set, get) => ({
  color: '#1a1a1e',
  set: (color) => {
    if (color && color !== get().color) set({ color })
  }
}))

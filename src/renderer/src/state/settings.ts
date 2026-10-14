import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { api } from '../lib/api'
import { setReduceMotion } from '../design/motion'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const s = await api.getSettings()
    setReduceMotion(s.reduceMotion)
    set({ settings: s })
  },
  // Optimistic: the UI (sliders especially) moves at once; persistence follows in the background.
  update: async (patch) => {
    const cur = get().settings
    if (cur) {
      const next = { ...cur, ...patch }
      setReduceMotion(next.reduceMotion)
      set({ settings: next })
    }
    const saved = await api.setSettings(patch)
    if (!cur) {
      setReduceMotion(saved.reduceMotion)
      set({ settings: saved })
    }
  }
}))

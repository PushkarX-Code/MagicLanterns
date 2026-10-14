import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { api } from '../lib/api'
import { setReduceMotion } from '../design/motion'

/** Look-and-feel settings that live on <html>: motion and colour theme. */
function applyLook(s: Settings): void {
  setReduceMotion(s.reduceMotion)
  document.documentElement.dataset.theme = s.theme ?? 'default'
}

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const s = await api.getSettings()
    applyLook(s)
    set({ settings: s })
  },
  // Optimistic: the UI (sliders especially) moves at once; persistence follows in the background.
  update: async (patch) => {
    const cur = get().settings
    if (cur) {
      const next = { ...cur, ...patch }
      applyLook(next)
      set({ settings: next })
    }
    const saved = await api.setSettings(patch)
    if (!cur) {
      applyLook(saved)
      set({ settings: saved })
    }
  }
}))

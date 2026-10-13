import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { api } from '../lib/api'
import { setReduceMotion } from '../design/motion'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => {
    const s = await api.getSettings()
    setReduceMotion(s.reduceMotion)
    set({ settings: s })
  },
  update: async (patch) => {
    const s = await api.setSettings(patch)
    setReduceMotion(s.reduceMotion)
    set({ settings: s })
  }
}))

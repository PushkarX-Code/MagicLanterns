import type { LanternApi } from '@shared/api'
import { createMockApi } from '../mock/api'

// The demo library still comes from the mock. Library folders are real in the desktop app: they're saved in
// the library database (step 8). Scanning them replaces the demo library in the steps that follow.
function create(): LanternApi {
  const mock = createMockApi()
  const bridge = typeof window !== 'undefined' ? window.lantern : undefined
  if (!bridge?.getFolders) return mock
  return {
    ...mock,
    getFolders: () => bridge.getFolders(),
    addFolder: (path) => bridge.addFolder(path),
    removeFolder: (path) => bridge.removeFolder(path)
  }
}

export const api: LanternApi = create()

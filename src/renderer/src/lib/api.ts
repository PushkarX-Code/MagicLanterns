import type { LanternApi } from '@shared/api'
import { createMockApi } from '../mock/api'

// Phase 1: every screen talks to the mock. Phase 2 swaps in an IPC-backed implementation here.
export const api: LanternApi = createMockApi()

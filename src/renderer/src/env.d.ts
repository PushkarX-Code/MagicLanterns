/// <reference types="vite/client" />
import type { LanternBridge } from '../../preload/bridge'

declare global {
  interface Window {
    /** Present inside Electron. Absent when the renderer runs in a plain browser (mock preview). */
    lantern?: LanternBridge
  }
}

/// <reference types="vite/client" />
import type { LanternBridge } from '../../preload/bridge'

declare global {
  /** package.json version, injected at build time. */
  const __APP_VERSION__: string
  interface Window {
    /** Present inside Electron. Absent when the renderer runs in a plain browser (mock preview). */
    lantern?: LanternBridge
  }
}

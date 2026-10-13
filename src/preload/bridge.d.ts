export interface LanternBridge {
  platform: string
  versions: { electron: string; chrome: string }
  openExternal(url: string): void
  toggleFullscreen(): Promise<boolean>
  onFullscreen(cb: (fullscreen: boolean) => void): () => void
}

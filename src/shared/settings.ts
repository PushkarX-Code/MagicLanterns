// Every user preference in one flat object. Grouped the way the Settings screen shows them.
// Shared so the main process can read launch-time options (hardware decoding) in later phases.

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const

/** Equalizer presets, in dB per band. */
export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Classical: [0, 0, 0, 0, 0, 0, -7.2, -7.2, -7.2, -9.6],
  Club: [0, 0, 8, 5.6, 5.6, 5.6, 3.2, 0, 0, 0],
  Dance: [9.6, 7.2, 2.4, 0, 0, -5.6, -7.2, -7.2, 0, 0],
  'Full Bass': [9.6, 9.6, 9.6, 5.6, 1.6, -4, -8, -10.4, -11.2, -11.2],
  Headphones: [4.8, 11.2, 5.6, -3.2, -2.4, 1.6, 4.8, 9.6, 12.8, 14.4],
  'Large Hall': [10.4, 10.4, 5.6, 5.6, 0, -4.8, -4.8, -4.8, 0, 0],
  Live: [-4.8, 0, 4, 5.6, 5.6, 5.6, 4, 2.4, 2.4, 2.4],
  Party: [7.2, 7.2, 0, 0, 0, 0, 0, 0, 7.2, 7.2],
  Pop: [-1.6, 4.8, 7.2, 8, 5.6, 0, -2.4, -2.4, -1.6, -1.6],
  Reggae: [0, 0, 0, -5.6, 0, 6.4, 6.4, 0, 0, 0],
  Rock: [8, 4.8, -5.6, -8, -3.2, 4, 8.8, 11.2, 11.2, 11.2],
  Soft: [4.8, 1.6, 0, -2.4, 0, 4, 8, 9.6, 11.2, 12],
  Techno: [8, 5.6, 0, -5.6, -4.8, 0, 8, 9.6, 9.6, 8.8],
  Vocal: [-3.2, -2.4, 0, 4.8, 6.4, 6.4, 4.8, 2.4, 0, -2.4]
}

export interface Settings {
  // Library (API keys are build-time secrets in the main process, not settings)
  metadataLanguage: string
  // Playback
  resumeMode: 'ask' | 'always' | 'never'
  autoplayNext: boolean
  defaultSpeed: number
  seekStep: number // seconds
  repeat: 'off' | 'one' | 'all'
  pauseOnMinimize: boolean
  keepOnTop: 'never' | 'playing' | 'always'
  startFullscreen: boolean
  // Video
  hwDecode: 'auto' | 'off'
  videoFit: 'fit' | 'fill' | 'stretch'
  aspect: 'auto' | '16:9' | '4:3' | '21:9' | '2.39:1' | '1:1'
  brightness: number // 100 = neutral
  contrast: number
  saturation: number
  hue: number // degrees
  deinterlace: 'off' | 'auto' | 'on'
  toneMapping: 'auto' | 'off'
  // Audio
  audioDevice: string // 'default' or a device id
  audioLanguage: string
  volumeBoost: number // max volume, percent
  normalize: boolean
  downmix: boolean
  audioDelay: number // ms
  eqEnabled: boolean
  eqPreset: string
  eqBands: number[]
  passthrough: boolean
  // Subtitles
  subtitleLanguage: string
  autoLoadSubs: boolean
  subtitleSize: 'small' | 'medium' | 'large'
  subtitleStyle: 'shadow' | 'glass' | 'outline'
  subtitleColor: 'white' | 'yellow' | 'cyan'
  subtitlePosition: 'bottom' | 'raised'
  subtitleDelay: number // ms
  subtitleEncoding: string
  // Controls
  wheelAction: 'volume' | 'seek' | 'off'
  doubleClickFullscreen: boolean
  volumeStep: number // percent
  showRemaining: boolean
  // Snapshots
  snapshotFormat: 'png' | 'jpg'
  // Interface
  theme: 'default' | 'dark' | 'light'
  reduceMotion: boolean
  heroPreviews: boolean
  /** First-run setup finished (or skipped because a library already existed). */
  onboarded: boolean
  showClock: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  metadataLanguage: 'en-US',
  resumeMode: 'ask',
  autoplayNext: true,
  defaultSpeed: 1,
  seekStep: 10,
  repeat: 'off',
  pauseOnMinimize: true,
  keepOnTop: 'never',
  startFullscreen: false,
  hwDecode: 'auto',
  videoFit: 'fit',
  aspect: 'auto',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  deinterlace: 'auto',
  toneMapping: 'auto',
  audioDevice: 'default',
  audioLanguage: 'eng',
  volumeBoost: 100,
  normalize: false,
  downmix: false,
  audioDelay: 0,
  eqEnabled: false,
  eqPreset: 'Flat',
  eqBands: [...EQ_PRESETS.Flat],
  passthrough: false,
  subtitleLanguage: 'eng',
  autoLoadSubs: true,
  subtitleSize: 'medium',
  subtitleStyle: 'shadow',
  subtitleColor: 'white',
  subtitlePosition: 'bottom',
  subtitleDelay: 0,
  subtitleEncoding: 'auto',
  wheelAction: 'volume',
  doubleClickFullscreen: true,
  volumeStep: 5,
  showRemaining: true,
  snapshotFormat: 'png',
  theme: 'default',
  reduceMotion: false,
  heroPreviews: true,
  onboarded: false,
  showClock: true
}

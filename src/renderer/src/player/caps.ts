import type { PlayerCaps } from '@shared/types'

// What this computer's decoder plays directly. Asked once; the playback engine converts everything else.
const VIDEO: Record<string, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L150.B0"',
  av1: 'video/mp4; codecs="av01.0.08M.08"',
  vp9: 'video/mp4; codecs="vp09.00.40.08"',
  vp8: 'video/webm; codecs="vp8"'
}
const AUDIO: Record<string, string> = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
  opus: 'audio/mp4; codecs="opus"',
  flac: 'audio/mp4; codecs="flac"',
  vorbis: 'audio/webm; codecs="vorbis"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"'
}

let cached: Omit<PlayerCaps, 'hwDecode'> | null = null

export function playerCaps(hwDecode: boolean): PlayerCaps {
  if (!cached) {
    const el = document.createElement('video')
    const ok = (type: string): boolean => (window.MediaSource?.isTypeSupported(type) ?? false) || el.canPlayType(type) === 'probably'
    cached = {
      video: Object.entries(VIDEO).filter(([, t]) => ok(t)).map(([k]) => k),
      audio: Object.entries(AUDIO).filter(([, t]) => ok(t)).map(([k]) => k)
    }
  }
  return { ...cached, hwDecode }
}

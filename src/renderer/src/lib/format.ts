import type { AudioTrack, FileInfo, HdrFormat } from '@shared/types'

const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0')

/** 2448 → "00:40:48" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`
}

/** Player time: "4:05" or "1:04:05" */
export function timecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** 167 → "2h 47m" */
export function runtime(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

export function bytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i >= 3 ? 1 : 0)} ${units[i]}`
}

export const bitrate = (bps: number): string => `${(bps / 1_000_000).toFixed(1)} Mb/s`

export function resolutionLabel(f: Pick<FileInfo, 'width' | 'height'>): string {
  if (f.width >= 3800 || f.height >= 2100) return '4K'
  if (f.height >= 1000 || f.width >= 1900) return '1080p'
  if (f.height >= 700) return '720p'
  return 'SD'
}

export function hdrLabel(h: HdrFormat): string | null {
  return h === 'SDR' ? null : h === 'DV' ? 'Dolby Vision' : h
}

export function audioLabel(a: AudioTrack | undefined): string | null {
  if (!a) return null
  if (a.atmos) return 'Dolby Atmos'
  if (a.channels >= 8) return '7.1'
  if (a.channels >= 6) return '5.1'
  return 'Stereo'
}

const CODECS: Record<string, string> = {
  hevc: 'HEVC (H.265)',
  h264: 'AVC (H.264)',
  av1: 'AV1',
  truehd: 'Dolby TrueHD',
  eac3: 'Dolby Digital Plus',
  ac3: 'Dolby Digital',
  dts: 'DTS-HD MA',
  aac: 'AAC',
  subrip: 'SubRip'
}
export const codecName = (c: string): string => CODECS[c] ?? c.toUpperCase()

export function timeAgo(epoch: number): string {
  const m = Math.round((Date.now() - epoch) / 60000)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
  const days = Math.round(h / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

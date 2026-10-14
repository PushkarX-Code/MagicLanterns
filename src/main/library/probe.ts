import { execFile } from 'node:child_process'

// Reads a video file's technical details with ffprobe and boils them down to what the library stores.
// normalizeProbe is pure so it can be tested against recorded ffprobe output.

export type Hdr = 'SDR' | 'HDR10' | 'HDR10+' | 'HLG' | 'DV'

export interface StreamInfo {
  idx: number
  type: 'video' | 'audio' | 'subtitle'
  codec: string | null
  language: string | null
  title: string | null
  channels: number | null
  layout: string | null
  isAtmos: boolean
  isDefault: boolean
  isForced: boolean
  isText: boolean
}

export interface ProbeResult {
  duration: number | null
  container: string | null
  videoCodec: string | null
  width: number | null
  height: number | null
  fps: number | null
  bitrate: number | null
  hdr: Hdr
  dvProfile: number | null
  embeddedTitle: string | null
  streams: StreamInfo[]
}

interface RawStream {
  index: number
  codec_type?: string
  codec_name?: string
  profile?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  color_transfer?: string
  channels?: number
  channel_layout?: string
  disposition?: Record<string, number>
  tags?: Record<string, string>
  side_data_list?: { side_data_type?: string; dv_profile?: number }[]
}
export interface RawProbe {
  streams?: RawStream[]
  format?: { format_name?: string; duration?: string; bit_rate?: string; tags?: Record<string, string> }
}

const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'])

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function rate(r?: string): number | null {
  const [a, b] = (r ?? '').split('/').map(Number)
  if (!a || !b) return null
  return Math.round((a / b) * 1000) / 1000
}

const tag = (tags: Record<string, string> | undefined, key: string): string | null => {
  if (!tags) return null
  const hit = Object.entries(tags).find(([k]) => k.toLowerCase() === key)?.[1]?.trim()
  return hit || null
}

/** Container from ffprobe's format list, made specific by the file's extension (matroska covers mkv and webm). */
function containerOf(formatName: string | undefined, ext: string): string | null {
  if (!formatName) return ext || null
  const names = formatName.split(',')
  if (names.includes(ext)) return ext
  if (names[0] === 'matroska') return 'mkv'
  if (names[0] === 'mov') return 'mp4'
  if (names[0] === 'mpegts') return 'ts'
  return names[0]
}

export function normalizeProbe(raw: RawProbe, ext = ''): ProbeResult {
  const all = raw.streams ?? []
  // Cover art in music-style tags shows up as a one-frame video stream; it isn't the picture.
  const video = all.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const dovi = video?.side_data_list?.find((d) => d.side_data_type === 'DOVI configuration record')

  let hdr: Hdr = 'SDR'
  if (dovi) hdr = 'DV'
  else if (video?.color_transfer === 'smpte2084') hdr = 'HDR10'
  else if (video?.color_transfer === 'arib-std-b67') hdr = 'HLG'

  const streams: StreamInfo[] = all
    .filter((s) => (s.codec_type === 'video' && !s.disposition?.attached_pic) || s.codec_type === 'audio' || s.codec_type === 'subtitle')
    .map((s) => {
      const lang = tag(s.tags, 'language')
      return {
        idx: s.index,
        type: s.codec_type as StreamInfo['type'],
        codec: s.codec_name ?? null,
        language: lang && lang !== 'und' ? lang : null,
        title: tag(s.tags, 'title'),
        channels: s.codec_type === 'audio' ? (s.channels ?? null) : null,
        layout: s.codec_type === 'audio' ? (s.channel_layout ?? null) : null,
        isAtmos: s.codec_type === 'audio' && /atmos/i.test(s.profile ?? ''),
        isDefault: !!s.disposition?.default,
        isForced: !!s.disposition?.forced,
        isText: s.codec_type === 'subtitle' && TEXT_SUBS.has(s.codec_name ?? '')
      }
    })

  return {
    duration: num(raw.format?.duration),
    container: containerOf(raw.format?.format_name, ext.toLowerCase().replace(/^\./, '')),
    videoCodec: video?.codec_name ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: rate(video?.avg_frame_rate) ?? rate(video?.r_frame_rate),
    bitrate: num(raw.format?.bit_rate),
    hdr,
    dvProfile: dovi?.dv_profile ?? null,
    embeddedTitle: tag(raw.format?.tags, 'title'),
    streams
  }
}

/** HDR10+ lives in per-frame metadata, so it takes a look at the first frame of an HDR10 file. */
export const isHdr10Plus = (raw: { frames?: { side_data_list?: { side_data_type?: string }[] }[] }): boolean =>
  !!raw.frames?.some((f) => f.side_data_list?.some((d) => /SMPTE2094-40|HDR10\+/i.test(d.side_data_type ?? '')))

function ffprobe(bin: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(bin, ['-v', 'error', '-print_format', 'json', ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 60_000, windowsHide: true }, (err, out) =>
      err ? reject(err) : resolve(JSON.parse(out))
    )
  })
}

export async function probeFile(bin: string, file: string, ext: string): Promise<ProbeResult> {
  const result = normalizeProbe((await ffprobe(bin, ['-show_format', '-show_streams', file])) as RawProbe, ext)
  if (result.hdr === 'HDR10') {
    const first = await ffprobe(bin, ['-select_streams', 'v:0', '-read_intervals', '%+#1', '-show_entries', 'frame=side_data_list', file]).catch(() => ({}))
    if (isHdr10Plus(first as never)) result.hdr = 'HDR10+'
  }
  return result
}

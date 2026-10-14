// Decides how a file reaches the screen, cheapest first:
//   native     the file as it is (MP4/WebM the system decodes)
//   remux      same picture and sound, repackaged on the fly (MKV, AVI, TS…); costs almost nothing
//   audio      picture copied, sound converted (DTS, TrueHD, AC-3 the system can't decode)
//   transcode  picture converted too (MPEG-2, VC-1, 10-bit H.264, HEVC without a decoder, DV profile 5)
// Pure: the facts about the file and the machine go in, a plan and the converter's arguments come out.

export type Mode = 'native' | 'remux' | 'audio' | 'transcode'

/** What the system's decoder can play, reported by the interface at startup. */
export interface Caps {
  video: string[] // 'h264' | 'hevc' | 'av1' | 'vp9' | 'vp8'
  audio: string[] // 'aac' | 'mp3' | 'opus' | 'flac' | 'vorbis' | 'ac3' | 'eac3'
}

export interface Facts {
  /** Seconds, from the file's header (0 if unknown). */
  duration?: number
  container: string // from the file extension: mkv, mp4, webm, avi…
  video: { codec: string; profile?: string; pixFmt?: string; fieldOrder?: string; height?: number; hdr: boolean; dvProfile?: number | null } | null
  audio: { codec: string; channels: number }[]
}

export interface Choice {
  /** Index among the file's audio tracks (0 = first). */
  audio: number
  downmix: boolean
  deinterlace: 'off' | 'auto' | 'on'
  toneMapping: 'auto' | 'off'
}

export interface Machine {
  /** Best working H.264 encoder: a graphics-card one when present. */
  encoder: string
  /** The converter has the filters for tone mapping. */
  canToneMap: boolean
}

export interface Plan {
  mode: Mode
  /** Converter arguments after the input; empty for native. */
  args: string[]
}

const NATIVE_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'webm'])
/** Sound that can travel inside the repackaged MP4 without conversion. */
const MP4_AUDIO = new Set(['aac', 'mp3', 'opus', 'flac', 'ac3', 'eac3'])

function videoPlayable(v: NonNullable<Facts['video']>, caps: Caps): boolean {
  if (!caps.video.includes(v.codec)) return false
  // 10-bit H.264 (common in anime releases) and 4:2:2/4:4:4 have no hardware path in browsers.
  if (v.codec === 'h264' && (/high 10|high 4:2:2|high 4:4:4/i.test(v.profile ?? '') || /10le|12le|422|444/.test(v.pixFmt ?? ''))) return false
  // Dolby Vision profile 5 has no HDR10 base layer: decoding it plainly gives purple-green pictures.
  if (v.dvProfile === 5) return false
  return true
}

export function plan(f: Facts, caps: Caps, c: Choice, m: Machine): Plan {
  const track = f.audio[c.audio] ?? f.audio[0]
  const audioIndex = f.audio[c.audio] ? c.audio : 0
  const soundOk = !track || caps.audio.includes(track.codec)
  const pictureOk = !f.video || videoPlayable(f.video, caps)
  const interlaced = !!f.video?.fieldOrder && !['progressive', 'unknown'].includes(f.video.fieldOrder)
  const deinterlace = c.deinterlace === 'on' || (c.deinterlace === 'auto' && interlaced)

  // Native only plays the first sound track, untouched.
  if (NATIVE_CONTAINERS.has(f.container) && pictureOk && soundOk && audioIndex === 0 && !c.downmix && !deinterlace && !(f.container === 'webm' && track && !['opus', 'vorbis'].includes(track.codec)))
    return { mode: 'native', args: [] }

  const transcodeVideo = !pictureOk || deinterlace
  const convertSound = !!track && (!soundOk || !MP4_AUDIO.has(track.codec) || c.downmix)

  const args = ['-map', '0:v:0?', '-map', `0:a:${audioIndex}?`, '-sn', '-dn']

  if (transcodeVideo) {
    const filters: string[] = []
    if (deinterlace) filters.push('bwdif=mode=send_frame')
    if (f.video?.hdr && c.toneMapping === 'auto' && m.canToneMap)
      filters.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv')
    // A processor encoding in real time can't keep up with 4K; a graphics card can.
    if (m.encoder === 'libx264' && (f.video?.height ?? 0) > 1080) filters.push('scale=-2:1080')
    filters.push('format=yuv420p')
    args.push('-vf', filters.join(','))
    args.push('-c:v', m.encoder)
    if (m.encoder === 'libx264') args.push('-preset', 'veryfast', '-crf', '20', '-tune', 'film')
    else args.push('-b:v', '20M', '-maxrate', '30M', '-bufsize', '40M')
    args.push('-g', '48', '-pix_fmt', 'yuv420p')
  } else {
    args.push('-c:v', 'copy')
    if (f.video?.codec === 'hevc') args.push('-tag:v', 'hvc1')
  }

  if (track) {
    if (convertSound) {
      const ch = c.downmix ? 2 : Math.min(track.channels || 2, 6)
      args.push('-c:a', 'aac', '-ac', String(ch), '-b:a', ch > 2 ? '448k' : '192k')
    } else args.push('-c:a', 'copy')
  }

  args.push('-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '2000000', 'pipe:1')
  const mode: Mode = transcodeVideo ? 'transcode' : convertSound ? 'audio' : 'remux'
  return { mode, args }
}

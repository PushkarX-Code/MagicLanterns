import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import type { PlaybackPlan, PlayerCaps, SubtitleTrack } from '../../shared/types.ts'
import type { Cue } from '../../shared/subs.ts'
import { plan, type Choice, type Facts, type Machine } from './planner.ts'
import { findSidecars, readEmbedded, readSidecar } from './subtitles.ts'

// The playback engine. Files the system can decode play straight from disk; everything else is repackaged
// or converted by FFmpeg as it plays and served to the player from a private address on this computer.
// Seeking restarts the conversion at the new spot, so any point in any film is a second away.

interface Session {
  path: string
  facts: Facts
  choice: Choice
  caps: PlayerCaps
  proc: ChildProcess | null
}

const sessions = new Map<string, Session>()
const SIDECAR_BASE = 10_000
const LANGS = new Intl.DisplayNames(['en'], { type: 'language' })
const languageName = (code: string): string => {
  if (code === 'und') return ''
  try {
    return LANGS.of(code) ?? code
  } catch {
    return code
  }
}
const frames = new Map<string, string>()
const factsCache = new Map<string, Promise<Facts | null>>()
let server: Server | null = null
let port = 0
let machine: Promise<Machine> | null = null

function run(bin: string, args: string[], timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out)))
  )
}

/** The fastest encoder that actually works on this machine (a graphics card's, when it has one). */
function detectMachine(ffmpeg: string): Promise<Machine> {
  return (machine ??= (async () => {
    const candidates =
      process.platform === 'win32' ? ['h264_nvenc', 'h264_qsv', 'h264_amf'] : process.platform === 'darwin' ? ['h264_videotoolbox'] : ['h264_nvenc']
    let encoder = 'libx264'
    for (const enc of candidates) {
      const ok = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:d=0.2', '-frames:v', '3', '-c:v', enc, '-f', 'null', '-'], 10_000)
        .then(() => true)
        .catch(() => false)
      if (ok) {
        encoder = enc
        break
      }
    }
    const filters = await run(ffmpeg, ['-hide_banner', '-filters']).catch(() => '')
    return { encoder, canToneMap: / zscale /.test(filters) && / tonemap /.test(filters) }
  })())
}

interface RawStream {
  codec_type?: string
  codec_name?: string
  profile?: string
  pix_fmt?: string
  field_order?: string
  height?: number
  channels?: number
  color_transfer?: string
  disposition?: { attached_pic?: number }
  side_data_list?: { side_data_type?: string; dv_profile?: number }[]
}

/** The details the planner needs, read fresh when playback starts (it takes a moment and is always current). */
export async function readFacts(ffprobe: string, path: string): Promise<Facts> {
  const raw = JSON.parse(await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path])) as {
    streams?: RawStream[]
    format?: { duration?: string }
  }
  const streams = raw.streams ?? []
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const dovi = v?.side_data_list?.find((d) => d.side_data_type === 'DOVI configuration record')
  return {
    duration: Number(raw.format?.duration) || 0,
    container: extname(path).slice(1).toLowerCase(),
    video: v
      ? {
          codec: v.codec_name ?? '',
          profile: v.profile,
          pixFmt: v.pix_fmt,
          fieldOrder: v.field_order,
          height: v.height,
          hdr: !!dovi || v.color_transfer === 'smpte2084' || v.color_transfer === 'arib-std-b67',
          dvProfile: dovi?.dv_profile ?? null
        }
      : null,
    audio: streams.filter((s) => s.codec_type === 'audio').map((s) => ({ codec: s.codec_name ?? '', channels: s.channels ?? 2 }))
  }
}

function stop(s: Session): void {
  if (s.proc && s.proc.exitCode == null) s.proc.kill('SIGKILL')
  s.proc = null
}

async function startServer(ffmpeg: string): Promise<void> {
  if (server) return
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const s = sessions.get(url.pathname.split('/')[2] ?? '')
    if (!s || req.method !== 'GET') {
      res.writeHead(404).end()
      return
    }
    // One conversion per player: a seek replaces the stream, it doesn't add another.
    stop(s)
    const start = Math.max(0, Number(url.searchParams.get('t')) || 0)
    const m = await detectMachine(ffmpeg)
    const p = plan(s.facts, s.caps, s.choice, m)
    const transcoding = p.mode === 'transcode'
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...(transcoding && s.caps.hwDecode ? ['-hwaccel', 'auto'] : []), '-ss', start.toFixed(3), '-i', s.path, ...p.args]
    const proc = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    s.proc = proc
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
    proc.stdout!.pipe(res)
    let err = ''
    proc.stderr!.on('data', (d) => (err = (err + d).slice(-2000)))
    proc.on('close', (code) => {
      if (code && code !== 255 && err) console.error('Playback conversion stopped:', err.trim())
      res.end()
    })
    req.on('close', () => s.proc === proc && stop(s))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
}

export interface PlayerDeps {
  ffmpeg: string
  ffprobe: string
  /** The path to play, or null if it isn't one the interface may open. */
  resolve: (target: { fileId?: string; path?: string }) => string | null
  /** The URL for playing a file straight from disk. */
  directUrl: (path: string) => string
}

export function initPlayer(deps: PlayerDeps): void {
  ipcMain.handle(
    'player:open',
    async (
      _e,
      target: { fileId?: string; path?: string },
      opts: { audio?: number; caps: PlayerCaps; settings: Omit<Choice, 'audio'>; session?: string; forceStream?: boolean }
    ): Promise<PlaybackPlan> => {
      const path = deps.resolve(target ?? {})
      if (!path) throw new Error('That file is not in the library')
      const facts = await readFacts(deps.ffprobe, path)
      const choice: Choice = { audio: Math.max(0, Number(opts.audio) || 0), ...opts.settings }
      const m = await detectMachine(deps.ffmpeg)
      // The player tried the file directly and the system refused it after all: repackage it instead.
      if (opts.forceStream) facts.container = 'mkv'
      const p = plan(facts, opts.caps, choice, m)
      // Changing the sound track reuses the player's session; anything else starts a new one.
      if (opts.session && sessions.has(opts.session)) {
        stop(sessions.get(opts.session)!)
        sessions.delete(opts.session)
      }
      if (p.mode === 'native') return { mode: 'native', url: deps.directUrl(path), session: null, encoder: null, duration: facts.duration ?? 0 }
      await startServer(deps.ffmpeg)
      const id = randomBytes(12).toString('hex')
      sessions.set(id, { path, facts, choice, caps: opts.caps, proc: null })
      return { mode: p.mode, url: `http://127.0.0.1:${port}/s/${id}`, session: id, encoder: p.mode === 'transcode' ? m.encoder : null, duration: facts.duration ?? 0 }
    }
  )
  // Subtitle files beside the film. Their index numbers start at 10000 so they never collide with the file's own tracks.
  ipcMain.handle('player:subtitles', (_e, target: { fileId?: string; path?: string }): SubtitleTrack[] => {
    const path = deps.resolve(target ?? {})
    if (!path) return []
    return findSidecars(path).map((s, i) => ({
      index: SIDECAR_BASE + i,
      codec: s.path.split('.').pop()!.toLowerCase(),
      language: s.language,
      title: [languageName(s.language) || 'Subtitles', s.label, s.forced ? 'Forced' : '', 'File'].filter(Boolean).join(' · '),
      forced: s.forced,
      external: true
    }))
  })
  ipcMain.handle(
    'player:subtitle',
    async (_e, target: { fileId?: string; path?: string }, track: { index: number; codec: string }, encoding: unknown): Promise<Cue[] | null> => {
      const path = deps.resolve(target ?? {})
      if (!path || typeof track?.index !== 'number') return null
      try {
        if (track.index >= SIDECAR_BASE) {
          const file = findSidecars(path)[track.index - SIDECAR_BASE]
          return file ? readSidecar(file.path, typeof encoding === 'string' ? encoding : 'auto') : null
        }
        return await readEmbedded(deps.ffmpeg, path, track.index, String(track.codec ?? ''))
      } catch (e) {
        console.error('Subtitle read failed', e)
        return null
      }
    }
  )
  // A small still for the scrub bar while streaming (the player can't seek a second copy of a live conversion).
  ipcMain.handle('player:frame', async (_e, target: { fileId?: string; path?: string }, at: unknown): Promise<string | null> => {
    const path = deps.resolve(target ?? {})
    const t = Number(at)
    if (!path || !Number.isFinite(t) || t < 0) return null
    const key = `${path}|${Math.round(t / 2)}`
    if (frames.has(key)) return frames.get(key)!
    const facts = await (factsCache.get(path) ?? factsCache.set(path, readFacts(deps.ffprobe, path).catch(() => null)).get(path)!)
    const m = await detectMachine(deps.ffmpeg)
    const tone = facts?.video?.hdr && m.canToneMap ? ',zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p' : ''
    const jpg = await new Promise<Buffer | null>((resolve) =>
      execFile(
        deps.ffmpeg,
        ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', t.toFixed(2), '-i', path, '-frames:v', '1', '-vf', `scale=320:-2${tone}`, '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '6', '-'],
        { timeout: 8000, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        (err, out) => resolve(err || !out.length ? null : out)
      )
    )
    const url = jpg ? `data:image/jpeg;base64,${jpg.toString('base64')}` : null
    if (url) {
      frames.set(key, url)
      if (frames.size > 400) frames.delete(frames.keys().next().value!)
    }
    return url
  })
  ipcMain.handle('player:close', (_e, id: unknown) => {
    const s = typeof id === 'string' ? sessions.get(id) : undefined
    if (s) {
      stop(s)
      sessions.delete(id as string)
    }
  })
}

export function closePlayer(): void {
  for (const s of sessions.values()) stop(s)
  sessions.clear()
  server?.close()
  server = null
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plan, type Choice, type Facts, type Machine } from './planner.ts'

const caps = { video: ['h264', 'hevc', 'vp9', 'av1'], audio: ['aac', 'mp3', 'opus', 'flac', 'vorbis'] }
const choice: Choice = { audio: 0, downmix: false, deinterlace: 'auto', toneMapping: 'auto' }
const gpu: Machine = { encoder: 'h264_nvenc', canToneMap: true }
const cpu: Machine = { encoder: 'libx264', canToneMap: true }
const film = (over: Partial<Facts> = {}, video: Partial<NonNullable<Facts['video']>> = {}): Facts => ({
  container: 'mp4',
  video: { codec: 'h264', profile: 'High', pixFmt: 'yuv420p', fieldOrder: 'progressive', height: 1080, hdr: false, ...video },
  audio: [{ codec: 'aac', channels: 2 }],
  ...over
})
const arg = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

test('an MP4 the system decodes plays straight from disk', () => {
  assert.deepEqual(plan(film(), caps, choice, gpu), { mode: 'native', args: [] })
  assert.equal(plan(film({ container: 'webm', audio: [{ codec: 'opus', channels: 2 }] }, { codec: 'vp9' }), caps, choice, gpu).mode, 'native')
})

test('MKV with playable picture and sound is only repackaged', () => {
  const p = plan(film({ container: 'mkv' }, { codec: 'hevc', hdr: true }), caps, choice, gpu)
  assert.equal(p.mode, 'remux')
  assert.equal(arg(p.args, '-c:v'), 'copy')
  assert.equal(arg(p.args, '-tag:v'), 'hvc1')
  assert.equal(arg(p.args, '-c:a'), 'copy')
  assert.equal(p.args.at(-1), 'pipe:1')
})

test('sound the system can not decode is converted, keeping every channel', () => {
  const p = plan(film({ container: 'mkv', audio: [{ codec: 'truehd', channels: 8 }] }, { codec: 'hevc' }), caps, choice, gpu)
  assert.equal(p.mode, 'audio')
  assert.deepEqual([arg(p.args, '-c:v'), arg(p.args, '-c:a'), arg(p.args, '-ac')], ['copy', 'flac', '8'])
  const ac3 = plan(film({ audio: [{ codec: 'ac3', channels: 6 }] }), { ...caps, audio: ['aac'] }, choice, gpu)
  assert.deepEqual([arg(ac3.args, '-c:a'), arg(ac3.args, '-ac')], ['aac', '6'])
  const dts = plan(film({ audio: [{ codec: 'dts', channels: 6 }] }), caps, { ...choice, downmix: true }, gpu)
  assert.deepEqual([dts.mode, arg(dts.args, '-ac')], ['audio', '2'])
})

test('picking another sound track leaves native playback (it can only play the first)', () => {
  const two = film({ audio: [{ codec: 'aac', channels: 2 }, { codec: 'aac', channels: 2 }] })
  assert.equal(plan(two, caps, choice, gpu).mode, 'native')
  const p = plan(two, caps, { ...choice, audio: 1 }, gpu)
  assert.equal(p.mode, 'remux')
  assert.equal(arg(p.args, '-map').startsWith('0:v'), true)
  assert.ok(p.args.includes('0:a:1?'))
})

test('pictures the system can not decode are converted', () => {
  // 10-bit H.264, typical of anime releases.
  const hi10 = plan(film({ container: 'mkv' }, { profile: 'High 10', pixFmt: 'yuv420p10le' }), caps, choice, gpu)
  assert.deepEqual([hi10.mode, arg(hi10.args, '-c:v')], ['transcode', 'h264_nvenc'])
  // HEVC on a machine without a decoder for it.
  assert.equal(plan(film({ container: 'mkv' }, { codec: 'hevc' }), { ...caps, video: ['h264'] }, choice, gpu).mode, 'transcode')
  // Old formats.
  assert.equal(plan(film({ container: 'avi' }, { codec: 'mpeg2video' }), caps, choice, gpu).mode, 'transcode')
  // Dolby Vision profile 5 has no plain HDR picture underneath.
  assert.equal(plan(film({ container: 'mkv' }, { codec: 'hevc', hdr: true, dvProfile: 5 }), caps, choice, gpu).mode, 'transcode')
  assert.equal(plan(film({ container: 'mkv' }, { codec: 'hevc', hdr: true, dvProfile: 8 }), caps, choice, gpu).mode, 'remux')
})

test('converting HDR tone-maps it; a processor encoder converts 4K down to 1080p to keep up', () => {
  const hdr4k = film({ container: 'mkv' }, { codec: 'hevc', hdr: true, height: 2160 })
  const noHevc = { ...caps, video: ['h264'] }
  const g = arg(plan(hdr4k, noHevc, choice, gpu).args, '-vf')
  assert.match(g, /tonemap=tonemap=hable/)
  assert.doesNotMatch(g, /scale=-2:1080/)
  const c = plan(hdr4k, noHevc, choice, cpu)
  assert.match(arg(c.args, '-vf'), /scale=-2:1080/)
  assert.deepEqual([arg(c.args, '-preset'), arg(c.args, '-crf')], ['veryfast', '20'])
  assert.doesNotMatch(arg(plan(hdr4k, noHevc, { ...choice, toneMapping: 'off' }, gpu).args, '-vf'), /tonemap/)
  assert.doesNotMatch(arg(plan(hdr4k, noHevc, choice, { ...gpu, canToneMap: false }).args, '-vf'), /tonemap/)
})

test('interlaced video is deinterlaced (auto), or always when asked', () => {
  const tv = film({ container: 'ts' }, { fieldOrder: 'tt' })
  assert.match(arg(plan(tv, caps, choice, gpu).args, '-vf'), /bwdif/)
  assert.equal(plan(tv, caps, { ...choice, deinterlace: 'off' }, gpu).mode, 'remux')
  assert.equal(plan(film(), caps, { ...choice, deinterlace: 'on' }, gpu).mode, 'transcode')
})

test('a file without sound, or without picture, still plays', () => {
  assert.equal(plan(film({ audio: [] }), caps, choice, gpu).mode, 'native')
  const p = plan(film({ container: 'mkv', video: null }), caps, choice, gpu)
  assert.equal(p.mode, 'remux')
})

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addFolder, folderRows, listFolders, openDb } from '../db/index.ts'
import { isHdr10Plus, normalizeProbe, type ProbeResult } from './probe.ts'
import { findVideos, scanFolder } from './scan.ts'

// ---------- normalizeProbe, against shapes ffprobe really prints ----------

test('a 4K Dolby Vision film with Atmos, commentary and subtitles', () => {
  const r = normalizeProbe(
    {
      format: { format_name: 'matroska,webm', duration: '8760.5', bit_rate: '58000000', tags: { title: 'Dune Part Two' } },
      streams: [
        { index: 0, codec_type: 'video', codec_name: 'hevc', width: 3840, height: 1606, avg_frame_rate: '24000/1001', color_transfer: 'smpte2084',
          side_data_list: [{ side_data_type: 'DOVI configuration record', dv_profile: 8 }] },
        { index: 1, codec_type: 'audio', codec_name: 'truehd', profile: 'Dolby TrueHD + Dolby Atmos', channels: 8, channel_layout: '7.1', tags: { language: 'eng' }, disposition: { default: 1 } },
        { index: 2, codec_type: 'audio', codec_name: 'ac3', channels: 2, channel_layout: 'stereo', tags: { language: 'eng', title: 'Commentary' } },
        { index: 3, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'eng' } },
        { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'fre' }, disposition: { forced: 1 } },
        { index: 5, codec_type: 'attachment', codec_name: 'ttf' }
      ]
    },
    '.mkv'
  )
  assert.equal(r.container, 'mkv')
  assert.equal(r.hdr, 'DV')
  assert.equal(r.dvProfile, 8)
  assert.deepEqual([r.videoCodec, r.width, r.height, r.fps, r.duration, r.bitrate], ['hevc', 3840, 1606, 23.976, 8760.5, 58000000])
  assert.equal(r.embeddedTitle, 'Dune Part Two')
  assert.equal(r.streams.length, 5, 'fonts attached to the file are not streams worth listing')
  const [, atmos, commentary, srt, pgs] = r.streams
  assert.deepEqual([atmos.isAtmos, atmos.isDefault, atmos.channels, atmos.layout, atmos.language], [true, true, 8, '7.1', 'eng'])
  assert.deepEqual([commentary.isAtmos, commentary.title], [false, 'Commentary'])
  assert.deepEqual([srt.isText, pgs.isText, pgs.isForced, pgs.language], [true, false, true, 'fre'])
})

test('HDR10, HLG and plain SDR', () => {
  const v = (color_transfer?: string) => normalizeProbe({ format: {}, streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc', color_transfer }] })
  assert.equal(v('smpte2084').hdr, 'HDR10')
  assert.equal(v('arib-std-b67').hdr, 'HLG')
  assert.equal(v('bt709').hdr, 'SDR')
  assert.equal(v().hdr, 'SDR')
  assert.equal(isHdr10Plus({ frames: [{ side_data_list: [{ side_data_type: 'HDR Dynamic Metadata SMPTE2094-40 (HDR10+)' }] }] }), true)
  assert.equal(isHdr10Plus({ frames: [{ side_data_list: [{ side_data_type: 'Mastering display metadata' }] }] }), false)
})

test('cover art is not the picture; undetermined language is no language', () => {
  const r = normalizeProbe(
    {
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '0' },
      streams: [
        { index: 0, codec_type: 'video', codec_name: 'mjpeg', width: 600, height: 600, disposition: { attached_pic: 1 } },
        { index: 1, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '0/0', r_frame_rate: '25/1' },
        { index: 2, codec_type: 'audio', codec_name: 'aac', channels: 2, tags: { language: 'und' } }
      ]
    },
    '.m4v'
  )
  assert.deepEqual([r.container, r.videoCodec, r.width, r.fps, r.duration], ['mp4', 'h264', 1920, 25, null])
  assert.equal(r.streams.length, 2)
  assert.equal(r.streams[1].language, null)
})

// ---------- Scanning ----------

const fakeProbe = (calls: string[]) => async (path: string): Promise<ProbeResult> => {
  calls.push(path)
  if (path.includes('broken')) throw new Error('not a video')
  return { duration: 60, container: 'mkv', videoCodec: 'h264', width: 1920, height: 1080, fps: 24, bitrate: 1, hdr: 'SDR', dvProfile: null, embeddedTitle: null,
    streams: [{ idx: 0, type: 'video', codec: 'h264', language: null, title: null, channels: null, layout: null, isAtmos: false, isDefault: true, isForced: false, isText: false }] }
}

function library() {
  const dir = mkdtempSync(join(tmpdir(), 'ml-scan-'))
  const root = join(dir, 'Films')
  const put = (rel: string, bytes = 10) => {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, Buffer.alloc(bytes))
    return p
  }
  put('Dune Part Two (2024)/Dune.Part.Two.2024.2160p.mkv')
  put('Arrival (2016).mp4')
  put('Severance/Season 1/Severance.S01E01.mkv')
  put('Severance/Season 1/notes.txt')
  put('Severance/Season 1/poster.jpg')
  put('.hidden/secret.mkv')
  put('$RECYCLE.BIN/deleted.mkv')
  put('broken.avi')
  const db = openDb(join(dir, 'library.db'))
  addFolder(db, root, 1)
  return { db, root, put, folder: () => folderRows(db)[0], done: () => (db.close(), rmSync(dir, { recursive: true, force: true })) }
}

test('finds videos in nested folders and skips hidden, system and non-video files', async () => {
  const lib = library()
  const names = (await findVideos(lib.root)).map((f) => f.path.slice(lib.root.length + 1).replace(/\\/g, '/')).sort()
  assert.deepEqual(names, ['Arrival (2016).mp4', 'Dune Part Two (2024)/Dune.Part.Two.2024.2160p.mkv', 'Severance/Season 1/Severance.S01E01.mkv', 'broken.avi'])
  lib.done()
})

test('first scan reads everything; the next reads only what changed', async () => {
  const lib = library()
  const calls: string[] = []
  const progress: string[] = []
  const first = await scanFolder(lib.db, lib.folder(), fakeProbe(calls), (p) => progress.push(p.phase), { concurrency: 2 })
  assert.deepEqual([first.found, first.added, first.read, first.unreadable], [4, 4, 4, 1])
  assert.deepEqual([progress[0], progress.at(-1)], ['finding', 'done'])
  const row = lib.db.prepare("SELECT width, hdr, probed_at FROM files WHERE path LIKE '%Arrival%'").get() as { width: number; hdr: string; probed_at: number }
  assert.deepEqual([row.width, row.hdr, row.probed_at > 0], [1920, 'SDR', true])
  assert.equal(Number((lib.db.prepare('SELECT COUNT(*) AS n FROM streams').get() as { n: number }).n), 3)
  const [f] = listFolders(lib.db)
  assert.deepEqual([f.items, f.size, f.lastScan > 0], [4, 40, true])

  // Nothing changed: nothing is read again, not even the broken file.
  calls.length = 0
  const second = await scanFolder(lib.db, lib.folder(), fakeProbe(calls))
  assert.deepEqual([second.added, second.changed, second.read, calls.length], [0, 0, 0, 0])

  // One file grows, one appears, one disappears.
  const arrival = join(lib.root, 'Arrival (2016).mp4')
  writeFileSync(arrival, Buffer.alloc(99))
  utimesSync(arrival, new Date(), new Date(Date.now() + 5000))
  lib.put('Inception (2010).mkv')
  rmSync(join(lib.root, 'Severance'), { recursive: true })
  const third = await scanFolder(lib.db, lib.folder(), fakeProbe(calls))
  assert.deepEqual([third.added, third.changed, third.missing, third.read], [1, 1, 1, 2])
  assert.equal(listFolders(lib.db)[0].items, 4, 'the missing episode no longer counts')

  // It comes back (a drive plugged in again): present again, no need to read it.
  lib.put('Severance/Season 1/Severance.S01E01.mkv')
  const back = await scanFolder(lib.db, lib.folder(), fakeProbe(calls))
  assert.deepEqual([back.missing, back.read], [0, 1], 'same size but a new modified time, so it is read once')
  lib.done()
})

test('an unplugged drive changes nothing', async () => {
  const lib = library()
  await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  rmSync(lib.root, { recursive: true })
  const r = await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  assert.equal(r.skipped, 'offline')
  assert.equal(listFolders(lib.db)[0].items, 4)
  lib.done()
})

// ---------- Films and shows from files ----------

import { libraryCounts } from './identify.ts'

test('scanning files films and episodes into items, seasons and episodes', async () => {
  const lib = library()
  lib.put('Dune Part Two (2024)/Dune.Part.Two.2024.1080p.mkv') // a second copy of the same film
  lib.put('Severance/Season 1/Severance.S01E02.mkv')
  lib.put('Severance/Season 2/Severance.S02E01E02.mkv')
  lib.put('Dune Part Two (2024)/Extras/Sandworms.mkv')
  const r = await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  assert.deepEqual(r.identified, { movies: 4, episodes: 3, extras: 1, unknown: 0 })
  // broken.avi looked like a film by name, but it can't be read, so it isn't one.
  assert.deepEqual(libraryCounts(lib.db), { movies: 2, shows: 1, episodes: 4 })
  const titles = lib.db.prepare("SELECT title, year FROM items WHERE kind = 'movie' ORDER BY title").all().map((x) => `${x.title} ${x.year}`)
  assert.deepEqual(titles, ['Arrival 2016', 'Dune Part Two 2024'])
  const seasons = lib.db.prepare('SELECT number, name, (SELECT COUNT(*) FROM episodes e WHERE e.season_id = s.id) AS eps FROM seasons s ORDER BY number').all()
  assert.deepEqual(seasons.map((x) => [x.number, x.name, x.eps]), [[1, 'Season 1', 2], [2, 'Season 2', 2]])
  // Nothing new on the next scan: nothing is filed twice.
  await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  assert.deepEqual(libraryCounts(lib.db), { movies: 2, shows: 1, episodes: 4 })
  lib.done()
})

test('removing a folder removes its films and shows; an unplugged drive keeps them', async () => {
  const lib = library()
  await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  rmSync(join(lib.root, 'Severance'), { recursive: true })
  await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  assert.equal(libraryCounts(lib.db).shows, 1, 'missing episodes keep their show for when the drive returns')
  const { removeFolder } = await import('../db/index.ts')
  const { pruneOrphans } = await import('./identify.ts')
  removeFolder(lib.db, lib.root)
  pruneOrphans(lib.db)
  assert.deepEqual(libraryCounts(lib.db), { movies: 0, shows: 0, episodes: 0 })
  assert.equal(Number((lib.db.prepare('SELECT COUNT(*) AS n FROM seasons').get() as { n: number }).n), 0)
  lib.done()
})

// ---------- What the screens see ----------

import { buildSnapshot, hideFiles, saveProgress, setFavorite, setInList } from './snapshot.ts'

test('the library snapshot: films, shows with seasons, watch state, favourites, My List, hidden files', async () => {
  const lib = library()
  lib.put('Severance/Season 2/Severance.S02E01.mkv')
  await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  let items = buildSnapshot(lib.db)
  const titles = items.map((i) => `${i.kind}:${i.title}`).sort()
  assert.deepEqual(titles, ['movie:Arrival', 'movie:Dune Part Two', 'show:Severance'])
  const show = items.find((i) => i.kind === 'show')!
  assert.deepEqual(show.seasons!.map((s) => [s.number, s.episodes.map((e) => e.number)]), [[1, [1]], [2, [1]]])
  const arrival = items.find((i) => i.title === 'Arrival')!
  assert.equal(arrival.year, 2016)
  assert.equal(arrival.file!.width, 1920)
  assert.equal(arrival.progress, undefined)

  saveProgress(lib.db, arrival.file!.id!, 30, 60)
  setFavorite(lib.db, arrival.id, true)
  setInList(lib.db, show.id, true)
  items = buildSnapshot(lib.db)
  const again = items.find((i) => i.title === 'Arrival')!
  assert.deepEqual([again.progress?.position, again.progress?.watched, again.favorite], [30, false, true])
  assert.equal(items.find((i) => i.kind === 'show')!.inList, true)

  // Finishing it counts a play, once.
  saveProgress(lib.db, arrival.file!.id!, 59, 60)
  saveProgress(lib.db, arrival.file!.id!, 60, 60)
  assert.deepEqual([buildSnapshot(lib.db).find((i) => i.title === 'Arrival')!.playCount], [1])

  hideFiles(lib.db, [arrival.file!.id!])
  assert.equal(buildSnapshot(lib.db).some((i) => i.title === 'Arrival'), false)
  // A rescan doesn't bring a hidden file back.
  await scanFolder(lib.db, lib.folder(), fakeProbe([]))
  assert.equal(buildSnapshot(lib.db).some((i) => i.title === 'Arrival'), false)
  lib.done()
})

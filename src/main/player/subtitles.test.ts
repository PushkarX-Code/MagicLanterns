import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { cuesAt, parseAss, parseSrt } from '../../shared/subs.ts'
import { decodeText, describeSidecar, findSidecars, readSidecar } from './subtitles.ts'

test('SRT and WebVTT become timed lines, keeping italics and nothing else', () => {
  const srt = '﻿1\r\n00:00:01,500 --> 00:00:04,000\r\n<i>Hello</i> <font color="#fff">there</font>\r\nGeneral\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,250\r\nOverlap &amp; more\r\n'
  const cues = parseSrt(srt)
  assert.deepEqual(cues, [
    { start: 1.5, end: 4, text: '<i>Hello</i> there\nGeneral' },
    { start: 3, end: 5.25, text: 'Overlap & more' }
  ])
  const vtt = 'WEBVTT\n\nNOTE skip me\n\n00:01.000 --> 00:02.500 align:start\nShort form\n'
  assert.deepEqual(parseSrt(vtt), [{ start: 1, end: 2.5, text: 'Short form' }])
  assert.deepEqual(cuesAt(cues, 3.5).map((c) => c.text), ['<i>Hello</i> there\nGeneral', 'Overlap & more'])
  assert.deepEqual(cuesAt(cues, 0.5), [])
  assert.deepEqual(cuesAt(cues, 4.5).map((c) => c.start), [3])
})

test('ASS dialogue loses its styling codes and drawings', () => {
  const ass = `[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:02.50,0:00:04.00,Default,,0,0,0,,{\\an8\\i1}Up top,{\\i0} with a comma\\Nsecond line\nDialogue: 0,0:00:05.00,0:00:06.00,Sign,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}\n`
  assert.deepEqual(parseAss(ass), [{ start: 2.5, end: 4, text: '<i>Up top,</i> with a comma\nsecond line' }])
})

test('subtitle files are matched to their film and labelled from the name', () => {
  assert.deepEqual(describeSidecar('/m/Dune.Part.Two.2024.en.forced.srt', 'Dune.Part.Two.2024'), { path: '/m/Dune.Part.Two.2024.en.forced.srt', language: 'en', label: '', forced: true })
  assert.equal(describeSidecar('/m/Subs/3_Spanish.SDH.srt', 'Dune').language, 'es')
  assert.equal(describeSidecar('/m/Subs/3_Spanish.SDH.srt', 'Dune').label, 'SDH')

  const dir = mkdtempSync(join(tmpdir(), 'ml-subs-'))
  const film = join(dir, 'Film')
  mkdirSync(join(film, 'Subs'), { recursive: true })
  for (const f of ['Film.2020.mkv', 'Film.2020.srt', 'Film.2020.fr.ass', 'Other.srt', 'Subs/2_English.srt']) writeFileSync(join(film, f), '')
  assert.deepEqual(
    findSidecars(join(film, 'Film.2020.mkv')).map((s) => [s.path.slice(film.length + 1).replace(/\\/g, '/'), s.language]),
    [['Film.2020.fr.ass', 'fr'], ['Film.2020.srt', 'und'], ['Subs/2_English.srt', 'en']]
  )
  // A season folder: per-episode subtitle folders, never another episode's files.
  const show = join(dir, 'Show')
  mkdirSync(join(show, 'Subs', 'Show.S01E01'), { recursive: true })
  for (const f of ['Show.S01E01.mkv', 'Show.S01E02.mkv', 'Show.S01E02.srt', 'Subs/Show.S01E01/2_English.srt', 'Subs/stray.srt']) writeFileSync(join(show, f), '')
  assert.deepEqual(findSidecars(join(show, 'Show.S01E01.mkv')).map((s) => s.language), ['en'])
  rmSync(dir, { recursive: true })
})

test('older subtitle files are read in the right character set', () => {
  const latin = Uint8Array.from([0x43, 0x61, 0x66, 0xe9]) // "Café" in Windows-1252
  assert.equal(decodeText(latin, 'auto'), 'Café')
  assert.equal(decodeText(new TextEncoder().encode('Café ✓'), 'auto'), 'Café ✓')
  assert.equal(decodeText(Uint8Array.from([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]), 'auto'), 'Hi')
  assert.equal(decodeText(Uint8Array.from([0xcf, 0xf0, 0xe8]), 'windows-1251'), 'При')
  const dir = mkdtempSync(join(tmpdir(), 'ml-subs-'))
  writeFileSync(join(dir, 'a.srt'), Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nCaf\xe9\n', 'latin1'))
  assert.equal(readSidecar(join(dir, 'a.srt'), 'auto')[0].text, 'Café')
  rmSync(dir, { recursive: true })
})

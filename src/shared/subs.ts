// Subtitle text formats, turned into plain timed lines the player draws itself.
// SRT and WebVTT share a shape; ASS/SSA keeps its lines in "Dialogue:" rows with styling codes we drop.

export interface Cue {
  start: number // seconds
  end: number
  text: string // lines separated by \n; <i> and <b> kept, everything else removed
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function seconds(m: RegExpExecArray | null): number | null {
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000
}

/** Keeps italics and bold, drops fonts, colours and positioning, and decodes the common entities. */
export function cleanLine(text: string): string {
  return text
    .replace(/<(\/?)([ib])(?:\s[^>]*)?>/gi, '\u0001$1$2\u0002')
    .replace(/<[^>]*>/g, '')
    .replace(/\u0001(\/?)([ib])\u0002/gi, (_, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** SRT and WebVTT (cue settings, notes and styles are ignored). */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = []
  const blocks = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n')
    const at = lines.findIndex((l) => l.includes('-->'))
    if (at < 0) continue
    const [a, b] = lines[at].split('-->')
    const start = seconds(TIME.exec(a))
    const end = seconds(TIME.exec(b))
    if (start == null || end == null || end <= start) continue
    const body = cleanLine(lines.slice(at + 1).join('\n'))
    if (body) cues.push({ start, end, text: body })
  }
  return cues.sort((x, y) => x.start - y.start)
}

/** ASS/SSA: reads each Dialogue row by the file's own Format line; drawing commands and {\codes} are removed. */
export function parseAss(text: string): Cue[] {
  const cues: Cue[] = []
  let format = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']
  for (const raw of text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n')) {
    const line = raw.trim()
    if (/^format:/i.test(line) && /text\s*$/i.test(line)) format = line.slice(7).split(',').map((s) => s.trim().toLowerCase())
    if (!/^dialogue:/i.test(line)) continue
    const parts = line.slice(9).split(',')
    const field = (name: string): string => parts[format.indexOf(name)]?.trim() ?? ''
    const body = parts.slice(format.indexOf('text')).join(',')
    const start = seconds(TIME.exec(field('start')))
    const end = seconds(TIME.exec(field('end')))
    if (start == null || end == null || end <= start) continue
    if (/\\p[1-9]/.test(body)) continue // vector drawings, not words
    const clean = cleanLine(
      body
        // Italics switch on and off inside override blocks ({\an8\i1}); every other code is dropped.
        .replace(/\{([^}]*)\}/g, (_, codes: string) => (/\\i1/.test(codes) ? '<i>' : /\\i0?(?![a-z\d])/.test(codes) ? '</i>' : ''))
        .replace(/\\N/gi, '\n')
        .replace(/\\h/g, ' ')
    )
    if (clean) cues.push({ start, end, text: clean })
  }
  // Signs and karaoke often split one line into many timed pieces; merge exact repeats.
  cues.sort((x, y) => x.start - y.start || x.end - y.end)
  return cues.filter((c, i) => i === 0 || !(c.text === cues[i - 1].text && c.start === cues[i - 1].start))
}

export function parseSubtitles(text: string, format: string): Cue[] {
  return /^(ass|ssa)$/i.test(format) || /^\s*\[script info\]/i.test(text.slice(0, 200).replace(/^﻿/, '')) ? parseAss(text) : parseSrt(text)
}

/** The lines showing at a moment (several can overlap). `cues` must be sorted by start. */
export function cuesAt(cues: Cue[], t: number): Cue[] {
  // Binary search for the last cue starting at or before t, then walk back over any still showing.
  let lo = 0
  let hi = cues.length - 1
  let last = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].start <= t) {
      last = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  const out: Cue[] = []
  for (let i = last; i >= 0 && i > last - 30; i--) if (cues[i].end > t) out.unshift(cues[i])
  return out
}

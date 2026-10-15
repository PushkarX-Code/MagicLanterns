import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOP, RATE, fingerprint, introChapter, sharedStretch } from './intro.ts'

// A seeded stand-in for a soundtrack: a run of tones that changes every few hundred milliseconds.
function music(seconds: number, seed: number, step = 0.3): Float64Array {
  let s = seed
  const rand = (): number => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const out = new Float64Array(Math.round(seconds * RATE))
  let f1 = 440
  let f2 = 660
  for (let i = 0; i < out.length; i++) {
    if (i % Math.round(step * RATE) === 0) {
      f1 = 260 + rand() * 1500
      f2 = 260 + rand() * 1500
    }
    const t = i / RATE
    out[i] = 0.3 * Math.sin(2 * Math.PI * f1 * t) + 0.2 * Math.sin(2 * Math.PI * f2 * t) + 0.05 * (rand() - 0.5)
  }
  return out
}

function episode(parts: Float64Array[], noiseSeed: number): Int16Array {
  const all = new Int16Array(parts.reduce((n, p) => n + p.length, 0))
  let s = noiseSeed
  let o = 0
  for (const p of parts)
    for (const x of p) all[o++] = Math.max(-32767, Math.min(32767, Math.round((x + 0.02 * (((s = (s * 69069 + 1) % 4294967296) / 4294967296) - 0.5)) * 32767)))
  return all
}

test('the shared opening of two episodes is found wherever it falls', () => {
  const theme = music(40, 7)
  const a = episode([music(20, 101, 0.15), theme, music(90, 102, 0.15)], 1)
  const b = episode([music(95, 201, 0.15), theme, music(30, 202, 0.15)], 2)
  const hit = sharedStretch(fingerprint(a), fingerprint(b))
  assert.ok(hit, 'found a shared stretch')
  const near = (x: number, want: number, tol: number): void => assert.ok(Math.abs(x - want) <= tol, `${x} should be about ${want}`)
  near(hit.a.start, 20, 0.6)
  near(hit.a.end, 60, 0.6)
  near(hit.b.start, 95, 0.6)
  near(hit.b.end, 135, 0.6)
})

test('episodes without a shared intro, or sharing only a short sting, have none', () => {
  const a = episode([music(120, 301, 0.15)], 3)
  const b = episode([music(120, 401, 0.15)], 4)
  assert.equal(sharedStretch(fingerprint(a), fingerprint(b)), null)
  const sting = music(5, 9)
  assert.equal(sharedStretch(fingerprint(episode([music(30, 5, 0.15), sting, music(60, 6, 0.15)], 5)), fingerprint(episode([music(50, 7, 0.15), sting, music(40, 8, 0.15)], 6))), null)
  // Silence matches anything, so it never counts.
  assert.equal(sharedStretch(fingerprint(new Int16Array(RATE * 90)), fingerprint(new Int16Array(RATE * 90))), null)
  assert.equal(HOP / RATE, 0.032)
})

test('a chapter named Intro or Opening is used as is', () => {
  const ch = (title: string, start: number, end: number) => ({ start_time: String(start), end_time: String(end), tags: { title } })
  assert.deepEqual(introChapter([ch('Recap', 0, 60), ch('Opening', 60, 150), ch('Part A', 150, 900)]), { start: 60, end: 150 })
  assert.equal(introChapter([ch('Chapter 1', 0, 300)]), null)
  assert.equal(introChapter([ch('Intro', 0, 2)]), null)
})

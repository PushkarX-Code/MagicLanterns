import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createWatcher } from './watch.ts'

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25))
  return check()
}

test('a new video, even deep inside, asks for one rescan once things go quiet', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ml-watch-'))
  mkdirSync(join(root, 'Severance', 'Season 1'), { recursive: true })
  const settled: string[] = []
  const w = createWatcher((f) => settled.push(f), { quiet: 150 })
  w.sync([root])
  await new Promise((r) => setTimeout(r, 100))
  writeFileSync(join(root, 'Severance', 'Season 1', 'Severance.S01E01.mkv'), 'a')
  writeFileSync(join(root, 'Severance', 'Season 1', 'Severance.S01E02.mkv'), 'b')
  assert.ok(await until(() => settled.length > 0), 'rescan requested')
  await new Promise((r) => setTimeout(r, 300))
  assert.deepEqual(settled, [root], 'two files, one rescan')

  // Files that aren't videos don't count.
  writeFileSync(join(root, 'notes.txt'), 'x')
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(settled.length, 1)

  // An unwatched folder is let go.
  w.sync([])
  writeFileSync(join(root, 'Arrival.2016.mkv'), 'c')
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(settled.length, 1)
  w.close()
  rmSync(root, { recursive: true, force: true })
})

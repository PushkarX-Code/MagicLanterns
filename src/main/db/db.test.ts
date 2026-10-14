import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { MIGRATIONS, addFolder, getSetting, listFolders, migrate, openDb, removeFolder, setSetting } from './index.ts'

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ml-db-'))
  return { db: openDb(join(dir, 'library.db')), file: join(dir, 'library.db'), done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('migrates a new database to the latest version, in WAL mode, with foreign keys on', () => {
  const { db, done } = fresh()
  assert.equal(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version), MIGRATIONS.length)
  assert.equal((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal')
  assert.equal(Number((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys), 1)
  db.close()
  done()
})

test('reopening runs no migration twice and keeps data', () => {
  const { db, file, done } = fresh()
  addFolder(db, 'D:\\Films', 1)
  db.close()
  const again = openDb(file)
  assert.equal(migrate(again), MIGRATIONS.length)
  assert.deepEqual(listFolders(again).map((f) => f.path), ['D:\\Films'])
  again.close()
  done()
})

test('folders: add, ignore duplicates, sum their files, remove with everything inside', () => {
  const { db, done } = fresh()
  assert.equal(addFolder(db, 'D:\\Films', 1), true)
  assert.equal(addFolder(db, 'D:\\Films', 2), false)
  addFolder(db, 'E:\\Anime', 3)
  const id = Number((db.prepare('SELECT id FROM folders WHERE path = ?').get('D:\\Films') as { id: number }).id)
  const insert = db.prepare('INSERT INTO files (folder_id, path, size, mtime, added_at) VALUES (?, ?, ?, 0, 0)')
  insert.run(id, 'D:\\Films\\a.mkv', 100)
  insert.run(id, 'D:\\Films\\b.mkv', 50)
  const [films, anime] = listFolders(db)
  assert.deepEqual([films.items, films.size, films.lastScan], [2, 150, 0])
  assert.deepEqual([anime.path, anime.items, anime.size], ['E:\\Anime', 0, 0])
  assert.equal(removeFolder(db, 'D:\\Films'), true)
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n), 0)
  assert.equal(removeFolder(db, 'D:\\Films'), false)
  db.close()
  done()
})

test('a failed migration leaves the database untouched', () => {
  const { db, done } = fresh()
  MIGRATIONS.push('CREATE TABLE probe (a); THIS IS NOT SQL;')
  try {
    assert.throws(() => migrate(db))
    assert.equal(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version), MIGRATIONS.length - 1)
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'probe'").get(), undefined)
  } finally {
    MIGRATIONS.pop()
  }
  db.close()
  done()
})

test('settings round-trip as JSON', () => {
  const { db, done } = fresh()
  assert.deepEqual(getSetting(db, 'x', { a: 0 }), { a: 0 })
  setSetting(db, 'x', { a: 1 })
  setSetting(db, 'x', { a: 2 })
  assert.deepEqual(getSetting(db, 'x', null), { a: 2 })
  db.close()
  done()
})

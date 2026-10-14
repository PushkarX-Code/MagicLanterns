import { DatabaseSync } from 'node:sqlite'

// The library database. Built-in SQLite (no native module to rebuild for each Windows machine).
// WAL lets the scanner write while the interface reads.

export type Db = DatabaseSync

// Library schema. Each entry runs once, in order; PRAGMA user_version records how far a database has got.
// Never edit a shipped migration: add a new one.

export const MIGRATIONS: string[] = [
  /* 1: everything the library, metadata, player and collections need */ `
  CREATE TABLE folders (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    added_at INTEGER NOT NULL,
    last_scan_at INTEGER
  );

  CREATE TABLE images (
    id INTEGER PRIMARY KEY,
    source_url TEXT NOT NULL UNIQUE,
    local_path TEXT,
    width INTEGER, height INTEGER,
    dominant_color TEXT,
    thumbhash BLOB,
    bytes INTEGER,
    fetched_at INTEGER
  );

  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('movie', 'show')),
    tmdb_id INTEGER, imdb_id TEXT,
    title TEXT NOT NULL, original_title TEXT, sort_title TEXT, year INTEGER,
    tagline TEXT, overview TEXT, runtime INTEGER, certification TEXT, status TEXT,
    rating_tmdb REAL, rating_imdb REAL, rating_rt INTEGER, rating_mc INTEGER, trailer_key TEXT,
    poster_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    backdrop_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    thumb_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    logo_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    fallback_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    match_state TEXT NOT NULL DEFAULT 'pending'
      CHECK (match_state IN ('pending', 'matched', 'low_confidence', 'unmatched', 'manual')),
    match_score REAL,
    favorite INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    meta_fetched_at INTEGER, ratings_fetched_at INTEGER
  );
  CREATE UNIQUE INDEX items_tmdb ON items(kind, tmdb_id) WHERE tmdb_id IS NOT NULL;

  CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL, mtime INTEGER NOT NULL,
    missing INTEGER NOT NULL DEFAULT 0,
    duration REAL, container TEXT, video_codec TEXT,
    width INTEGER, height INTEGER, fps REAL, bitrate INTEGER,
    hdr TEXT, dv_profile INTEGER, embedded_title TEXT,
    parsed_title TEXT, parsed_year INTEGER, parsed_season INTEGER, parsed_episode INTEGER,
    kind TEXT NOT NULL DEFAULT 'unknown' CHECK (kind IN ('movie', 'episode', 'unknown')),
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    probed_at INTEGER, added_at INTEGER NOT NULL
  );
  CREATE INDEX files_folder ON files(folder_id);
  CREATE INDEX files_item ON files(item_id);

  CREATE TABLE streams (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('video', 'audio', 'subtitle')),
    codec TEXT, language TEXT, title TEXT, channels INTEGER, layout TEXT,
    is_atmos INTEGER NOT NULL DEFAULT 0, is_default INTEGER NOT NULL DEFAULT 0,
    is_forced INTEGER NOT NULL DEFAULT 0, is_text INTEGER NOT NULL DEFAULT 0,
    UNIQUE (file_id, idx)
  );

  CREATE TABLE external_subs (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE, language TEXT, format TEXT, forced INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE seasons (
    id INTEGER PRIMARY KEY,
    show_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    number INTEGER NOT NULL, name TEXT, overview TEXT,
    poster_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    air_date TEXT,
    UNIQUE (show_id, number)
  );

  CREATE TABLE episodes (
    id INTEGER PRIMARY KEY,
    show_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL, number INTEGER NOT NULL,
    title TEXT, overview TEXT,
    still_img INTEGER REFERENCES images(id) ON DELETE SET NULL,
    runtime INTEGER, air_date TEXT, rating REAL,
    UNIQUE (show_id, season_number, number)
  );

  -- One file can hold several episodes (S01E01E02).
  CREATE TABLE file_episodes (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, episode_id)
  );

  CREATE TABLE genres (id INTEGER PRIMARY KEY, tmdb_id INTEGER UNIQUE, name TEXT NOT NULL UNIQUE);
  CREATE TABLE item_genres (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, genre_id)
  );

  CREATE TABLE people (
    id INTEGER PRIMARY KEY, tmdb_id INTEGER UNIQUE, name TEXT NOT NULL,
    profile_img INTEGER REFERENCES images(id) ON DELETE SET NULL
  );
  CREATE TABLE credits (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('cast', 'crew')),
    character TEXT, job TEXT, ord INTEGER
  );
  CREATE INDEX credits_item ON credits(item_id);

  -- Frame grabs, hero loops, trickplay sprites, extracted subtitles.
  CREATE TABLE generated (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    type TEXT NOT NULL, local_path TEXT NOT NULL, meta_json TEXT, created_at INTEGER NOT NULL,
    UNIQUE (file_id, type)
  );

  CREATE TABLE playback (
    file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    position REAL NOT NULL DEFAULT 0, duration REAL,
    watched INTEGER NOT NULL DEFAULT 0, play_count INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER, audio_stream INTEGER, subtitle_stream INTEGER
  );

  CREATE TABLE intro_markers (
    show_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    season_number INTEGER, start REAL NOT NULL, "end" REAL NOT NULL
  );

  CREATE TABLE collections (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_system INTEGER NOT NULL DEFAULT 0,
    cover_img INTEGER REFERENCES images(id) ON DELETE SET NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE collection_items (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    ord INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, item_id)
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
  `,
  /* 2: files are grouped into films and shows by a normalised title before any metadata lookup */ `
  ALTER TABLE items ADD COLUMN match_key TEXT;
  CREATE INDEX items_match ON items(kind, match_key);
  `,
  /* 3: files can be taken out of the library without touching the disk */ `
  ALTER TABLE files ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
  INSERT INTO collections (name, is_system, created_at) VALUES ('My List', 1, 0);
  `
]

export function openDb(file: string): Db {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

export function migrate(db: Db): number {
  const at = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  if (at > MIGRATIONS.length) throw new Error(`Library database is from a newer version (${at})`)
  for (let v = at; v < MIGRATIONS.length; v++) {
    // A migration either lands completely or not at all.
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  return MIGRATIONS.length
}

// ---------- Folders ----------

export interface FolderRow {
  path: string
  items: number
  size: number
  /** 0 until the folder's first scan. */
  lastScan: number
}

export function listFolders(db: Db): FolderRow[] {
  return db
    .prepare(
      `SELECT f.path AS path,
              COUNT(fi.id) AS items,
              COALESCE(SUM(fi.size), 0) AS size,
              COALESCE(f.last_scan_at, 0) AS lastScan
       FROM folders f LEFT JOIN files fi ON fi.folder_id = f.id AND fi.missing = 0
       GROUP BY f.id ORDER BY f.added_at`
    )
    .all()
    .map((r) => ({ path: String(r.path), items: Number(r.items), size: Number(r.size), lastScan: Number(r.lastScan) }))
}

/** Case-insensitive on Windows, where C:\Films and c:\films are the same folder. */
const sameFolderSql = process.platform === 'win32' ? 'path = ? COLLATE NOCASE' : 'path = ?'

export function addFolder(db: Db, path: string, now = Date.now()): boolean {
  if (db.prepare(`SELECT 1 FROM folders WHERE ${sameFolderSql}`).get(path)) return false
  db.prepare('INSERT INTO folders (path, added_at) VALUES (?, ?)').run(path, now)
  return true
}

/** Forgets the folder and everything found in it (the files on disk are never touched). */
export function removeFolder(db: Db, path: string): boolean {
  return Number(db.prepare(`DELETE FROM folders WHERE ${sameFolderSql}`).run(path).changes) > 0
}

// ---------- Settings ----------

export function getSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key)
  return row ? (JSON.parse(String(row.value_json)) as T) : fallback
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json').run(
    key,
    JSON.stringify(value)
  )
}

// ---------- Files ----------

export interface KnownFile {
  id: number
  size: number
  mtime: number
  probed: boolean
}

export function folderRows(db: Db): { id: number; path: string }[] {
  return db
    .prepare('SELECT id, path FROM folders WHERE enabled = 1 ORDER BY added_at')
    .all()
    .map((r) => ({ id: Number(r.id), path: String(r.path) }))
}

export function knownFiles(db: Db, folderId: number): Map<string, KnownFile> {
  const rows = db.prepare('SELECT id, path, size, mtime, probed_at FROM files WHERE folder_id = ?').all(folderId)
  return new Map(rows.map((r) => [String(r.path), { id: Number(r.id), size: Number(r.size), mtime: Number(r.mtime), probed: r.probed_at != null }]))
}

export function insertFile(db: Db, folderId: number, f: { path: string; size: number; mtime: number }, now: number): number {
  return Number(
    db.prepare('INSERT INTO files (folder_id, path, size, mtime, added_at) VALUES (?, ?, ?, ?, ?)').run(folderId, f.path, f.size, f.mtime, now)
      .lastInsertRowid
  )
}

/** A file came back or changed on disk: it's present again and needs reading afresh. */
export function touchFile(db: Db, id: number, f: { size: number; mtime: number }, changed: boolean): void {
  if (changed) db.prepare('UPDATE files SET size = ?, mtime = ?, missing = 0, probed_at = NULL WHERE id = ?').run(f.size, f.mtime, id)
  else db.prepare('UPDATE files SET missing = 0 WHERE id = ? AND missing = 1').run(id)
}

/** Files that vanished keep their watch history; they show again if the drive comes back. */
export function markMissing(db: Db, ids: number[]): void {
  const q = db.prepare('UPDATE files SET missing = 1 WHERE id = ?')
  for (const id of ids) q.run(id)
}

export interface ProbeRow {
  duration: number | null
  container: string | null
  videoCodec: string | null
  width: number | null
  height: number | null
  fps: number | null
  bitrate: number | null
  hdr: string
  dvProfile: number | null
  embeddedTitle: string | null
  streams: {
    idx: number
    type: string
    codec: string | null
    language: string | null
    title: string | null
    channels: number | null
    layout: string | null
    isAtmos: boolean
    isDefault: boolean
    isForced: boolean
    isText: boolean
  }[]
}

export function saveProbe(db: Db, fileId: number, p: ProbeRow | null, now: number): void {
  db.exec('BEGIN')
  try {
    if (p) {
      db.prepare(
        `UPDATE files SET duration = ?, container = ?, video_codec = ?, width = ?, height = ?, fps = ?, bitrate = ?,
                          hdr = ?, dv_profile = ?, embedded_title = ?, probed_at = ? WHERE id = ?`
      ).run(p.duration, p.container, p.videoCodec, p.width, p.height, p.fps, p.bitrate, p.hdr, p.dvProfile, p.embeddedTitle, now, fileId)
      db.prepare('DELETE FROM streams WHERE file_id = ?').run(fileId)
      const ins = db.prepare(
        `INSERT INTO streams (file_id, idx, type, codec, language, title, channels, layout, is_atmos, is_default, is_forced, is_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const s of p.streams)
        ins.run(fileId, s.idx, s.type, s.codec, s.language, s.title, s.channels, s.layout, +s.isAtmos, +s.isDefault, +s.isForced, +s.isText)
    } else {
      // Unreadable (damaged or not really a video): remember we tried, so it isn't retried every launch.
      db.prepare('UPDATE files SET probed_at = ? WHERE id = ?').run(now, fileId)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function markScanned(db: Db, folderId: number, now: number): void {
  db.prepare('UPDATE folders SET last_scan_at = ? WHERE id = ?').run(now, folderId)
}

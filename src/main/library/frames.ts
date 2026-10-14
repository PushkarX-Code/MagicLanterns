import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/index.ts'

// Until a film is matched to its artwork (Phase 3), its card shows a frame from the film itself:
// one picture taken 30% of the way in, past the opening titles and usually on a real scene.

export function grabFrame(ffmpeg: string, file: string, duration: number, out: string): Promise<boolean> {
  const at = Math.max(1, duration * 0.3)
  return new Promise((resolve) => {
    execFile(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', out],
      { timeout: 60_000, windowsHide: true },
      (err) => resolve(!err)
    )
  })
}

export async function frameFor(db: Db, ffmpeg: string, dir: string, fileId: number, path: string, duration: number | null): Promise<void> {
  if (!duration) return
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `${fileId}.jpg`)
  if (await grabFrame(ffmpeg, path, duration, out))
    db.prepare(
      "INSERT INTO generated (file_id, type, local_path, created_at) VALUES (?, 'frame', ?, ?) ON CONFLICT(file_id, type) DO UPDATE SET local_path = excluded.local_path, created_at = excluded.created_at"
    ).run(fileId, out, Date.now())
}

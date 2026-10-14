import { statSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import { app, ipcMain } from 'electron'
import type { LibraryFolder } from '@shared/types'
import { addFolder, listFolders, openDb, removeFolder, type Db } from './db'

// The library lives in %APPDATA%/Magic Lanterns/library.db. Folders are stored now; scanning them is the next step.

let db: Db | null = null
const open = (): Db => (db ??= openDb(join(app.getPath('userData'), 'library.db')))

function checkedFolder(path: unknown): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Not a folder path')
  const clean = normalize(path).replace(/[\\/]+$/, '') || path
  if (!statSync(clean, { throwIfNoEntry: false })?.isDirectory()) throw new Error('That folder no longer exists')
  return clean
}

export function initLibrary(): void {
  open()
  ipcMain.handle('library:folders', (): LibraryFolder[] => listFolders(open()))
  ipcMain.handle('library:add-folder', (_e, path: unknown): LibraryFolder[] => {
    addFolder(open(), checkedFolder(path))
    return listFolders(open())
  })
  ipcMain.handle('library:remove-folder', (_e, path: unknown): LibraryFolder[] => {
    if (typeof path === 'string') removeFolder(open(), path)
    return listFolders(open())
  })
  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}

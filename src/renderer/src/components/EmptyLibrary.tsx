import { useEffect, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import type { ScanStatus } from '@shared/types'
import { api } from '../lib/api'
import { useNav } from '../state/nav'
import { PillButton } from './Buttons'

/** Home before anything has been found: one clear way in, and live word while the first scan runs. */
export function EmptyLibrary() {
  const go = useNav((s) => s.go)
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const [hasFolders, setHasFolders] = useState(false)
  useEffect(() => {
    api.getFolders().then((f) => setHasFolders(f.length > 0))
    const bridge = window.lantern
    if (!bridge?.onScan) return
    bridge.scanStatus().then(setScan)
    return bridge.onScan(setScan)
  }, [])

  const add = async (): Promise<void> => {
    const path = await window.lantern?.pickFolder()
    if (path) {
      await api.addFolder(path).catch(() => undefined)
      setHasFolders(true)
    }
  }
  const busy = scan?.scanning
  return (
    <section className="empty-library">
      <div className="empty-glow" />
      <h1 className="t-display empty-title">{busy ? 'Finding your films…' : hasFolders ? 'No films found yet' : 'Your cinema awaits'}</h1>
      <p className="empty-text">
        {busy
          ? scan!.toRead
            ? `Reading ${scan!.read} of ${scan!.toRead} files. They'll appear here as they're ready.`
            : `Looking through your folders · ${scan!.found} found so far`
          : hasFolders
            ? 'Your folders have no video files Magic Lanterns can play yet. Add another folder, or drop films into these ones.'
            : 'Add the folder where your films and shows live. Magic Lanterns finds them, groups the episodes and keeps watching for new ones.'}
      </p>
      <div className="empty-actions">
        <PillButton icon={FolderPlus} focusKey="HERO-PLAY" onPress={add}>
          Add Folder
        </PillButton>
        {hasFolders && (
          <PillButton variant="glass" onPress={() => go('settings')}>
            Library Settings
          </PillButton>
        )}
      </div>
    </section>
  )
}

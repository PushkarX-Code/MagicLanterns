import { FolderOpen, FolderPlus, HardDrive, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { bytes, timeAgo } from '../lib/format'
import { PillButton } from '../components/Buttons'
import { Screen } from '../components/Screen'
import { useFocus } from '../focus/focus'
import type { LibraryFolder } from '@shared/types'

function FolderRow({ f }: { f: LibraryFolder }) {
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({})
  return (
    <div ref={ref} className={`folder glass ${focused ? 'is-focused' : ''}`} {...pointer}>
      <div className="folder-icon">
        <HardDrive size={22} strokeWidth={1.5} />
      </div>
      <div className="folder-main">
        <div className="folder-path">{f.path}</div>
        <div className="folder-meta">
          {f.items} titles · {bytes(f.size)} · Scanned {timeAgo(f.lastScan)}
        </div>
      </div>
      <div className="folder-live">
        <span className="live-dot" /> Watching for changes
      </div>
    </div>
  )
}

export function FoldersScreen() {
  const { data } = useAsync(() => api.getFolders(), [])
  return (
    <Screen id="folders" className="page">
      <header className="page-head">
        <h1 className="t-title">Library Folders</h1>
        <div className="page-count">New files appear on their own. No rescans needed.</div>
      </header>
      <div className="folders">
        {data
          ? data.map((f) => <FolderRow key={f.path} f={f} />)
          : [0, 1].map((i) => <div key={i} className="folder skeleton" style={{ height: 88 }} />)}
      </div>
      <div className="page-actions">
        <PillButton icon={FolderPlus} onPress={() => undefined}>
          Add Folder
        </PillButton>
        <PillButton icon={RefreshCw} variant="glass" onPress={() => undefined}>
          Rescan Library
        </PillButton>
      </div>
      <div className="page-note">
        <FolderOpen size={14} strokeWidth={1.6} /> Scanning arrives with the library engine. Folders shown here are a preview.
      </div>
    </Screen>
  )
}

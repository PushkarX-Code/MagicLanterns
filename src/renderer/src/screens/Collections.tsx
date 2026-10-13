import { useRef } from 'react'
import type { Collection, MediaItem } from '@shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { BlurImage } from '../components/BlurImage'
import { PosterTile } from '../components/PosterTile'
import { scrollPageTo } from '../components/Row'
import { Screen, Quiet } from '../components/Screen'
import { FocusContext, useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav } from '../state/nav'
import { useSettle } from './Library'

/** A collection tile: its first few backdrops fanned like stacked glass slides. */
function CollectionTile({ c, items, onFocused }: { c: Collection; items: MediaItem[]; onFocused: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const members = c.itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean) as MediaItem[]
  const open = (): void => push({ name: 'collection', id: c.id })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    onEnterPress: open,
    onFocus: () => {
      setAmbient(members[0]?.color)
      if (ref.current) onFocused(ref.current)
    }
  })
  useLift(frame, focused, { sheen, scale: 1.05 })
  return (
    <div ref={ref} className={`collection ${focused ? 'is-focused' : ''}`} onClick={open} {...pointer}>
      <div ref={frame} className="collection-frame">
        {members.slice(0, 3).map((m, i) => (
          <div key={m.id} className={`collection-slide s${i}`}>
            <BlurImage path={m.backdrop} size="w780" tiny="w300" color={m.color} />
          </div>
        ))}
        {members.length === 0 && <div className="collection-empty" />}
        <div className="collection-shade" />
        <div className="collection-name">{c.name}</div>
        <div ref={sheen} className="card-sheen" />
      </div>
      <div className="card-meta">
        <div className="card-title">{c.description}</div>
        <div className="card-sub">
          {members.length} title{members.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

function useAllItems() {
  return useAsync(async () => [...(await api.getLibrary('movie')), ...(await api.getLibrary('show'))], [])
}

export function CollectionsScreen() {
  const { data } = useAsync(() => api.getCollections(), [])
  const { data: items } = useAllItems()
  const page = useRef<HTMLDivElement | null>(null)
  const { ref: grid, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'GRID-collections', trackChildren: true, saveLastFocusedChild: true })
  useSettle(grid, !!data && !!items, '.collection')
  return (
    <Screen id="collections" ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">Collections</h1>
        <div className="page-count">{data ? `${data.length} collections` : ' '}</div>
      </header>
      <FocusContext.Provider value={focusKey}>
        <div ref={grid} className="grid grid-wide">
          {data && items
            ? data.map((c) => <CollectionTile key={c.id} c={c} items={items} onFocused={(el) => scrollPageTo(page.current, el, 140)} />)
            : Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="collection">
                  <div className="collection-frame skeleton" />
                </div>
              ))}
        </div>
      </FocusContext.Provider>
    </Screen>
  )
}

export function CollectionScreen({ id, entryKey }: { id: string; entryKey: number }) {
  const { data } = useAsync(() => api.getCollections(), [])
  const { data: items } = useAllItems()
  const page = useRef<HTMLDivElement | null>(null)
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: `GRID-collection-${entryKey}`, trackChildren: true, saveLastFocusedChild: true })
  const c = data?.find((x) => x.id === id)
  const members = c && items ? (c.itemIds.map((i) => items.find((m) => m.id === i)).filter(Boolean) as MediaItem[]) : null
  return (
    <Screen id={`collection-${entryKey}`} ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">{c?.name ?? ' '}</h1>
        <div className="page-count">{c?.description ?? ' '}</div>
      </header>
      {members && members.length === 0 ? (
        <Quiet title="An empty slide tray" line="Add titles from any detail page with the Add to Collection button." />
      ) : (
        <FocusContext.Provider value={focusKey}>
          <div ref={ref} className="grid">
            {(members ?? []).map((m) => (
              <PosterTile key={m.id} item={m} onFocused={(el) => scrollPageTo(page.current, el, 140)} />
            ))}
          </div>
        </FocusContext.Provider>
      )}
    </Screen>
  )
}

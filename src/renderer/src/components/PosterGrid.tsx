import { useRef } from 'react'
import type { MediaItem } from '@shared/types'
import { PosterSkeleton, PosterTile } from './PosterTile'
import { scrollPageTo } from './Row'
import { FocusContext, useFocus } from '../focus/focus'
import { useSettle } from '../lib/useSettle'

/** Poster wall used by Favorites, genres and search. Skeleton tiles until the list arrives. */
export function PosterGrid({ items, page, focusKey }: { items: MediaItem[] | null; page: React.RefObject<HTMLDivElement | null>; focusKey: string }) {
  const { ref, focusKey: key } = useFocus<HTMLDivElement>({ focusKey, saveLastFocusedChild: true, trackChildren: true })
  const wrap = useRef<HTMLDivElement>(null)
  useSettle(wrap, !!items, '.poster')
  return (
    <FocusContext.Provider value={key}>
      <div ref={wrap}>
        <div ref={ref} className="grid">
          {items
            ? items.map((i) => <PosterTile key={i.id} item={i} onFocused={(el) => scrollPageTo(page.current, el, 140)} />)
            : Array.from({ length: 12 }, (_, i) => <PosterSkeleton key={i} />)}
        </div>
      </div>
    </FocusContext.Provider>
  )
}

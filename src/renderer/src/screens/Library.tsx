import { useEffect, useRef, useState } from 'react'
import type { MediaItem, MediaKind } from '@shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { PosterSkeleton, PosterTile } from '../components/PosterTile'
import { Card, CardSkeleton } from '../components/Card'
import { scrollPageTo } from '../components/Row'
import { Screen, Quiet } from '../components/Screen'
import { FocusContext, useFocus } from '../focus/focus'
import { gsap, d, EASE } from '../design/motion'

/** Fade a freshly rendered grid in tile by tile. */
export function useSettle(ref: React.RefObject<HTMLElement | null>, ready: boolean, selector = ':scope > *'): void {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current || !ref.current) return
    done.current = true
    gsap.fromTo(ref.current.querySelectorAll(selector), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: d(0.8), ease: EASE.settle, stagger: 0.035 })
  }, [ready, ref, selector])
}

function Grid({ children, focusKey }: { children: React.ReactNode; focusKey: string }) {
  const { ref, focusKey: key } = useFocus<HTMLDivElement>({ focusKey, saveLastFocusedChild: true, trackChildren: true })
  return (
    <FocusContext.Provider value={key}>
      <div ref={ref} className="grid">
        {children}
      </div>
    </FocusContext.Provider>
  )
}

type Sort = 'title' | 'recent' | 'year'

export function LibraryScreen({ kind }: { kind: MediaKind }) {
  const { data } = useAsync(() => api.getLibrary(kind), [kind])
  const [sort, setSort] = useState<Sort>('title')
  const page = useRef<HTMLDivElement | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  useSettle(grid, !!data, '.poster')

  const sorted = [...(data ?? [])].sort((a: MediaItem, b: MediaItem) =>
    sort === 'recent' ? b.addedAt - a.addedAt : sort === 'year' ? b.year - a.year : a.title.localeCompare(b.title)
  )
  const title = kind === 'movie' ? 'Movies' : 'TV Shows'

  return (
    <Screen id={kind === 'movie' ? 'movies' : 'shows'} ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">{title}</h1>
        <div className="page-count">{data ? `${data.length} ${kind === 'movie' ? 'films' : 'shows'}` : ' '}</div>
        <div className="seg">
          {(['title', 'recent', 'year'] as Sort[]).map((s) => (
            <button key={s} className={`seg-btn ${sort === s ? 'is-active' : ''}`} onClick={() => setSort(s)}>
              {s === 'title' ? 'A–Z' : s === 'recent' ? 'Recently Added' : 'Year'}
            </button>
          ))}
        </div>
      </header>
      <div ref={grid}>
        <Grid focusKey={`GRID-${kind}`}>
          {data
            ? sorted.map((i) => <PosterTile key={i.id} item={i} onFocused={(el) => scrollPageTo(page.current, el, 140)} />)
            : Array.from({ length: 14 }, (_, i) => <PosterSkeleton key={i} />)}
        </Grid>
      </div>
    </Screen>
  )
}

export function ContinueScreen() {
  const { data } = useAsync(() => api.getContinueWatching(), [])
  const page = useRef<HTMLDivElement | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  useSettle(grid, !!data, '.card')
  return (
    <Screen id="continue" ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">Continue Watching</h1>
        <div className="page-count">{data ? `${data.length} in progress` : ' '}</div>
      </header>
      {data && data.length === 0 ? (
        <Quiet title="Nothing in progress" line="Start something and it will wait for you here, right where you left it." />
      ) : (
        <div ref={grid}>
          <Grid focusKey="GRID-continue">
            {data
              ? data.map((c) => <Card key={c.key} card={c} action="play" width={360} onFocused={(el) => scrollPageTo(page.current, el, 140)} />)
              : Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} width={360} />)}
          </Grid>
        </div>
      )}
    </Screen>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { DiscoverList, TrendingTitle } from '@shared/types'
import { BlurImage } from './BlurImage'
import { Row } from './Row'
import { useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav } from '../state/nav'

const LISTS: { id: DiscoverList; title: string }[] = [
  { id: 'week', title: 'Top 10 This Week' },
  { id: 'month', title: 'Top 10 This Month' },
  { id: 'alltime', title: 'Greatest of All Time' },
  { id: 'series', title: 'Must-Watch Series' },
  { id: 'anime', title: 'Must-Watch Anime' }
]

function RankTile({ t, list, onFocused }: { t: TrendingTitle; list: DiscoverList; onFocused: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const open = (): void => push({ name: 'discover', title: t, list })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    onEnterPress: open,
    onFocus: () => {
      setAmbient('#3a2a1a')
      if (ref.current) onFocused(ref.current)
    }
  })
  useLift(frame, focused, { sheen, scale: 1.06 })
  return (
    <div ref={ref} className={`rank ${focused ? 'is-focused' : ''}`} onClick={open} {...pointer}>
      <span className="rank-num" aria-hidden>
        {t.rank}
      </span>
      <div ref={frame} className="poster-frame rank-frame">
        <BlurImage path={t.poster} size="w342" tiny="w92" color="#1c1c20" fallback={<div className="card-fallback">{t.title}</div>} />
        <div className="card-glare" />
        <div ref={sheen} className="card-sheen" />
      </div>
    </div>
  )
}

function DiscoverRow({ list, title, onRowFocus }: { list: DiscoverList; title: string; onRowFocus: (el: HTMLElement) => void }) {
  const [items, setItems] = useState<TrendingTitle[]>([])
  useEffect(() => {
    window.lantern
      ?.getDiscover?.(list)
      .then(setItems)
      .catch(() => undefined)
  }, [list])
  if (!items.length) return null
  return (
    <Row title={title} focusKey={`ROW-discover-${list}`} className="row-topten" onRowFocus={onRowFocus}>
      {(onFocused) => items.map((t) => <RankTile key={`${t.kind}-${t.id}`} t={t} list={list} onFocused={onFocused} />)}
    </Row>
  )
}

/** What the world is watching. Each row renders nothing until it has data (needs a built-in metadata key). */
export function TopTen({ onRowFocus }: { onRowFocus: (el: HTMLElement) => void }) {
  return (
    <>
      {LISTS.map((l) => (
        <DiscoverRow key={l.id} list={l.id} title={l.title} onRowFocus={onRowFocus} />
      ))}
    </>
  )
}

const LABEL: Record<DiscoverList, string> = {
  week: 'this week',
  month: 'this month',
  alltime: 'of all time',
  series: 'in must-watch series',
  anime: 'in must-watch anime'
}
export const listLabel = (list: DiscoverList): string => LABEL[list]

import { useRef } from 'react'
import type { MediaItem } from '@shared/types'
import { BlurImage } from './BlurImage'
import { originOf } from './Card'
import { useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav } from '../state/nav'
import { img } from '../lib/img'

/** 2:3 poster tile for library grids and search results. */
export function PosterTile({ item, focusKey, onFocused }: { item: MediaItem; focusKey?: string; onFocused?: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const open = (): void =>
    push({ name: 'detail', id: item.id, origin: originOf(frame.current, img(item.poster, 'w500'), item.color) })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    focusKey,
    onEnterPress: open,
    onFocus: () => {
      setAmbient(item.color)
      if (ref.current) onFocused?.(ref.current)
    }
  })
  useLift(frame, focused, { sheen, scale: 1.07 })
  const watched = item.kind === 'movie' ? item.progress?.watched : false

  return (
    <div ref={ref} className={`poster ${focused ? 'is-focused' : ''}`} onClick={open} {...pointer}>
      <div ref={frame} className="poster-frame">
        <BlurImage path={item.poster} size="w500" color={item.color} fallback={<div className="card-fallback">{item.title}</div>} />
        {watched && <div className="poster-watched" aria-label="Watched" />}
        <div className="card-glare" />
        <div ref={sheen} className="card-sheen" />
      </div>
      <div className="card-meta">
        <div className="card-title">{item.title}</div>
        <div className="card-sub">{item.kind === 'show' ? `${item.seasons?.length ?? 1} Season${(item.seasons?.length ?? 1) > 1 ? 's' : ''}` : item.year}</div>
      </div>
    </div>
  )
}

export function PosterSkeleton() {
  return (
    <div className="poster">
      <div className="poster-frame skeleton" />
      <div className="card-meta">
        <div className="skeleton sk-line" style={{ width: '70%' }} />
        <div className="skeleton sk-line sk-thin" style={{ width: '30%' }} />
      </div>
    </div>
  )
}

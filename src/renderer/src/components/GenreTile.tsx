import { useRef } from 'react'
import type { GenreTile as Genre } from '@shared/types'
import { BlurImage } from './BlurImage'
import { useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav } from '../state/nav'

/** A genre or collection as a small stack of lit glass slides: three backdrops fanned behind the name. */
export function GenreTile({ genre, onFocused }: { genre: Genre; onFocused?: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const open = (): void => push(genre.collectionId ? { name: 'collection', id: genre.collectionId } : { name: 'genre', genre: genre.name })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    onEnterPress: open,
    onFocus: () => {
      setAmbient(genre.color)
      if (ref.current) onFocused?.(ref.current)
    }
  })
  useLift(frame, focused, { sheen, scale: 1.06 })
  return (
    <div ref={ref} className={`genre ${focused ? 'is-focused' : ''}`} onClick={open} {...pointer}>
      <div ref={frame} className="genre-frame">
        {genre.images.map((src, i) => (
          <div key={src} className={`genre-slide s${i}`}>
            <BlurImage path={src} size="w500" tiny="w92" color={genre.color} />
          </div>
        ))}
        <div className="genre-shade" />
        <div className="genre-name">{genre.name}</div>
        <div className="genre-count">{genre.count} titles</div>
        <div ref={sheen} className="card-sheen" />
      </div>
    </div>
  )
}

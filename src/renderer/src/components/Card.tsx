import { useRef } from 'react'
import type { CardModel } from '@shared/types'
import { BlurImage } from './BlurImage'
import { useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav, type Origin } from '../state/nav'
import { img } from '../lib/img'

interface Props {
  card: CardModel
  focusKey?: string
  /** Continue-watching cards play straight away; everything else opens its detail page. */
  action?: 'detail' | 'play'
  width?: number
  onFocused?: (el: HTMLElement) => void
}

export function originOf(el: HTMLElement | null, src: string | null, color: string): Origin | undefined {
  if (!el) return undefined
  const r = el.getBoundingClientRect()
  return { rect: { x: r.left, y: r.top, width: r.width, height: r.height }, src, color }
}

/** 16:9 art card with title and a quiet subtitle underneath. */
export function Card({ card, focusKey, action = 'detail', width = 296, onFocused }: Props) {
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)

  const open = (): void => {
    if (action === 'play') {
      push({ name: 'player', itemId: card.itemId, episodeId: card.episodeId })
      return
    }
    push({ name: 'detail', id: card.itemId, origin: originOf(frame.current, img(card.image, 'w780'), card.color) })
  }

  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    focusKey,
    onEnterPress: open,
    onFocus: () => {
      setAmbient(card.color)
      if (ref.current) onFocused?.(ref.current)
    }
  })
  useLift(frame, focused, { sheen })

  return (
    <div ref={ref} className={`card ${focused ? 'is-focused' : ''}`} style={{ width }} onClick={open} {...pointer}>
      <div ref={frame} className="card-frame">
        <BlurImage
          path={card.image}
          size="w780"
          tiny="w300"
          color={card.color}
          className="card-art"
          fallback={<div className="card-fallback">{card.title}</div>}
        />
        <div className="card-shade" />
        {card.logo && (
          <BlurImage path={card.logo} size="w500" tiny={false} color="transparent" fit="contain" position="left bottom" className="card-logo" />
        )}
        {card.progress !== undefined && (
          <div className="card-progress">
            <span style={{ width: `${Math.max(3, card.progress * 100)}%` }} />
          </div>
        )}
        <div className="card-glare" />
        <div ref={sheen} className="card-sheen" />
      </div>
      <div className="card-meta">
        <div className="card-title">{card.title}</div>
        <div className="card-sub">{card.subtitle}</div>
      </div>
    </div>
  )
}

export function CardSkeleton({ width = 340 }: { width?: number }) {
  return (
    <div className="card" style={{ width }}>
      <div className="card-frame skeleton" />
      <div className="card-meta">
        <div className="skeleton sk-line" style={{ width: '62%' }} />
        <div className="skeleton sk-line sk-thin" style={{ width: '38%' }} />
      </div>
    </div>
  )
}

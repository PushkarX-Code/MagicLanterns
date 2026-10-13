import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FocusContext, pointerMode, useFocus } from '../focus/focus'
import { gsap, d, EASE } from '../design/motion'

/** Scroll a container so `el` sits comfortably in view. Keyboard focus only; the mouse never yanks the page. */
export function scrollPageTo(container: HTMLElement | null, el: HTMLElement, offset = 120): void {
  if (!container || pointerMode) return
  const c = container.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const target = container.scrollTop + (r.top - c.top) - offset
  gsap.to(container, { scrollTo: { y: Math.max(0, target), autoKill: false }, duration: d(0.7), ease: EASE.glide, overwrite: 'auto' })
}

interface Props {
  title: string
  focusKey?: string
  /** Called when focus enters the row via keyboard, so the page can bring it into view. */
  onRowFocus?: (rowEl: HTMLElement) => void
  children: (onCardFocused: (el: HTMLElement) => void) => ReactNode
  className?: string
}

/** Horizontal row with momentum scrolling and card-aligned snapping. */
export function Row({ title, focusKey, onRowFocus, children, className = '' }: Props) {
  const { ref, focusKey: key, hasFocusedChild } = useFocus<HTMLElement>({
    focusKey,
    saveLastFocusedChild: true,
    trackChildren: true
  })
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: true })

  const updateEdges = (): void => {
    const s = scroller.current
    if (!s) return
    setEdges({ left: s.scrollLeft > 8, right: s.scrollLeft < s.scrollWidth - s.clientWidth - 8 })
  }

  const scrollTo = (x: number): void => {
    const s = scroller.current
    if (!s) return
    s.classList.add('is-tweening')
    gsap.to(s, {
      scrollTo: { x: Math.max(0, Math.min(x, s.scrollWidth - s.clientWidth)), autoKill: false },
      duration: d(0.65),
      ease: EASE.glide,
      overwrite: 'auto',
      onUpdate: updateEdges,
      onComplete: () => s.classList.remove('is-tweening')
    })
  }

  const onCardFocused = (el: HTMLElement): void => {
    if (ref.current) onRowFocus?.(ref.current)
    const s = scroller.current
    if (!s || pointerMode) return
    const pad = parseFloat(getComputedStyle(s).paddingLeft) || 0
    const left = el.offsetLeft - pad
    const right = el.offsetLeft + el.offsetWidth + pad
    if (el.offsetLeft < s.scrollLeft + pad || right > s.scrollLeft + s.clientWidth) scrollTo(left)
  }

  const page = (dir: 1 | -1): void => {
    const s = scroller.current
    if (s) scrollTo(s.scrollLeft + dir * s.clientWidth * 0.8)
  }

  return (
    <FocusContext.Provider value={key}>
      <section ref={ref} className={`row ${hasFocusedChild ? 'has-focus' : ''} ${className}`}>
        <h2 className="row-title t-row">{title}</h2>
        <div className="row-viewport">
          <div ref={scroller} className="row-scroll" onScroll={updateEdges}>
            {children(onCardFocused)}
          </div>
          {edges.left && (
            <button className="row-chevron left glass" onClick={() => page(-1)} aria-label="Scroll left">
              <ChevronLeft size={22} strokeWidth={1.6} />
            </button>
          )}
          {edges.right && (
            <button className="row-chevron right glass" onClick={() => page(1)} aria-label="Scroll right">
              <ChevronRight size={22} strokeWidth={1.6} />
            </button>
          )}
        </div>
      </section>
    </FocusContext.Provider>
  )
}

export function RowSkeleton({ count = 6, children }: { count?: number; children: (i: number) => ReactNode }) {
  return (
    <section className="row">
      <div className="row-title">
        <div className="skeleton sk-line" style={{ width: 180, height: 18 }} />
      </div>
      <div className="row-viewport">
        <div className="row-scroll">{Array.from({ length: count }, (_, i) => children(i))}</div>
      </div>
    </section>
  )
}

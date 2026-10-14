import { forwardRef, useContext, useEffect, useRef, type ReactNode } from 'react'
import { FocusContext, ScreenActive, setFocus, useFocus } from '../focus/focus'

interface Props {
  id: string
  children?: ReactNode
  className?: string
  /** Focus this child key the first time the screen opens (waits for it to mount, e.g. after data loads). */
  initialFocus?: string
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
}

/**
 * A full-height scrolling page that owns one focus region. When it becomes the top screen again
 * (after Back), focus returns to whatever was focused before.
 */
export const Screen = forwardRef<HTMLDivElement, Props>(function Screen({ id, children, className = '', initialFocus, onScroll }, scrollRef) {
  const active = useContext(ScreenActive)
  const key = `SCREEN-${id}`
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: key, saveLastFocusedChild: true, trackChildren: true })
  const visited = useRef(false)

  useEffect(() => {
    if (!active) return
    let timer = 0
    let tries = 0
    let cancelled = false
    // First visit: keep trying the preferred control until it has mounted (e.g. after data loads).
    // Later visits restore whatever was focused last.
    const attempt = (): void => {
      if (cancelled) return
      if (!visited.current && initialFocus) {
        if (document.querySelector(`[data-focus-key="${initialFocus}"]`)) {
          visited.current = true
          setFocus(initialFocus)
          return
        }
        if (++tries < 100) {
          timer = window.setTimeout(attempt, 40)
          return
        }
      }
      if (!visited.current) {
        // No preferred control: land on the first thing you can select once content has loaded.
        const leaf = ref.current?.querySelector<HTMLElement>('[data-focus-leaf]')
        if (leaf?.dataset.focusKey) {
          visited.current = true
          setFocus(leaf.dataset.focusKey)
          return
        }
        if (++tries < 100) {
          timer = window.setTimeout(attempt, 40)
          return
        }
      }
      visited.current = true
      setFocus(focusKey)
    }
    timer = window.setTimeout(attempt, 16)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={(el) => {
          ;(ref as { current: HTMLDivElement | null }).current = el
          if (typeof scrollRef === 'function') scrollRef(el)
          else if (scrollRef) scrollRef.current = el
        }}
        className={`screen ${className}`}
        onScroll={onScroll}
      >
        {children}
      </div>
    </FocusContext.Provider>
  )
})

/** Empty state that still looks intentional: a lit lantern glyph and one quiet line. */
export function Quiet({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return (
    <div className="quiet">
      <div className="quiet-glow" />
      <div className="quiet-title">{title}</div>
      <div className="quiet-line">{line}</div>
      {children}
    </div>
  )
}

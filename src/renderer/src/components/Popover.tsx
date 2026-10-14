import { useEffect, useRef } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { FocusContext, getCurrentFocusKey, setFocus, useFocus } from '../focus/focus'
import { gsap, d, EASE } from '../design/motion'

export interface PopoverOption {
  label: string
  icon?: LucideIcon
  checked?: boolean
  hint?: string
  /** Keep the popover open after selecting (multi-select lists). */
  keepOpen?: boolean
  /** Draw a hairline above this option to start a new group. */
  divider?: boolean
  onSelect: () => void
}

function Option({ opt, onClose }: { opt: PopoverOption; onClose: () => void }) {
  const select = (): void => {
    opt.onSelect()
    if (!opt.keepOpen) onClose()
  }
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ onEnterPress: select })
  const Icon = opt.icon
  return (
    <button ref={ref} className={`pop-opt ${focused ? 'is-focused' : ''}`} onClick={select} {...pointer}>
      <span className="pop-check">{opt.checked ? <Check size={18} strokeWidth={2.2} /> : Icon ? <Icon size={18} strokeWidth={1.7} /> : null}</span>
      <span className="pop-label">{opt.label}</span>
      {opt.hint && <span className="pop-hint">{opt.hint}</span>}
    </button>
  )
}

let popoverSeq = 0

/** Glass popover menu. Traps arrow focus while open, Esc closes and focus returns to the opener. */
export function Popover({
  options,
  onClose,
  onOpenChange,
  title,
  align = 'left',
  placement = 'below'
}: {
  options: PopoverOption[]
  onClose: () => void
  /** Notified on open/close, e.g. so the player can hand arrow keys to the menu. */
  onOpenChange?: (open: boolean) => void
  title?: string
  align?: 'left' | 'right' | 'center'
  placement?: 'below' | 'above'
}) {
  const opener = useRef(getCurrentFocusKey())
  const key = useRef(`POPOVER-${++popoverSeq}`)
  const { ref: panel, focusKey } = useFocus<HTMLDivElement>({ focusKey: key.current, isFocusBoundary: true, trackChildren: true })

  useEffect(() => {
    const el = panel.current
    if (el) gsap.fromTo(el, { opacity: 0, y: placement === 'below' ? -8 : 8, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: d(0.35), ease: EASE.lift })
    onOpenChange?.(true)
    requestAnimationFrame(() => setFocus(key.current))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.stopPropagation()
        e.preventDefault()
        close()
      }
    }
    const onDown = (e: PointerEvent): void => {
      if (panel.current && !panel.current.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      onOpenChange?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = (): void => {
    onClose()
    requestAnimationFrame(() => opener.current && setFocus(opener.current))
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={panel}
        className={`popover glass-strong pop-${align} pop-${placement}`}
      >
        {title && <div className="pop-title">{title}</div>}
        {options.map((o) => (
          <div key={o.label} className="pop-group">
            {o.divider && <div className="pop-divider" />}
            <Option opt={o} onClose={close} />
          </div>
        ))}
      </div>
    </FocusContext.Provider>
  )
}

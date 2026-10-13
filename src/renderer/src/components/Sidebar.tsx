import { useEffect, useRef, useState } from 'react'
import { FolderOpen, House, Settings, Star, type LucideIcon } from 'lucide-react'
import { Clock } from './Clock'
import { Lantern } from './Lantern'
import { FocusContext, setFocus, useFocus } from '../focus/focus'
import { useNav, type Section } from '../state/nav'
import { useSettings } from '../state/settings'
import { gsap, d, EASE } from '../design/motion'

const ITEMS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export const SIDEBAR_KEY = 'SIDEBAR'

function Item({ id, label, icon: Icon, selected, disabled, onSelect }: { id: Section; label: string; icon: LucideIcon; selected: boolean; disabled: boolean; onSelect: (s: Section) => void }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ focusKey: `SIDEBAR-${id}`, disabled, onEnterPress: () => onSelect(id) })
  return (
    <button
      ref={ref}
      className={`sb-item ${selected ? 'is-selected' : ''} ${focused ? 'is-focused' : ''}`}
      onClick={() => onSelect(id)}
      {...pointer}
    >
      <span className="sb-icon">
        <Icon size={20} strokeWidth={selected ? 2 : 1.6} />
      </span>
      <span className="sb-label">{label}</span>
    </button>
  )
}

/** Floating glass sidebar. Collapses to an icon rail while content has focus, opens on hover or left arrow. */
export function Sidebar({ hidden }: { hidden: boolean }) {
  const section = useNav((s) => s.section)
  const go = useNav((s) => s.go)
  const showClock = useSettings((s) => s.settings?.showClock ?? true)
  const [hover, setHover] = useState(false)
  const panel = useRef<HTMLElement>(null)

  const { ref, focusKey, hasFocusedChild } = useFocus<HTMLDivElement>({
    focusKey: SIDEBAR_KEY,
    trackChildren: true,
    saveLastFocusedChild: false,
    preferredChildFocusKey: `SIDEBAR-${section}`,
    disabled: hidden
  })
  const open = !hidden && (hover || hasFocusedChild)

  useEffect(() => {
    const el = panel.current
    if (!el) return
    const css = getComputedStyle(document.documentElement)
    gsap.to(el, {
      width: parseFloat(css.getPropertyValue(open ? '--rail-open' : '--rail')),
      duration: d(0.5),
      ease: EASE.lift,
      overwrite: 'auto'
    })
    el.classList.toggle('is-open', open)
  }, [open])

  useEffect(() => {
    if (panel.current) gsap.to(panel.current, { autoAlpha: hidden ? 0 : 1, x: hidden ? -24 : 0, duration: d(0.45) })
  }, [hidden])

  const select = (s: Section): void => {
    // Selecting the section you're already on just hands focus back to its content.
    if (s === section && useNav.getState().stack.length === 1) setFocus(`SCREEN-${s}`)
    else go(s) // the new screen takes focus itself once its content has loaded
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={`sidebar-wrap ${open ? 'is-open' : ''}`}>
        <div className="sidebar-dim" />
        <nav ref={panel} className="sidebar glass" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <div className="sb-brand">
            <div className="sb-mark">
              <Lantern size={30} />
            </div>
            <div className="sb-who">
              <div className="sb-name">Magic Lanterns</div>
              {showClock && <Clock className="sb-clock" />}
            </div>
          </div>
          <div className="sb-items">
            {ITEMS.map((it) => (
              <Item key={it.id} {...it} selected={section === it.id} disabled={hidden} onSelect={select} />
            ))}
          </div>
          {showClock && (
            <div className="sb-foot">
              <Clock />
            </div>
          )}
        </nav>
      </div>
    </FocusContext.Provider>
  )
}

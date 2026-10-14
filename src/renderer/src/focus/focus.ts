// Ten-foot focus engine. norigin-spatial-navigation handles the arrow-key geometry;
// this wrapper adds mouse parity (hover = focus) and per-screen activation so hidden screens
// kept alive underneath the current one can never steal focus.

import { createContext, useContext, useEffect } from 'react'
import {
  init,
  setFocus,
  getCurrentFocusKey,
  pause as pauseFocus,
  resume as resumeFocus,
  useFocusable,
  GetBoundingClientRectAdapter,
  type UseFocusableConfig
} from '@noriginmedia/norigin-spatial-navigation'

export function initFocus(): void {
  init({
    layoutAdapter: GetBoundingClientRectAdapter,
    distanceCalculationMethod: 'center'
  })
}

/** False for screens that are mounted but not on top of the stack. */
export const ScreenActive = createContext(true)

/**
 * Last input device. Only real cursor travel counts: browsers fire synthetic mouse events when content
 * scrolls under a resting cursor, and those must never steal focus from keyboard navigation.
 */
export let pointerMode = false
let lastX = -1
let lastY = -1
window.addEventListener(
  'pointermove',
  (e) => {
    if (Math.abs(e.screenX - lastX) + Math.abs(e.screenY - lastY) > 2) pointerMode = true
    lastX = e.screenX
    lastY = e.screenY
  },
  { passive: true }
)
window.addEventListener('keydown', () => (pointerMode = false), { capture: true })

export function useFocus<E extends HTMLElement = HTMLDivElement>(config: UseFocusableConfig & { disabled?: boolean } = {}) {
  const active = useContext(ScreenActive)
  const { disabled, ...rest } = config
  const f = useFocusable<object, E>({ ...rest, focusable: active && !disabled && rest.focusable !== false })
  // Expose the key in the DOM so screens can tell when a preferred control has actually mounted.
  useEffect(() => {
    const el = f.ref.current as HTMLElement | null
    if (!el) return
    el.dataset.focusKey = f.focusKey
    // Containers (rows, grids, screens) track children; everything else is something you can land on.
    if (!rest.trackChildren) el.dataset.focusLeaf = ''
  })
  /** Spread onto the element: hover focuses, click activates. */
  const pointer = {
    onMouseEnter: () => {
      if (pointerMode && active && !disabled) f.focusSelf()
    },
    onMouseMove: () => {
      // Entering while the keyboard was in charge: the first real movement takes focus.
      if (pointerMode && active && !disabled && !f.focused) f.focusSelf()
    }
  }
  return { ...f, pointer }
}

export { setFocus, getCurrentFocusKey, pauseFocus, resumeFocus }
export { FocusContext } from '@noriginmedia/norigin-spatial-navigation'

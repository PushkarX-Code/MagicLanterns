import { gsap, reduceMotion } from './motion'

// Apple-style press feedback for everything you can select: it sinks under the finger, then springs back
// with a little overshoot. Driven by a CSS variable on the independent `scale` property, so it stacks on
// top of the focus lift (which owns `transform`) instead of fighting it.

const PRESSABLE = 'button:not(:disabled), [data-focus-leaf], .seg-btn'

/** Bigger surfaces travel less, like a card versus a button on tvOS. */
function depth(el: HTMLElement): number {
  const w = el.offsetWidth
  return w > 420 ? 0.975 : w > 160 ? 0.955 : 0.9
}

function down(el: HTMLElement): void {
  gsap.to(el, { '--press': depth(el), duration: 0.12, ease: 'power2.out', overwrite: 'auto' })
}

function up(el: HTMLElement): void {
  gsap.to(el, { '--press': 1, duration: 0.75, ease: 'elastic.out(1.1, 0.42)', overwrite: 'auto' })
}

function target(node: EventTarget | null): HTMLElement | null {
  const n = node as HTMLElement | null
  if (!n?.closest || n.closest('.no-press')) return null // e.g. slider tracks: dragging, not pressing
  return n.closest(PRESSABLE) as HTMLElement | null
}

export function initPressFeedback(): void {
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || reduceMotion()) return
      const el = target(e.target)
      if (!el) return
      down(el)
      const release = (): void => {
        up(el)
        window.removeEventListener('pointerup', release, true)
        window.removeEventListener('pointercancel', release, true)
      }
      window.addEventListener('pointerup', release, true)
      window.addEventListener('pointercancel', release, true)
    },
    true
  )

  // Remote / keyboard: Enter taps whatever has focus.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.repeat || reduceMotion()) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      const el = target(document.querySelector('[data-focus-leaf].is-focused'))
      if (!el) return
      gsap
        .timeline({ overwrite: 'auto' })
        .to(el, { '--press': depth(el), duration: 0.09, ease: 'power2.out' })
        .to(el, { '--press': 1, duration: 0.75, ease: 'elastic.out(1.1, 0.42)' })
    },
    true
  )
}

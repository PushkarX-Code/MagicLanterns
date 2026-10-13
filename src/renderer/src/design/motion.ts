import { gsap } from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'

gsap.registerPlugin(ScrollToPlugin)

// One vocabulary of motion for the whole app: things lift, glow and settle.
export const EASE = {
  lift: 'power3.out', // focus, hover
  settle: 'expo.out', // content arriving
  glide: 'power2.inOut', // scrolling, crossfades
  flight: 'expo.inOut' // shared-element card → page
} as const

export const DUR = {
  micro: 0.22,
  focus: 0.42,
  fade: 0.6,
  settle: 0.9,
  flight: 0.78,
  ambient: 1.4
} as const

gsap.defaults({ ease: EASE.lift, duration: DUR.focus })

let reduced = false
const media = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Called by the settings store. The OS preference always wins when it asks for less motion. */
export function setReduceMotion(userWantsReduced: boolean): void {
  reduced = userWantsReduced || media.matches
  document.documentElement.classList.toggle('reduce-motion', reduced)
}
media.addEventListener('change', () => setReduceMotion(reduced))

export const reduceMotion = (): boolean => reduced

/** Duration helper: transform-heavy motion collapses to a short fade when motion is reduced. */
export const d = (seconds: number): number => (reduced ? Math.min(seconds, 0.2) : seconds)

export { gsap }

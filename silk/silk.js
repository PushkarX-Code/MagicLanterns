/**
 * Silk — Pushkar's motion engine. One vocabulary of motion for every app, site and film:
 * things lift, glow and settle. Light leads, blur is depth of field, nothing snaps.
 *
 * Framework-free ES module on top of GSAP (free, incl. plugins). Works with npm (`import { gsap } from 'gsap'`)
 * or a global `window.gsap`. Rules, tokens and changelog: silk/MOTION.md. CSS twin: silk/silk.css (generated).
 *
 *   import { gsap } from 'gsap'
 *   import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
 *   import * as silk from './silk.js'
 *   silk.use(gsap, { DrawSVGPlugin })
 *   silk.settle('.card')
 */

export const VERSION = '1.0.0'

/* ------------------------------------------------------------------ tokens */

/** Eases, by intent. Never pick a raw ease in product code; pick the intent. */
export const EASE = {
  lift: 'power3.out', // focus, hover, small responses
  settle: 'expo.out', // content arriving and coming to rest
  glide: 'power2.inOut', // scrolling, crossfades, things moving between two rests
  flight: 'expo.inOut', // shared element travelling to a new place (card → page)
  draw: 'power3.inOut', // strokes and light drawing themselves
  exit: 'power2.in', // leaving: accelerates away, never decelerates
  sink: 'power2.out', // press down
  spring: 'elastic.out(1.1, 0.42)', // press release; small things only
  pop: 'back.out(1.5)', // a small mark arriving (icon core, badge, dot)
  breathe: 'sine.inOut', // ambient loops
  scrub: 'none', // anything driven by scroll position
}

/** Durations in seconds. Big things move slower; exits are ~0.65× their entrance. */
export const DUR = {
  press: 0.12,
  micro: 0.22,
  focus: 0.42,
  fade: 0.6,
  spring: 0.75,
  flight: 0.78,
  settle: 0.9,
  draw: 1.4,
  ambient: 1.4,
  reveal: 1.6, // hero focus pull
  title: 2.0, // a name or title card
}

/** Rhythm between items. */
export const STAGGER = { list: 0.03, group: 0.08, hero: 0.12, draw: 0.18 }

/** How far things travel (px) and how soft they start (blur px). */
export const DIST = { settle: 18, reveal: 40, scroll: 56, exit: 90 }
export const BLUR = { settle: 0, reveal: 16, scroll: 18, title: 22, exit: 14, motionMax: 9 }

/** Lift (focus/hover) and press depths. */
export const LIFT = { scale: 1.08, rise: 6, tilt: 7, sheen: 1.1 }
export const PRESS = { large: 0.975, medium: 0.955, small: 0.9 } // width > 420, > 160, else

/** Scroll smoothing: how heavily scroll-linked motion lags behind the wheel. */
export const SCROLL = { smooth: 1.8, scrub: 1.4 }

/* ------------------------------------------------------------------ setup */

let G = typeof window !== 'undefined' ? window.gsap : undefined
let P = {}
let reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Hand Silk your gsap instance and any plugins you use (DrawSVGPlugin, MorphSVGPlugin, Flip, ScrollTrigger…). */
export function use(gsap, plugins = {}) {
  G = gsap
  P = { ...P, ...plugins }
  const list = Object.values(plugins).filter(Boolean)
  if (list.length) G.registerPlugin(...list)
  G.defaults({ ease: EASE.lift, duration: DUR.focus })
  return G
}

/** Less motion when the OS or the user asks for it. The OS preference always wins. */
export function setReduceMotion(on) {
  reduced = !!on || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduce-motion', reduced)
}
export const reduceMotion = () => reduced

/** Duration helper: under reduced motion everything collapses to a short fade. */
export const d = (s) => (reduced ? Math.min(s, 0.2) : s)

const g = () => {
  if (!G) throw new Error('silk: call silk.use(gsap) first')
  return G
}

/* ------------------------------------------------------------------ moves */

/** Content arriving: rises a little and comes to rest. Lists, grids, freshly loaded tiles. */
export function settle(targets, o = {}) {
  return g().fromTo(
    targets,
    { opacity: 0, y: o.y ?? DIST.settle },
    { opacity: 1, y: 0, duration: d(o.duration ?? DUR.settle), ease: EASE.settle, stagger: o.stagger ?? STAGGER.list, delay: o.delay ?? 0 }
  )
}

/** The signature reveal: out of soft focus into sharp, like a lens pulling focus. Headlines, hero copy. */
export function focusPull(targets, o = {}) {
  const blur = reduced ? 0 : o.blur ?? BLUR.reveal
  return g().fromTo(
    targets,
    { opacity: 0, y: reduced ? 0 : o.y ?? DIST.reveal, scale: o.scale ?? 1, filter: `blur(${blur}px)` },
    { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: d(o.duration ?? DUR.reveal), ease: EASE.settle, stagger: o.stagger ?? STAGGER.hero, delay: o.delay ?? 0 }
  )
}

/** A name or title card: focus pull with a slight scale-down and wider letterspacing settling in. */
export function title(name, kicker, o = {}) {
  const tl = g().timeline({ delay: o.delay ?? 0 })
  if (kicker) tl.fromTo(kicker, { opacity: 0, y: 14, letterSpacing: '0.7em' }, { opacity: 1, y: 0, letterSpacing: o.spacing ?? '0.42em', duration: d(DUR.reveal), ease: EASE.settle }, 0)
  tl.fromTo(
    name,
    { opacity: 0, y: reduced ? 0 : 30, scale: reduced ? 1 : 1.04, filter: `blur(${reduced ? 0 : BLUR.title}px)` },
    { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: d(DUR.title), ease: EASE.settle },
    kicker ? 0.35 : 0
  )
  return tl
}

/** Leaving: faster than arriving, accelerating away into blur. */
export function exit(targets, o = {}) {
  return g().to(targets, {
    opacity: 0,
    y: reduced ? 0 : -(o.y ?? DIST.exit) * 0.4,
    filter: `blur(${reduced ? 0 : BLUR.exit}px)`,
    duration: d(o.duration ?? DUR.fade * 0.65),
    ease: EASE.exit,
    stagger: o.stagger ?? STAGGER.list,
  })
}

/** Strokes drawing themselves from their middle outwards, outermost last. Needs DrawSVGPlugin. */
export function drawOn(paths, o = {}) {
  return g().fromTo(
    paths,
    { drawSVG: reduced ? '0% 100%' : '50% 50%' },
    { drawSVG: '0% 100%', duration: d(o.duration ?? DUR.draw), ease: EASE.draw, stagger: { each: o.stagger ?? STAGGER.draw, from: o.from ?? 'end' }, delay: o.delay ?? 0 }
  )
}

/** A small mark arriving from its base with a little overshoot (icon core, badge, dot). */
export function pop(targets, o = {}) {
  return g().fromTo(
    targets,
    { scaleY: o.axis === 'xy' ? 1 : 0, scale: o.axis === 'xy' ? 0 : 1, transformOrigin: o.origin ?? '50% 100%' },
    { scaleY: 1, scale: 1, duration: d(o.duration ?? 0.8), ease: EASE.pop, delay: o.delay ?? 0 }
  )
}

/** Crossfade between two states (screens, tabs, images). */
export function crossfade(from, to, o = {}) {
  const tl = g().timeline()
  if (from) tl.to(from, { opacity: 0, filter: `blur(${reduced ? 0 : 6}px)`, duration: d(DUR.fade * 0.65), ease: EASE.exit }, 0)
  if (to) tl.fromTo(to, { opacity: 0, filter: `blur(${reduced ? 0 : 6}px)` }, { opacity: 1, filter: 'blur(0px)', duration: d(o.duration ?? DUR.fade), ease: EASE.glide }, o.overlap ?? 0.12)
  return tl
}

/**
 * Focus / hover lift: scales up, rises, tilts toward the pointer, and a glass sheen sweeps across.
 * Returns { on(), off(), destroy() }. `sheen` is an optional child element that sweeps. Writes --glare-x/-y
 * (pointer position) and --glare-o (0→1 while lifted) for a CSS glare highlight.
 */
export function lift(el, o = {}) {
  const { scale = LIFT.scale, rise = LIFT.rise, tilt = LIFT.tilt, sheen } = o
  const G = g()
  G.set(el, { transformPerspective: 900, transformOrigin: '50% 50%' })
  const rx = G.quickTo(el, 'rotationX', { duration: 0.5, ease: EASE.lift })
  const ry = G.quickTo(el, 'rotationY', { duration: 0.5, ease: EASE.lift })
  let active = false
  const move = (e) => {
    if (!active || reduced) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ry(px * tilt)
    rx(-py * tilt)
    el.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`)
    el.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`)
  }
  const on = () => {
    active = true
    G.to(el, { scale: reduced ? 1 : scale, y: reduced ? 0 : -rise, '--glare-o': 1, zIndex: 5, duration: DUR.focus, ease: EASE.lift, overwrite: 'auto' })
    if (sheen && !reduced) G.fromTo(sheen, { xPercent: -130, opacity: 1 }, { xPercent: 130, duration: LIFT.sheen, ease: EASE.glide })
  }
  const off = () => {
    active = false
    rx(0)
    ry(0)
    G.to(el, { scale: 1, y: 0, '--glare-o': 0, zIndex: 1, duration: DUR.focus * 0.9, ease: EASE.lift, overwrite: 'auto' })
  }
  el.addEventListener('pointermove', move)
  if (o.hover !== false) {
    el.addEventListener('pointerenter', on)
    el.addEventListener('pointerleave', off)
  }
  return {
    on,
    off,
    destroy() {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerenter', on)
      el.removeEventListener('pointerleave', off)
    },
  }
}

/**
 * Press feedback for everything you can press: sinks under the finger, springs back.
 * Drives the CSS variable `--press` on the independent `scale` property (see silk.css), so it stacks on
 * top of a lift instead of fighting it. Bigger surfaces travel less.
 */
export function initPress(selector = 'button:not(:disabled), [data-press]') {
  const G = g()
  const depth = (el) => (el.offsetWidth > 420 ? PRESS.large : el.offsetWidth > 160 ? PRESS.medium : PRESS.small)
  const find = (n) => (n?.closest && !n.closest('.no-press') ? n.closest(selector) : null)
  const down = (el) => G.to(el, { '--press': depth(el), duration: DUR.press, ease: EASE.sink, overwrite: 'auto' })
  const up = (el) => G.to(el, { '--press': 1, duration: DUR.spring, ease: EASE.spring, overwrite: 'auto' })
  const onDown = (e) => {
    if (e.button !== 0 || reduced) return
    const el = find(e.target)
    if (!el) return
    down(el)
    const release = () => {
      up(el)
      removeEventListener('pointerup', release, true)
      removeEventListener('pointercancel', release, true)
    }
    addEventListener('pointerup', release, true)
    addEventListener('pointercancel', release, true)
  }
  addEventListener('pointerdown', onDown, true)
  return () => removeEventListener('pointerdown', onDown, true)
}

/** One full press (sink, then spring back), for keyboard / remote Enter or demos. */
export function pressOnce(el) {
  const depth = el.offsetWidth > 420 ? PRESS.large : el.offsetWidth > 160 ? PRESS.medium : PRESS.small
  return g()
    .timeline()
    .to(el, { '--press': reduced ? 1 : depth, duration: 0.09, ease: EASE.sink })
    .to(el, { '--press': 1, duration: DUR.spring, ease: EASE.spring })
}

/**
 * Shared-element flight (card → page) with Flip. Call `const s = silk.flightStart(els)` before the DOM change,
 * then `silk.flight(s)` after it. Needs Flip registered via use().
 */
const flip = () => P.Flip ?? (typeof window !== 'undefined' ? window.Flip : undefined)
export const flightStart = (targets) => flip().getState(targets)
export function flight(state, o = {}) {
  const Flip = flip()
  return Flip.from(state, { duration: d(o.duration ?? DUR.flight), ease: EASE.flight, absolute: true, scale: true, nested: true, ...o })
}

/**
 * Motion blur from scroll speed, the site's signature. Feed it a velocity source (px/s): a ScrollSmoother,
 * a Lenis instance, or any () => number. Writes --mb (blur px) and --ms (vertical stretch) on <html>;
 * elements with class `.silk-mb` (silk.css) pick them up. Returns a stop function.
 */
export function motionBlur(source, o = {}) {
  const read = typeof source === 'function' ? source : () => source.getVelocity?.() ?? source.velocity ?? 0
  const max = o.max ?? BLUR.motionMax, per = o.per ?? 620, root = document.documentElement
  let blur = 0
  const tick = () => {
    const v = reduced ? 0 : Math.abs(read())
    blur += (Math.min(v / per, max) - blur) * 0.12
    if (blur < 0.03) blur = 0
    root.style.setProperty('--mb', blur.toFixed(2) + 'px')
    root.style.setProperty('--ms', (1 + blur * 0.008).toFixed(4))
  }
  g().ticker.add(tick)
  return () => g().ticker.remove(tick)
}

/** Scroll-linked focus pull for sections arriving on screen. Needs ScrollTrigger. */
export function scrollReveal(targets, o = {}) {
  return g().utils.toArray(targets).map((el) =>
    g().fromTo(
      el,
      { opacity: 0, y: reduced ? 0 : DIST.scroll, filter: `blur(${reduced ? 0 : BLUR.scroll}px)` },
      { opacity: 1, y: 0, filter: 'blur(0px)', ease: EASE.scrub, scrollTrigger: { trigger: el, start: o.start ?? 'top 92%', end: o.end ?? 'top 55%', scrub: SCROLL.scrub } }
    )
  )
}

/** Light switching on: opacity and a CSS custom property (e.g. a beam's --spread) opening up. */
export function illuminate(el, o = {}) {
  const from = o.from ?? {}, to = o.to ?? {}
  return g().fromTo(el, { opacity: 0, ...from }, { opacity: o.opacity ?? 1, ...to, duration: d(o.duration ?? 2.2), ease: EASE.settle, delay: o.delay ?? 0 })
}

/** A slow ambient loop (glow, drift). Paused under reduced motion. */
export function breathe(targets, vars, o = {}) {
  if (reduced) return null
  return g().to(targets, { ...vars, duration: o.duration ?? DUR.ambient * 3, ease: EASE.breathe, yoyo: true, repeat: -1 })
}

/** Numbers rolling up to a value (stats, counters). */
export function count(el, to, o = {}) {
  const obj = { v: o.from ?? 0 }
  return g().to(obj, {
    v: to,
    duration: d(o.duration ?? DUR.reveal),
    ease: EASE.settle,
    onUpdate: () => (el.textContent = (o.format ?? ((n) => Math.round(n).toLocaleString()))(obj.v)),
  })
}

# Silk: the motion engine

Every animated thing Pushkar ships moves the same way. Silk is that signature. The code is `silk/silk.js`, the CSS twin is `silk/silk.css` (generated, never hand-edited) and the demo is `silk/demo.html`.

**The idea in one line: things lift, glow and settle.** Light leads, blur is depth of field, nothing snaps.

## Principles

1. **Arrive slow, leave fast.** Entrances decelerate and settle (`expo.out`). Exits accelerate away (`power2.in`) at about 0.65× the entrance time.
2. **Focus, not fade.** Important things come out of soft focus: opacity, a little travel and blur (16 px or so) resolving to sharp, like a lens pulling focus. Plain fades are for small UI only.
3. **Big moves slow, small moves quick.** A page flight takes 0.78 s; a hover takes 0.42 s; a press takes 0.12 s. Large surfaces travel less (a wide card presses to 0.975, a small button to 0.9).
4. **Overshoot is earned.** Springs and overshoot only on small things the user touched (press release, an icon core arriving). Never on pages, panels or text.
5. **Light is motion.** Glows, sheens and beams open up, sweep and breathe. A sheen crosses a card when it lifts, and a beam widens when something switches on.
6. **Speed shows as blur.** Fast scroll smears content (motion blur from velocity, up to 9 px) and it sharpens as it slows.
7. **Rhythm.** Lists stagger 0.03 s, groups 0.08 s, hero sequences 0.12 s, strokes 0.18 s (outermost last).
8. **Scroll is heavy.** Scroll-linked motion is scrubbed with lag (`scrub: 1.4`, smoothing 1.8). It is the only place linear easing is allowed.
9. **Cheap to draw.** Animate transform, opacity, filter and CSS variables only. Never layout properties.
10. **Less when asked.** Reduced motion (OS or in-app) collapses everything to ≤ 0.2 s fades, with no travel, blur, tilt or loops.

## Tokens

| Intent | Ease | Typical duration |
|---|---|---|
| `lift` (hover, focus) | `power3.out` | 0.42 s |
| `settle` (arriving) | `expo.out` | 0.9 s |
| `glide` (between two rests, crossfade) | `power2.inOut` | 0.6 s |
| `flight` (shared element) | `expo.inOut` | 0.78 s |
| `draw` (strokes, light) | `power3.inOut` | 1.4 s |
| `exit` | `power2.in` | 0.65× entrance |
| `sink` → `spring` (press) | `power2.out` → `elastic.out(1.1, 0.42)` | 0.12 s → 0.75 s |
| `pop` (small mark) | `back.out(1.5)` | 0.8 s |
| `breathe` (ambient loop) | `sine.inOut` | 4.2 s |
| `scrub` (scroll-linked) | `none` | scroll |

Distances: settle 18 px, reveal 40 px, scroll reveal 56 px, exit 90 px. Blur: reveal 16, scroll 18, title 22, exit 14, motion max 9. Lift: scale 1.08, rise 6 px, tilt 7°, sheen 1.1 s.

## Moves

| Move | Use it for |
|---|---|
| `settle(targets)` | Lists, grids, freshly loaded content |
| `focusPull(targets)` | Headlines, hero copy, anything that matters |
| `title(name, kicker)` | Name cards, end cards, chapter titles |
| `exit(targets)` | Anything leaving |
| `drawOn(paths)` + `pop(core)` | Logos and icons drawing themselves |
| `lift(el, { sheen })` | Cards and tiles on hover or focus (tilt, glare, sheen) |
| `initPress()` / `pressOnce(el)` | Every pressable thing |
| `crossfade(from, to)` | Tabs, screens, image swaps |
| `flightStart()` + `flight()` | Card → detail page (Flip) |
| `motionBlur(velocity)` + `.silk-mb` | Smooth-scrolled pages and reels |
| `scrollReveal(targets)` | Sections arriving while scrolling |
| `illuminate(el)` | Light switching on (beams, glows) |
| `breathe(targets, vars)` | Slow ambient loops |
| `count(el, to)` | Numbers rolling up |

## Using it

```js
import { gsap } from 'gsap'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import * as silk from './silk/silk.js'

silk.use(gsap, { DrawSVGPlugin })
silk.initPress()
silk.focusPull('.hero h1')
silk.settle('.grid > *')
```

CSS-only places use the variables: `transition: transform var(--silk-dur-focus) var(--silk-ease-lift)`. The `--silk-ease-*` values are the GSAP curves sampled into CSS `linear()`, so CSS and JS move identically, springs included.

## Changing Silk

Silk keeps growing. Each time Pushkar approves a new animation or a tweak in any project:

1. Add or change it in `silk/silk.js`, as a token if it is a value or a move if it is a pattern.
2. Run `node silk/build.mjs` to regenerate `silk.css`.
3. Add it to the demo if it is a new move, and record a demo for approval.
4. Bump `VERSION` (patch for a tweak, minor for a new move, major if existing motion changes) and log it below.

Only approved motion goes in. Experiments stay in their project until approved.

## Changelog

- **1.0.0** (16 Oct 2026): first version, built from the motion already approved in Magic Lanterns (lift, press, settle, flight) and its website (focus pull, title card, draw-on, motion blur, scroll reveal, beam).

import { useEffect, useRef, type RefObject } from 'react'

// Ambient Light: a tiny copy of every frame, blown up and blurred behind the picture, so the letterbox bars
// carry the film's own light. Turning it off fades the light out slowly; nothing in Cinema Mode snaps.

/** The picture inside the frame: bars baked into the file (as fractions of its height) and the frame's shape. */
export interface PictureShape {
  top: number
  bottom: number
  aspect: number // the whole frame's width / height
}

/** Rows at the top and bottom of a frame that stay dark. */
function findBars(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number] {
  const px = ctx.getImageData(0, 0, w, h).data
  const dark = (y: number): boolean => {
    let sum = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11
    }
    return sum / w < 18
  }
  let top = 0
  while (top < h / 3 && dark(top)) top++
  let bottom = 0
  while (bottom < h / 3 && dark(h - 1 - bottom)) bottom++
  return [top / h, bottom / h]
}

export function AmbientLight({ video, on, onShape }: { video: RefObject<HTMLVideoElement | null>; on: boolean; onShape?: (s: PictureShape) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const shape = useRef<PictureShape>({ top: 0, bottom: 0, aspect: 16 / 9 })
  const onRef = useRef(on)
  onRef.current = on

  useEffect(() => {
    const c = canvas.current?.getContext('2d')
    if (!c) return
    const probe = document.createElement('canvas')
    probe.width = 192
    probe.height = 216
    const pc = probe.getContext('2d', { willReadFrequently: true })!
    let raf = 0
    let offSince = 0
    let found: [number, number] = [0.5, 0.5]
    let samples = 0
    let src = ''
    let readable = true

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const v = video.current
      if (!v || v.readyState < 2 || !v.videoWidth) return
      // A new film (or a new stream after a seek that reopened it): measure its bars again.
      if (v.currentSrc !== src) {
        src = v.currentSrc
        found = [0.5, 0.5]
        samples = 0
      }
      // Keep painting until the fade-out has finished, then rest.
      if (onRef.current) offSince = 0
      else if (!offSince) offSince = performance.now()
      else if (performance.now() - offSince > 2600) return
      const { top, bottom } = shape.current
      const h = v.videoHeight
      c.drawImage(v, 0, top * h, v.videoWidth, h * (1 - top - bottom), 0, 0, 64, 36)
    }
    raf = requestAnimationFrame(draw)

    // Bars are measured over the first seconds of picture: a dark scene can't fake a bar a bright one disproves.
    const measure = window.setInterval(() => {
      const v = video.current
      if (!v || v.readyState < 2 || !v.videoWidth || v.paused || samples >= 8 || !readable) return
      try {
        pc.drawImage(v, 0, 0, 192, 216)
        const [t, b] = findBars(pc, 192, 216)
        found = [Math.min(found[0], t), Math.min(found[1], b)]
      } catch {
        readable = false // a stream from elsewhere can't be read back: the light still shows, the bars stay
        return
      }
      if (++samples < 8) return
      // Thin slivers are encoding edges, not bars.
      // A hair more is taken than measured, so the soft edge of a bar never shows as a line.
      const [t, b] = found[0] + found[1] < 0.04 ? [0, 0] : found.map((f) => (f > 0 ? f + 0.005 : 0))
      shape.current = { top: t, bottom: b, aspect: v.videoWidth / v.videoHeight }
      onShape?.(shape.current)
    }, 600)

    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvas} className={`ambient-light ${on ? 'is-on' : ''}`} width="64" height="36" aria-hidden />
}

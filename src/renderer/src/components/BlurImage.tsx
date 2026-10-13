import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { img, isLoaded, markLoaded, type ImgSize } from '../lib/img'
import { gsap, d } from '../design/motion'

interface Props {
  path: string | null | undefined
  size: ImgSize
  /** Small rendition shown blurred while the full image loads. false to skip. */
  tiny?: ImgSize | false
  color?: string
  alt?: string
  className?: string
  style?: CSSProperties
  fit?: 'cover' | 'contain'
  position?: string
  /** Rendered when there is no image or it fails, on top of the color field. */
  fallback?: ReactNode
  onReady?: (url: string) => void
  imgRef?: (el: HTMLImageElement | null) => void
}

/**
 * Blur-up image: the cached dominant color first, then a soft low-res pass, then the full image fades in.
 * Never shows a broken image icon.
 */
export function BlurImage({
  path,
  size,
  tiny = 'w92',
  color = '#151518',
  alt = '',
  className = '',
  style,
  fit = 'cover',
  position = 'center',
  fallback,
  onReady,
  imgRef
}: Props) {
  const full = img(path, size)
  const low = tiny ? img(path, tiny) : null
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(full ? (isLoaded(full) ? 'ready' : 'loading') : 'failed')
  const fullEl = useRef<HTMLImageElement | null>(null)
  const lowEl = useRef<HTMLImageElement | null>(null)

  useLayoutEffect(() => {
    setState(full ? (isLoaded(full) ? 'ready' : 'loading') : 'failed')
  }, [full])

  const onFull = (): void => {
    if (!full) return
    const wasCached = isLoaded(full)
    markLoaded(full)
    setState('ready')
    onReady?.(full)
    if (fullEl.current && !wasCached) {
      gsap.fromTo(fullEl.current, { opacity: 0, scale: 1.015 }, { opacity: 1, scale: 1, duration: d(0.7), ease: 'power2.out' })
    }
  }

  const ready = state === 'ready'
  const objectStyle: CSSProperties = { objectFit: fit, objectPosition: position }

  return (
    <div className={`bimg ${className}`} style={{ backgroundColor: color, ...style }}>
      {low && !ready && (
        <img
          ref={lowEl}
          className="bimg-low"
          src={low}
          alt=""
          decoding="async"
          style={objectStyle}
          onLoad={() => lowEl.current && gsap.to(lowEl.current, { opacity: 1, duration: d(0.35) })}
        />
      )}
      {full && state !== 'failed' && (
        <img
          ref={(el) => {
            fullEl.current = el
            imgRef?.(el)
          }}
          className="bimg-full"
          src={full}
          alt={alt}
          decoding="async"
          style={{ ...objectStyle, opacity: ready ? 1 : 0 }}
          onLoad={onFull}
          onError={() => setState('failed')}
        />
      )}
      {state === 'failed' && fallback}
    </div>
  )
}

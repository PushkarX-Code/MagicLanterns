import type { CSSProperties } from 'react'

/**
 * The Beacon mark as live SVG: three nested arches of light, warm at the core and cooling outward.
 * Its layers carry classes (lm-halo, lm-pool, lm-core, lm-play) so the splash can light it from the core out.
 */
export function Lantern({ size = 160, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={`lantern ${className}`} style={style} width={size} height={size} viewBox="200 200 624 624" aria-hidden>
      <defs>
        <radialGradient id="lm-halo" cx="512" cy="560" r="380" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB45A" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#FF7A2E" stopOpacity="0.1" />
          <stop offset="1" stopColor="#FF7A2E" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lm-r1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF1D2" />
          <stop offset="1" stopColor="#FFB45A" />
        </linearGradient>
        <linearGradient id="lm-r2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB45A" />
          <stop offset="1" stopColor="#FF7A2E" />
        </linearGradient>
        <linearGradient id="lm-r3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF7A2E" />
          <stop offset="1" stopColor="#E0452B" />
        </linearGradient>
        <filter id="lm-b30" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>
      <circle className="lm-halo" cx="512" cy="560" r="380" fill="url(#lm-halo)" />
      <ellipse className="lm-pool" cx="512" cy="830" rx="300" ry="34" fill="#FF8A3C" opacity="0.35" filter="url(#lm-b30)" />
      <path className="lm-play" d="M232 800 L232 512 A280 280 0 0 1 792 512 L792 800" fill="none" stroke="url(#lm-r3)" strokeWidth="56" strokeLinecap="round" opacity="0.9" />
      <path className="lm-play" d="M342 800 L342 512 A170 170 0 0 1 682 512 L682 800" fill="none" stroke="url(#lm-r2)" strokeWidth="56" strokeLinecap="round" />
      <path className="lm-core" d="M452 800 L452 520 A60 60 0 0 1 572 520 L572 800 Z" fill="url(#lm-r1)" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <div className={`wordmark ${className}`}>Magic Lanterns</div>
}

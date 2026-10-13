import type { CSSProperties } from 'react'

/**
 * The lantern mark as live SVG. Its light layers carry classes (lm-halo, lm-core, lm-play, lm-pool)
 * so the splash and onboarding can brighten the core with GSAP.
 */
export function Lantern({ size = 160, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={`lantern ${className}`} style={style} width={size} height={size} viewBox="240 160 544 720" aria-hidden>
      <defs>
        <radialGradient id="lm-halo" cx="512" cy="540" r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB45A" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#FF8A2A" stopOpacity="0.14" />
          <stop offset="1" stopColor="#FF8A2A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lm-frost" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.16" />
        </linearGradient>
        <radialGradient id="lm-core" cx="512" cy="540" r="260" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE3A6" />
          <stop offset="0.28" stopColor="#FFB24D" stopOpacity="0.95" />
          <stop offset="0.62" stopColor="#F07A1E" stopOpacity="0.55" />
          <stop offset="1" stopColor="#B8460C" stopOpacity="0.1" />
        </radialGradient>
        <linearGradient id="lm-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#FFE0B0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFB050" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="lm-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="0.6" stopColor="#FFE6C4" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FFB060" stopOpacity="0.3" />
        </linearGradient>
        <filter id="lm-b40" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="40" />
        </filter>
        <filter id="lm-b18" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id="lm-b7" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <clipPath id="lm-body">
          <path d="M404 324 H620 C676 324 700 362 700 424 V632 C700 702 672 744 610 744 H414 C352 744 324 702 324 632 V424 C324 362 348 324 404 324 Z" />
        </clipPath>
      </defs>
      <circle className="lm-halo" cx="512" cy="540" r="420" fill="url(#lm-halo)" />
      <ellipse className="lm-pool" cx="512" cy="862" rx="250" ry="44" fill="#FF9A3C" opacity="0.42" filter="url(#lm-b40)" />
      <path d="M444 258 C444 188 580 188 580 258" fill="none" stroke="url(#lm-glass)" strokeWidth="24" strokeLinecap="round" />
      <path
        d="M430 254 H594 C610 254 620 260 628 272 L656 308 C662 316 658 326 646 326 H378 C366 326 362 316 368 308 L396 272 C404 260 414 254 430 254 Z"
        fill="url(#lm-glass)"
        stroke="#FFFFFF"
        strokeOpacity="0.35"
        strokeWidth="3"
      />
      <g clipPath="url(#lm-body)">
        <rect x="300" y="320" width="424" height="430" fill="url(#lm-frost)" />
        <rect className="lm-core" x="300" y="320" width="424" height="430" fill="url(#lm-core)" />
        <path d="M478 466 L478 618 L604 542 Z" className="lm-play" fill="#FFF4DC" stroke="#FFF4DC" strokeWidth="40" strokeLinejoin="round" opacity="0.8" filter="url(#lm-b18)" />
        <path d="M490 490 L490 594 L582 542 Z" className="lm-play" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="18" strokeLinejoin="round" opacity="0.42" filter="url(#lm-b7)" />
      </g>
      <path
        d="M404 324 H620 C676 324 700 362 700 424 V632 C700 702 672 744 610 744 H414 C352 744 324 702 324 632 V424 C324 362 348 324 404 324 Z"
        fill="none"
        stroke="url(#lm-edge)"
        strokeWidth="8"
        opacity="0.8"
      />
      <path d="M392 344 C440 334 584 334 632 344" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.7" />
      <path
        d="M376 752 H648 C662 752 668 762 662 774 L652 794 C646 804 638 808 626 808 H398 C386 808 378 804 372 794 L362 774 C356 762 362 752 376 752 Z"
        fill="url(#lm-glass)"
        stroke="#FFFFFF"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <div className={`wordmark ${className}`}>Magic Lanterns</div>
}

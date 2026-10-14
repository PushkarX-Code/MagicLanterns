import type { LucideIcon, LucideProps } from 'lucide-react'

// Filled glyphs the icon set doesn't have, drawn to sit next to its line icons.
// Typed as LucideIcon so they drop into every icon slot.

function make(name: string, body: (stroke: number) => JSX.Element): LucideIcon {
  const Icon = ({ size = 24, strokeWidth = 1.8, className, ...rest }: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...(rest as object)}
    >
      {body(Number(strokeWidth))}
    </svg>
  )
  Icon.displayName = name
  return Icon as unknown as LucideIcon
}

/** Picture in picture: a screen outline with a solid inset window. */
export const PipIcon = make('PipIcon', (w) => (
  <>
    <path d="M10.5 18H5.5A2.5 2.5 0 0 1 3 15.5v-9A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V10" strokeWidth={w} />
    <rect x="12.5" y="12" width="9" height="7" rx="1.8" fill="currentColor" stroke="none" />
  </>
))

/** Open elsewhere: a solid tile with an arrow leaving its corner. */
export const OpenOutIcon = make('OpenOutIcon', (w) => (
  <>
    <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5H11v5.5a1.5 1.5 0 0 0 1.5 1.5H18v4.5a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 5 16.5Z" fill="currentColor" stroke="none" />
    <path d="M14 10l6-6M15.5 4H20v4.5" strokeWidth={w + 0.4} />
  </>
))

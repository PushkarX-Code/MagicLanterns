import { useRef, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'

interface Common {
  onPress: () => void
  focusKey?: string
  disabled?: boolean
  onArrowPress?: (dir: string) => boolean
  onFocus?: () => void
}

/** Primary action: solid white pill, black text. Optional progress fill for "Resume". */
export function PillButton({
  icon: Icon,
  children,
  onPress,
  focusKey,
  disabled,
  onArrowPress,
  onFocus,
  variant = 'solid'
}: Common & { icon?: LucideIcon; children: ReactNode; progress?: number; variant?: 'solid' | 'glass' }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({
    focusKey,
    disabled,
    onEnterPress: onPress,
    onArrowPress: onArrowPress ? (dir) => onArrowPress(dir) : undefined,
    onFocus
  })
  useLift(ref, focused, { scale: 1, tilt: 0, rise: 0 }) // pills stay one size; focus shows as colour, not growth
  return (
    <button
      ref={ref}
      className={`pill pill-${variant} ${focused ? 'is-focused' : ''}`}
      onClick={onPress}
      disabled={disabled}
      {...pointer}
    >
      {Icon && <Icon size={22} strokeWidth={2.2} fill={variant === 'solid' ? 'currentColor' : 'none'} />}
      <span>{children}</span>
    </button>
  )
}

/** Secondary action: circular glass icon button. */
export function GlassIconButton({
  icon: Icon,
  label,
  active,
  onPress,
  focusKey,
  disabled,
  size = 52,
  onArrowPress,
  onFocus
}: Common & { icon: LucideIcon; label: string; active?: boolean; size?: number }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({
    focusKey,
    disabled,
    onEnterPress: onPress,
    onArrowPress: onArrowPress ? (dir) => onArrowPress(dir) : undefined,
    onFocus
  })
  const tipRef = useRef<HTMLSpanElement>(null)
  useLift(ref, focused, { scale: 1.12, tilt: 0 })
  return (
    <button
      ref={ref}
      className={`gib glass ${focused ? 'is-focused' : ''} ${active ? 'is-active' : ''}`}
      style={{ width: size, height: size }}
      onClick={onPress}
      aria-label={label}
      disabled={disabled}
      {...pointer}
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.6} />
      <span ref={tipRef} className="gib-tip">
        {label}
      </span>
    </button>
  )
}

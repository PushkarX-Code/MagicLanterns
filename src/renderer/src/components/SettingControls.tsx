import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, ChevronsUpDown } from 'lucide-react'
import type { UseFocusableConfig } from '@noriginmedia/norigin-spatial-navigation'
import { FocusContext, useFocus } from '../focus/focus'
import { scrollPageTo } from './Row'
import { Popover } from './Popover'

/** The settings page's scroller, so a focused row can bring itself into view. */
export const settingsPage: { current: HTMLDivElement | null } = { current: null }

function useRow(config: UseFocusableConfig = {}) {
  const f = useFocus<HTMLDivElement>({
    ...config,
    onFocus: (...args) => {
      if (f.ref.current) scrollPageTo(settingsPage.current, f.ref.current, 220)
      config.onFocus?.(...args)
    }
  })
  return f
}

interface RowText {
  label: string
  hint?: string
  /** Small badge for limits, e.g. "Coming soon" or "Next launch". */
  note?: string
}

function Text({ label, hint, note }: RowText) {
  return (
    <div className="set-text">
      <div className="set-label">
        {label}
        {note && <span className="set-note">{note}</span>}
      </div>
      {hint && <div className="set-hint">{hint}</div>}
    </div>
  )
}

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  const { ref, focusKey } = useFocus<HTMLDivElement>({ trackChildren: true, saveLastFocusedChild: true })
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="set-section">
        {title && <h2 className="set-title">{title}</h2>}
        <div className="set-group glass">{children}</div>
        {footer && <div className="set-footer">{footer}</div>}
      </section>
    </FocusContext.Provider>
  )
}

/** While a switch or selector travels, its knob turns to clear glass for a moment, then settles. */
function useTravel(ms = 560): [boolean, () => void] {
  const [moving, setMoving] = useState(false)
  const timer = useRef(0)
  return [
    moving,
    () => {
      window.clearTimeout(timer.current)
      setMoving(true)
      timer.current = window.setTimeout(() => setMoving(false), ms)
    }
  ]
}

export function Toggle({ value, onChange, ...text }: RowText & { value: boolean; onChange: (v: boolean) => void }) {
  const [moving, travel] = useTravel()
  const flip = (): void => {
    travel()
    onChange(!value)
  }
  const { ref, focused, pointer } = useRow({ onEnterPress: flip })
  return (
    <div ref={ref} className={`set-row ${focused ? 'is-focused' : ''}`} onClick={flip} {...pointer}>
      <Text {...text} />
      <span className={`switch ${value ? 'is-on' : ''} ${moving ? 'is-moving' : ''}`}>
        <span />
      </span>
    </div>
  )
}

/** Segmented control for 2–4 short options. Enter cycles; left/right stay free for navigation. A glass bead slides to the choice. */
export function Choice<T extends string>({ value, options, onChange, ...text }: RowText & { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const [moving, travel] = useTravel()
  const pick = (id: T): void => {
    if (id === value) return
    travel()
    onChange(id)
  }
  const next = (): void => pick(options[(options.findIndex((o) => o.id === value) + 1) % options.length].id)
  const { ref, focused, pointer } = useRow({ onEnterPress: next })
  const seg = useRef<HTMLDivElement>(null)
  const [bead, setBead] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = seg.current?.querySelector<HTMLElement>('.seg-btn.is-active')
    if (el) setBead({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value])
  return (
    <div ref={ref} className={`set-row ${focused ? 'is-focused' : ''}`} {...pointer}>
      <Text {...text} />
      <div ref={seg} className={`seg ${moving ? 'is-moving' : ''}`}>
        {bead && <span className="seg-bead" style={{ left: bead.left, width: bead.width }} />}
        {options.map((o) => (
          <button key={o.id} className={`seg-btn ${o.id === value ? 'is-active' : ''}`} onClick={() => pick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Longer lists open a menu. */
export function Picker<T extends string | number>({
  value,
  options,
  onChange,
  ...text
}: RowText & { value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  const closedAt = useRef(0)
  const show = (): void => {
    // The menu's outside-click closes it on pointerdown; don't let the same click reopen it.
    if (Date.now() - closedAt.current > 250) setOpen(true)
  }
  const { ref, focused, pointer } = useRow({ onEnterPress: show })
  const current = options.find((o) => o.id === value)
  return (
    <div ref={ref} className={`set-row is-action ${focused ? 'is-focused' : ''}`} onClick={show} {...pointer}>
      <Text {...text} />
      <div className="popover-anchor set-picker">
        <span className="set-value">{current?.label ?? String(value)}</span>
        <ChevronsUpDown size={17} strokeWidth={1.7} className="set-chev" />
        {open && (
          <Popover
            align="right"
            title={text.label}
            options={options.map((o) => ({ label: o.label, hint: o.hint, checked: o.id === value, onSelect: () => onChange(o.id) }))}
            onClose={() => {
              closedAt.current = Date.now()
              setOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

const snap = (v: number, step: number): number => Number((Math.round(v / step) * step).toFixed(4))

/**
 * Horizontal slider. Left/right adjust while focused (the row keeps focus), Enter resets to neutral,
 * drag or click on the track with a pointer.
 */
export function Slider({
  value,
  min,
  max,
  step,
  neutral,
  format = String,
  onChange,
  ...text
}: RowText & { value: number; min: number; max: number; step: number; neutral?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const clamp = (v: number): number => Math.min(max, Math.max(min, snap(v, step)))
  const { ref, focused, pointer } = useRow({
    onArrowPress: (dir) => {
      if (dir !== 'left' && dir !== 'right') return true
      onChange(clamp(value + (dir === 'right' ? step : -step)))
      return false
    },
    onEnterPress: () => neutral !== undefined && onChange(neutral)
  })
  const fromPointer = (x: number): void => {
    const r = track.current!.getBoundingClientRect()
    onChange(clamp(min + ((x - r.left) / r.width) * (max - min)))
  }
  const pos = (v: number): number => ((v - min) / (max - min)) * 100
  const origin = pos(neutral ?? min)
  const at = pos(value)
  return (
    <div ref={ref} className={`set-row is-slider ${focused ? 'is-focused' : ''}`} {...pointer}>
      <Text {...text} />
      <div className="slider">
        <div
          ref={track}
          className="slider-track no-press"
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            dragging.current = true
            fromPointer(e.clientX)
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onDoubleClick={() => neutral !== undefined && onChange(neutral)}
        >
          <div className="slider-rail" />
          {neutral !== undefined && neutral !== min && <div className="slider-zero" style={{ left: `${origin}%` }} />}
          <div className="slider-fill" style={{ left: `${Math.min(origin, at)}%`, width: `${Math.abs(at - origin)}%` }} />
          <div className="slider-knob" style={{ left: `${at}%` }} />
        </div>
        <span className="slider-value">{format(value)}</span>
      </div>
    </div>
  )
}

export function Action({ value, onPress, danger, ...text }: RowText & { value?: string; onPress: () => void; danger?: boolean }) {
  const { ref, focused, pointer } = useRow({ onEnterPress: onPress })
  return (
    <div ref={ref} className={`set-row is-action ${danger ? 'is-danger' : ''} ${focused ? 'is-focused' : ''}`} onClick={onPress} {...pointer}>
      <Text {...text} />
      {value && <span className="set-value">{value}</span>}
      <ChevronRight size={19} strokeWidth={1.6} className="set-chev" />
    </div>
  )
}

/** A focusable block of read-only content (so the keyboard can scroll to it). */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { ref, focused, pointer } = useRow()
  return (
    <div ref={ref} className={`set-row set-panel ${className} ${focused ? 'is-focused' : ''}`} {...pointer}>
      {children}
    </div>
  )
}

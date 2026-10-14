import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import type { TrendingTitle } from '@shared/types'
import { BlurImage } from './BlurImage'
import { PillButton } from './Buttons'
import { Row } from './Row'
import { FocusContext, getCurrentFocusKey, setFocus, useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { gsap, d, EASE } from '../design/motion'

function RankTile({ t, onOpen, onFocused }: { t: TrendingTitle; onOpen: (t: TrendingTitle) => void; onFocused: (el: HTMLElement) => void }) {
  const setAmbient = useAmbient((s) => s.set)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({
    onEnterPress: () => onOpen(t),
    onFocus: () => {
      setAmbient('#3a2a1a')
      if (ref.current) onFocused(ref.current)
    }
  })
  useLift(frame, focused, { sheen, scale: 1.06 })
  return (
    <div ref={ref} className={`rank ${focused ? 'is-focused' : ''}`} onClick={() => onOpen(t)} {...pointer}>
      <span className="rank-num" aria-hidden>
        {t.rank}
      </span>
      <div ref={frame} className="poster-frame rank-frame">
        <BlurImage path={t.poster} size="w342" tiny="w92" color="#1c1c20" fallback={<div className="card-fallback">{t.title}</div>} />
        <div className="card-glare" />
        <div ref={sheen} className="card-sheen" />
      </div>
    </div>
  )
}

function TitleSheet({ t, onClose }: { t: TrendingTitle; onClose: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null)
  const opener = useRef(getCurrentFocusKey())
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'TOPTEN-SHEET', isFocusBoundary: true, trackChildren: true })
  const close = (): void => {
    onClose()
    requestAnimationFrame(() => opener.current && setFocus(opener.current))
  }
  useEffect(() => {
    if (panel.current) gsap.fromTo(panel.current, { opacity: 0, scale: 0.96, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: d(0.5), ease: EASE.settle })
    requestAnimationFrame(() => setFocus('TOPTEN-WATCH'))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' && e.key !== 'Backspace') return
      e.stopPropagation()
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <FocusContext.Provider value={focusKey}>
      <div className="modal-scrim is-fixed" onClick={(e) => e.target === e.currentTarget && close()}>
        <div
          ref={(el) => {
            panel.current = el
            ;(ref as { current: HTMLDivElement | null }).current = el
          }}
          className="sheet glass-strong"
        >
          <div className="sheet-art">
            <BlurImage path={t.backdrop} size="w1280" tiny="w300" color="#1c1c20" />
            <div className="sheet-art-shade" />
            <span className="sheet-rank">No. {t.rank} this week</span>
          </div>
          <div className="sheet-body">
            <h2 className="sheet-title">{t.title}</h2>
            <div className="sheet-meta">
              {[t.year, t.kind === 'tv' ? 'Series' : 'Film', t.rating ? `★ ${t.rating}` : null].filter(Boolean).join(' · ')}
            </div>
            <p className="sheet-overview">{t.overview}</p>
            <div className="sheet-where">
              <div className="sheet-label">Where to watch</div>
              {t.providers.length ? (
                <div className="sheet-providers">
                  {t.providers.map((p) => (
                    <span key={p.name} className="provider" title={p.name}>
                      {p.logo && <BlurImage path={p.logo} size="w92" tiny={false} color="transparent" className="provider-logo" />}
                      <span>{p.name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="sheet-none">Not streaming in your country yet.</div>
              )}
            </div>
            <div className="sheet-actions">
              <PillButton focusKey="TOPTEN-WATCH" icon={ExternalLink} disabled={!t.watchLink} onPress={() => t.watchLink && window.lantern?.openExternal(t.watchLink)}>
                Where to Watch
              </PillButton>
              <PillButton variant="glass" icon={X} onPress={close}>
                Close
              </PillButton>
            </div>
            <div className="sheet-attrib">Availability data from JustWatch via TMDB.</div>
          </div>
        </div>
      </div>
    </FocusContext.Provider>,
    document.body
  )
}

/** This week's top 10 worldwide. Renders nothing until there's data (needs a built-in metadata key). */
export function TopTen({ onRowFocus }: { onRowFocus: (el: HTMLElement) => void }) {
  const [items, setItems] = useState<TrendingTitle[]>([])
  const [open, setOpen] = useState<TrendingTitle | null>(null)
  useEffect(() => {
    window.lantern
      ?.getTrending?.()
      .then(setItems)
      .catch(() => undefined)
  }, [])
  if (!items.length) return null
  return (
    <>
      <Row title="Top 10 This Week" focusKey="ROW-topten" className="row-topten" onRowFocus={onRowFocus}>
        {(onFocused) => items.map((t) => <RankTile key={`${t.kind}-${t.id}`} t={t} onOpen={setOpen} onFocused={onFocused} />)}
      </Row>
      {open && <TitleSheet t={open} onClose={() => setOpen(null)} />}
    </>
  )
}

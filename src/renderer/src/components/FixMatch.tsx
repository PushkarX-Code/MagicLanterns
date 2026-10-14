import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import type { MatchCandidate, MediaItem } from '@shared/types'
import { PillButton } from './Buttons'
import { BlurImage } from './BlurImage'
import { FocusContext, getCurrentFocusKey, setFocus, useFocus } from '../focus/focus'
import { gsap, d, EASE } from '../design/motion'

/** Point a film or show at the right TMDB entry when the automatic match got it wrong (or found nothing). */
export function FixMatch({ item, onClose, onFixed }: { item: MediaItem; onClose: () => void; onFixed: (newId: string) => void }) {
  const panel = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const opener = useRef(getCurrentFocusKey())
  const [query, setQuery] = useState(item.title)
  const [year, setYear] = useState(item.year ? String(item.year) : '')
  const [results, setResults] = useState<MatchCandidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'FIX-MATCH', isFocusBoundary: true, trackChildren: true })

  const close = (): void => {
    onClose()
    requestAnimationFrame(() => opener.current && setFocus(opener.current))
  }
  const search = async (): Promise<void> => {
    if (!query.trim()) return
    setBusy(true)
    const found = await window.lantern?.searchMatches(item.kind, query.trim(), year ? Number(year) : null).catch(() => [])
    setResults(found ?? [])
    setBusy(false)
  }
  const choose = async (c: MatchCandidate): Promise<void> => {
    setBusy(true)
    const id = await window.lantern?.fixMatch(item.id, c.id).catch(() => null)
    setBusy(false)
    if (id) {
      onFixed(id)
      close()
    }
  }

  useEffect(() => {
    if (panel.current) gsap.fromTo(panel.current, { opacity: 0, scale: 0.96, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: d(0.5), ease: EASE.settle })
    requestAnimationFrame(() => setFocus('FIX-QUERY'))
    void search()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const field = useFocus<HTMLDivElement>({ focusKey: 'FIX-QUERY', onEnterPress: search, onFocus: () => input.current?.focus(), onBlur: () => input.current?.blur() })

  return createPortal(
    <FocusContext.Provider value={focusKey}>
      <div className="modal-scrim is-fixed" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        <div
          ref={(el) => {
            panel.current = el
            ;(ref as { current: HTMLDivElement | null }).current = el
          }}
          className="fixmatch glass-strong"
        >
          <div className="resume-kicker">Fix Match</div>
          <div className="update-title">Which {item.kind === 'movie' ? 'film' : 'show'} is this?</div>
          <div className="update-sub">{item.file?.path ?? item.seasons?.[0]?.episodes[0]?.file.path}</div>

          <div ref={field.ref} className={`fix-search ${field.focused ? 'is-focused' : ''}`} {...field.pointer}>
            <Search size={18} strokeWidth={1.8} />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Title"
              spellCheck={false}
            />
            <input className="fix-year" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Year" />
          </div>

          <div className="fix-results">
            {results === null || busy ? (
              <div className="fix-empty">Searching…</div>
            ) : results.length ? (
              results.map((c) => <Result key={c.id} c={c} onChoose={() => choose(c)} />)
            ) : (
              <div className="fix-empty">Nothing found. Try the original title, or leave the year out.</div>
            )}
          </div>

          <div className="update-actions">
            <PillButton variant="glass" icon={X} onPress={close}>
              Cancel
            </PillButton>
          </div>
        </div>
      </div>
    </FocusContext.Provider>,
    document.body
  )
}

function Result({ c, onChoose }: { c: MatchCandidate; onChoose: () => void }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ onEnterPress: onChoose, onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }) })
  return (
    <button ref={ref} className={`fix-result ${focused ? 'is-focused' : ''}`} onClick={onChoose} {...pointer}>
      <div className="fix-poster poster-frame">
        <BlurImage path={c.poster} size="w185" tiny={false} color="#1c1c20" fallback={<div className="card-fallback">{c.title}</div>} />
      </div>
      <div className="fix-text">
        <div className="fix-title">
          {c.title} {c.year && <span>{c.year}</span>}
        </div>
        <div className="fix-overview">{c.overview || 'No description.'}</div>
      </div>
    </button>
  )
}

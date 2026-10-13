import { useEffect, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { api } from '../lib/api'
import { PosterTile } from '../components/PosterTile'
import { scrollPageTo } from '../components/Row'
import { Screen, Quiet } from '../components/Screen'
import { FocusContext, useFocus } from '../focus/focus'
import { gsap, d, EASE } from '../design/motion'

const SUGGESTIONS = ['Nolan', 'Science Fiction', 'Zendaya', '2024', 'Drama', 'Animation']

function Chip({ label, onPick }: { label: string; onPick: (s: string) => void }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ onEnterPress: () => onPick(label) })
  return (
    <button ref={ref} className={`chip glass ${focused ? 'is-focused' : ''}`} onClick={() => onPick(label)} {...pointer}>
      {label}
    </button>
  )
}

export function SearchScreen() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MediaItem[] | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const page = useRef<HTMLDivElement | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'SEARCH-RESULTS', trackChildren: true, saveLastFocusedChild: true })
  const field = useFocus<HTMLDivElement>({ focusKey: 'SEARCH-FIELD', onFocus: () => input.current?.focus(), onBlur: () => input.current?.blur() })

  useEffect(() => {
    let alive = true
    if (!q.trim()) {
      setResults(null)
      return
    }
    api.search(q).then((r) => alive && setResults(r))
    return () => {
      alive = false
    }
  }, [q])

  // Results animate in as poster tiles.
  useEffect(() => {
    if (grid.current && results?.length)
      gsap.fromTo(grid.current.querySelectorAll('.poster'), { opacity: 0, y: 16, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: d(0.55), ease: EASE.settle, stagger: 0.03, overwrite: true })
  }, [results])

  return (
    <Screen id="search" ref={page} className="page" initialFocus="SEARCH-FIELD">
      <div ref={field.ref} className={`search-field glass ${field.focused ? 'is-focused' : ''}`} {...field.pointer} onClick={() => input.current?.focus()}>
        <SearchIcon size={22} strokeWidth={1.6} />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titles, people, genres, years"
          spellCheck={false}
          onKeyDown={(e) => {
            // Keep typing keys in the field; arrows still travel through the focus engine.
            if (e.key.length === 1 || e.key === 'Backspace') e.stopPropagation()
          }}
        />
        {q && (
          <button className="search-clear" onClick={() => setQ('')} aria-label="Clear">
            <X size={18} strokeWidth={1.8} />
          </button>
        )}
      </div>

      <FocusContext.Provider value={focusKey}>
        <div ref={ref}>
          {results === null ? (
            <div className="search-suggest">
              <div className="t-caption">Try</div>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} onPick={setQ} />
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <Quiet title="No matches" line={`Nothing in your library matches "${q}". Try a title, an actor, or a year.`} />
          ) : (
            <>
              <div className="search-count t-caption">
                {results.length} result{results.length === 1 ? '' : 's'}
              </div>
              <div ref={grid} className="grid">
                {results.map((r) => (
                  <PosterTile key={r.id} item={r} onFocused={(el) => scrollPageTo(page.current, el, 160)} />
                ))}
              </div>
            </>
          )}
        </div>
      </FocusContext.Provider>
    </Screen>
  )
}

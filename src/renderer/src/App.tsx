import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AmbientLayer } from './components/AmbientLayer'
import { Sidebar, SIDEBAR_KEY } from './components/Sidebar'
import { ScreenActive, setFocus } from './focus/focus'
import { useNav, type Entry } from './state/nav'
import { useSettings } from './state/settings'
import { gsap, d, EASE } from './design/motion'
import { Home } from './screens/Home'
import { Detail } from './screens/Detail'
import { Player } from './screens/Player'
import { FavoritesScreen } from './screens/Favorites'
import { FilesScreen } from './screens/Files'
import { GenreScreen } from './screens/Genre'
import { SearchScreen } from './screens/Search'
import { SettingsScreen } from './screens/Settings'
import { Splash } from './screens/Splash'

function render(entry: Entry) {
  const r = entry.route
  switch (r.name) {
    case 'home':
      return <Home />
    case 'favorites':
      return <FavoritesScreen />
    case 'files':
      return <FilesScreen />
    case 'genre':
      return <GenreScreen genre={r.genre} entryKey={entry.key} />
    case 'search':
      return <SearchScreen />
    case 'settings':
      return <SettingsScreen />
    case 'detail':
      return <Detail id={r.id} origin={r.origin} entryKey={entry.key} />
    case 'player':
      return <Player key={entry.key} itemId={r.itemId} episodeId={r.episodeId} fileId={r.fileId} url={r.url} title={r.title} fresh={r.fresh} />
  }
}

/** Keeps every screen in the stack mounted (scroll and focus survive Back) but only the top one live. */
function ScreenHost({ entry, top, first, live }: { entry: Entry; top: boolean; first: boolean; live: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const wasTop = useRef(top)

  useLayoutEffect(() => {
    const node = el.current
    if (!node || first) return
    const r = entry.route
    if (r.name === 'detail' && r.origin) return // the shared-element flight handles the entrance
    if (r.name === 'player') gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: d(0.5), ease: 'power1.out' })
    else gsap.fromTo(node, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: d(0.6), ease: EASE.settle })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (top && !wasTop.current && el.current) gsap.fromTo(el.current, { opacity: 0.35 }, { opacity: 1, duration: d(0.5), ease: 'power1.out' })
    wasTop.current = top
  }, [top])

  const kind = entry.route.name === 'player' ? 'is-player' : entry.route.name === 'detail' ? 'is-full' : 'is-section'
  return (
    <div ref={el} className={`screen-host ${kind} ${top ? 'is-top' : 'is-under'}`} aria-hidden={!top}>
      <ScreenActive.Provider value={top && live}>{render(entry)}</ScreenActive.Provider>
    </div>
  )
}

export function App() {
  const stack = useNav((s) => s.stack)
  const back = useNav((s) => s.back)
  const load = useSettings((s) => s.load)
  const [splash, setSplash] = useState(true)
  const top = stack[stack.length - 1]
  const immersive = top.route.name === 'detail' || top.route.name === 'player'

  useEffect(() => {
    load()
  }, [load])

  // Esc / Backspace: back one level; at a section root, return to the sidebar like the Menu button on tvOS.
  // "/" or Ctrl+F opens search from anywhere outside the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      const { stack, push } = useNav.getState()
      const name = stack[stack.length - 1].route.name
      if (!typing && name !== 'player' && name !== 'search' && (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f'))) {
        e.preventDefault()
        push({ name: 'search' })
        return
      }
      if (e.key !== 'Escape' && e.key !== 'Backspace') return
      if (typing) return
      e.preventDefault()
      if (useNav.getState().stack.length > 1) back()
      else setFocus(SIDEBAR_KEY)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

  return (
    <div className={`app ${immersive ? 'is-immersive' : ''}`}>
      <AmbientLayer />
      <div className="drag-strip" />
      <Sidebar hidden={immersive} />
      <main className="stage">
        {stack.map((entry, i) => (
          <ScreenHost key={entry.key} entry={entry} top={i === stack.length - 1} first={i === 0} live={!splash} />
        ))}
      </main>
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { api, isRealLibrary } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Hero, HeroSkeleton } from '../components/Hero'
import { Welcome } from '../components/Welcome'
import { useSettings } from '../state/settings'
import { Card, CardSkeleton } from '../components/Card'
import { GenreTile } from '../components/GenreTile'
import { TopTen } from '../components/TopTen'
import { Row, RowSkeleton, scrollPageTo } from '../components/Row'
import { Screen } from '../components/Screen'
import { useNav } from '../state/nav'
import { gsap, d, EASE } from '../design/motion'

export function Home() {
  const stackDepth = useNav((s) => s.stack.length)
  const { data, reload } = useAsync(() => api.getHome(), [])
  const onboarded = useSettings((s) => s.settings?.onboarded ?? true)
  const finishOnboarding = useSettings((s) => s.update)
  // A library that existed before first-run setup did skips it (checked once, on the first load, so a
  // first scan finishing later never yanks someone off the welcome wall).
  const checkedSetup = useRef(false)
  const settingsReady = useSettings((s) => !!s.settings)
  useEffect(() => {
    if (!data || !settingsReady || checkedSetup.current) return
    checkedSetup.current = true
    if (!isRealLibrary || onboarded || !data.hero.length) return
    window.lantern?.scanStatus().then((s) => {
      if (!s.scanning) void finishOnboarding({ onboarded: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settingsReady])
  const welcome = isRealLibrary && !!data && (!onboarded || !data.hero.length)
  const page = useRef<HTMLDivElement | null>(null)
  const rows = useRef<HTMLDivElement>(null)

  // Progress changes while the player was open; refresh rows when we come back to Home.
  const prevDepth = useRef(stackDepth)
  useEffect(() => {
    if (stackDepth < prevDepth.current) reload()
    prevDepth.current = stackDepth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackDepth])

  // Skeleton → content: rows settle in from slightly below, never pop. First arrival also takes focus.
  const settled = useRef(false)
  useEffect(() => {
    if (!data || settled.current || !rows.current) return
    settled.current = true
    gsap.fromTo(rows.current.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: d(0.9), ease: EASE.settle, stagger: 0.07 })
  }, [data])

  const toTop = (): void => {
    if (page.current) gsap.to(page.current, { scrollTo: { y: 0, autoKill: false }, duration: d(0.7), ease: EASE.glide, overwrite: 'auto' })
  }

  return (
    <Screen id="home" ref={page} className="home" initialFocus="HERO-PLAY">
      {!data ? <HeroSkeleton /> : welcome ? <Welcome /> : <Hero items={data.hero} onFocusHero={toTop} />}
      <div ref={rows} className="home-rows" hidden={welcome}>
        {data
          ? data.rows.map((row) => (
              <Row
                key={row.id}
                title={row.title}
                focusKey={`ROW-${row.id}`}
                className={row.title ? '' : 'row-untitled'}
                onRowFocus={(el) => scrollPageTo(page.current, el, row.title ? 96 : 140)}
              >
                {(onFocused) =>
                  row.kind === 'genres'
                    ? row.genres!.map((g) => <GenreTile key={g.name} genre={g} onFocused={onFocused} />)
                    : row.cards.map((c) => (
                        <Card key={c.key} card={c} action={row.id === 'recents' ? 'play' : 'detail'} onFocused={onFocused} />
                      ))
                }
              </Row>
            ))
          : [0, 1, 2].map((r) => <RowSkeleton key={r}>{(i) => <CardSkeleton key={i} />}</RowSkeleton>)}
        {data && <TopTen onRowFocus={(el) => scrollPageTo(page.current, el, 96)} />}
      </div>
    </Screen>
  )
}

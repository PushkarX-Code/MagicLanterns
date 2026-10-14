import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Hero, HeroSkeleton } from '../components/Hero'
import { Card, CardSkeleton } from '../components/Card'
import { GenreTile } from '../components/GenreTile'
import { Row, RowSkeleton, scrollPageTo } from '../components/Row'
import { Screen } from '../components/Screen'
import { useNav } from '../state/nav'
import { gsap, d, EASE } from '../design/motion'

export function Home() {
  const stackDepth = useNav((s) => s.stack.length)
  const { data, reload } = useAsync(() => api.getHome(), [])
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
      {data ? <Hero items={data.hero} onFocusHero={toTop} /> : <HeroSkeleton />}
      <div ref={rows} className="home-rows">
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
      </div>
    </Screen>
  )
}

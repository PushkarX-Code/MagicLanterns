import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clapperboard, Star } from 'lucide-react'
import type { DiscoverDetails, DiscoverList, TrendingTitle } from '@shared/types'
import { BlurImage } from '../components/BlurImage'
import { backdropSize } from '../lib/img'
import { GlassIconButton, PillButton } from '../components/Buttons'
import { OpenOutIcon } from '../components/Icons'
import { Row, scrollPageTo } from '../components/Row'
import { Screen } from '../components/Screen'
import { listLabel } from '../components/TopTen'
import { CastMember, Overview } from './Detail'
import { useNav } from '../state/nav'
import { useAmbient } from '../state/ambient'
import { runtime } from '../lib/format'
import { gsap, d, EASE, reduceMotion } from '../design/motion'

/** Full-screen page for a title you don't own: same layout as a library title, but Where to Watch instead of Play. */
export function DiscoverScreen({ title: t, list, entryKey }: { title: TrendingTitle; list?: DiscoverList; entryKey: number }) {
  const back = useNav((s) => s.back)
  const setAmbient = useAmbient((s) => s.set)
  const [info, setInfo] = useState<DiscoverDetails | null>(null)
  const [scrolled, setScrolled] = useState(0)
  const page = useRef<HTMLDivElement | null>(null)
  const chrome = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAmbient('#3a2a1a')
    window.lantern
      ?.getDiscoverDetails?.(t.kind, t.id)
      .then(setInfo)
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.kind, t.id])

  // Reveal: the text column settles in piece by piece.
  useEffect(() => {
    if (!chrome.current) return
    gsap.fromTo(
      chrome.current.querySelectorAll('.reveal'),
      { opacity: 0, y: reduceMotion() ? 0 : 22 },
      { opacity: 1, y: 0, duration: d(0.9), ease: EASE.settle, stagger: 0.07, delay: 0.1 }
    )
  }, [])

  // Titles opened from a cast page arrive without availability; the details call fills it in.
  const providers = t.providers.length ? t.providers : (info?.providers ?? [])
  const watchLink = t.watchLink ?? info?.watchLink ?? null
  const watch = (): void => {
    if (watchLink) window.lantern?.openExternal(watchLink)
  }
  const fold = Math.min(1, scrolled / (window.innerHeight * 0.6))
  const meta = [
    t.rating ? `★ ${t.rating}` : null,
    info?.runtime ? runtime(info.runtime) : null,
    t.year,
    t.kind === 'tv' ? 'Series' : 'Film'
  ].filter(Boolean)

  return (
    <Screen id={`discover-${entryKey}`} className="detail" ref={page} initialFocus={`DISC-WATCH-${entryKey}`} onScroll={(e) => setScrolled(e.currentTarget.scrollTop)}>
      <div className="detail-backdrop" style={{ transform: `scale(${1 + fold * 0.04})` }}>
        <BlurImage path={t.backdrop} size={backdropSize()} tiny="w300" color="#1c1c20" />
        <div className="detail-scrim" />
        <div className="detail-fold-dim" style={{ opacity: fold * 0.85 }} />
      </div>
      <div className="detail-topbar-bg" style={{ opacity: fold }} />
      <div className="detail-topbar">
        <GlassIconButton icon={ArrowLeft} label="Back" size={46} onPress={back} />
        <div className="detail-topbar-title" style={{ opacity: fold }}>
          {t.title}
        </div>
      </div>

      <div ref={chrome} className="detail-fold">
        <div className="detail-left">
          <div className="detail-logo reveal">
            {info?.logo ? (
              <BlurImage path={info.logo} size="w780" tiny={false} color="transparent" fit="contain" position="left bottom" alt={t.title} fallback={<h1 className="t-display">{t.title}</h1>} />
            ) : (
              <h1 className="t-display">{t.title}</h1>
            )}
          </div>
          <div className="detail-actions reveal">
            <PillButton icon={OpenOutIcon} focusKey={`DISC-WATCH-${entryKey}`} disabled={!watchLink} onPress={watch}>
              Where to Watch
            </PillButton>
            {info?.trailerKey && (
              <GlassIconButton icon={Clapperboard} label="Trailer" onPress={() => window.lantern?.openExternal(`https://www.youtube.com/watch?v=${info.trailerKey}`)} />
            )}
          </div>
        </div>

        <div className="detail-right">
          <div className="reveal">
            {list && t.rank > 0 && (
              <div className="disc-rank">
                No. {t.rank} {listLabel(list)}
              </div>
            )}
            <div className="metaline">
              {meta.map((m) => (
                <span key={String(m)}>{m}</span>
              ))}
              {info?.genres.length ? <span className="ml-genres">{info.genres.slice(0, 3).join(', ')}</span> : null}
            </div>
          </div>
          <div className="reveal">
            <Overview text={t.overview} />
          </div>
          <div className="reveal sheet-where">
            <div className="sheet-label">Where to watch</div>
            {providers.length ? (
              <div className="sheet-providers">
                {providers.map((p) => (
                  <button key={p.name} className="provider" onClick={watch} title={`Open ${p.name}`}>
                    {p.logo && <BlurImage path={p.logo} size="w92" tiny={false} color="transparent" className="provider-logo" />}
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            ) : info || t.providers.length ? (
              <div className="sheet-none">Not streaming in your country yet.</div>
            ) : (
              <div className="sheet-none">Checking…</div>
            )}
          </div>
          {info?.credit && (
            <div className="detail-credit reveal">
              <span>{info.credit.role}</span> {info.credit.name}
            </div>
          )}
        </div>
      </div>

      <div className="detail-below">
        {info && info.cast.length > 0 && (
          <Row title="Cast & Crew" focusKey={`DISC-CAST-${entryKey}`} onRowFocus={(el) => scrollPageTo(page.current, el, 160)}>
            {(onFocused) => info.cast.map((c) => <CastMember key={c.name} person={c} onFocused={onFocused} />)}
          </Row>
        )}
        <div className="detail-attrib">
          <Star size={12} strokeWidth={1.6} /> Details and artwork from TMDB. Availability data from JustWatch via TMDB.
        </div>
      </div>
    </Screen>
  )
}

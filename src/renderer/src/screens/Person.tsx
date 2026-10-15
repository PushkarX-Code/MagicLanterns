import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Star } from 'lucide-react'
import type { CastMember, MediaItem, PersonCredit, PersonDetails, TrendingTitle } from '@shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { backdropSize } from '../lib/img'
import { BlurImage } from '../components/BlurImage'
import { GlassIconButton } from '../components/Buttons'
import { Card } from '../components/Card'
import { Row, scrollPageTo } from '../components/Row'
import { Screen } from '../components/Screen'
import { Overview } from './Detail'
import { useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useNav } from '../state/nav'
import { useAmbient } from '../state/ambient'
import { gsap, d, EASE, reduceMotion } from '../design/motion'

const asTitle = (c: PersonCredit): TrendingTitle => ({
  rank: 0,
  id: c.id,
  kind: c.kind,
  title: c.title,
  year: c.year,
  overview: c.overview,
  poster: c.poster,
  backdrop: c.backdrop,
  rating: c.rating,
  providers: [],
  watchLink: null
})

/** A title from their filmography you don't own: opens the same page as a discover title, with where to watch. */
function CreditTile({ c, onFocused }: { c: PersonCredit; onFocused: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const open = (): void => push({ name: 'discover', title: asTitle(c) })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({ onEnterPress: open, onFocus: () => ref.current && onFocused(ref.current) })
  useLift(frame, focused, { sheen, scale: 1.07 })
  return (
    <div ref={ref} className={`poster credit ${focused ? 'is-focused' : ''}`} onClick={open} {...pointer}>
      <div ref={frame} className="poster-frame">
        <BlurImage path={c.poster} size="w342" tiny="w92" color="#1c1c20" fallback={<div className="card-fallback">{c.title}</div>} />
        <div className="card-glare" />
        <div ref={sheen} className="card-sheen" />
      </div>
      <div className="card-meta">
        <div className="card-title">{c.title}</div>
        <div className="card-sub">{[c.year, c.character].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  )
}

/** A cast member's page: who they are, what of theirs you own, and everything else they're in. */
export function PersonScreen({ person, entryKey }: { person: CastMember; entryKey: number }) {
  const back = useNav((s) => s.back)
  const setAmbient = useAmbient((s) => s.set)
  const [info, setInfo] = useState<PersonDetails | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [scrolled, setScrolled] = useState(0)
  const page = useRef<HTMLDivElement | null>(null)
  const chrome = useRef<HTMLDivElement>(null)
  const portrait = useRef<HTMLDivElement>(null)
  const { data: owned } = useAsync(() => api.getPersonItems(person), [person.id, person.name])

  useEffect(() => {
    if (person.id == null || !window.lantern?.getPerson) return setLoaded(true)
    window.lantern
      .getPerson(person.id)
      .then(setInfo)
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [person.id])

  // Light the room with the first title of theirs you own.
  useEffect(() => {
    setAmbient(owned?.[0]?.color ?? '#2a2622')
  }, [owned, setAmbient])

  // The portrait grows in, then the words settle one after another.
  useEffect(() => {
    const still = reduceMotion()
    if (portrait.current) gsap.fromTo(portrait.current, { opacity: 0, scale: still ? 1 : 0.86 }, { opacity: 1, scale: 1, duration: d(0.9), ease: EASE.settle })
    if (chrome.current)
      gsap.fromTo(chrome.current.querySelectorAll('.reveal'), { opacity: 0, y: still ? 0 : 22 }, { opacity: 1, y: 0, duration: d(0.9), ease: EASE.settle, stagger: 0.07, delay: 0.15 })
  }, [])

  const mine = new Set((owned ?? []).map((i: MediaItem) => `${i.kind === 'show' ? 'tv' : 'movie'}-${i.tmdbId}`))
  const others = (info?.credits ?? []).filter((c) => !mine.has(`${c.kind}-${c.id}`))
  const backdrop = owned?.find((i) => i.backdrop)?.backdrop ?? info?.credits.find((c) => c.backdrop)?.backdrop ?? null
  const fold = Math.min(1, scrolled / (window.innerHeight * 0.6))
  const facts = [info?.knownFor, info?.born && `Born ${info.born}`, info?.died && `Died ${info.died}`].filter(Boolean) as string[]
  const initials = person.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

  return (
    <Screen id={`person-${entryKey}`} className="detail person" ref={page} onScroll={(e) => setScrolled(e.currentTarget.scrollTop)}>
      <div className="detail-backdrop person-backdrop" style={{ transform: `scale(${1 + fold * 0.04})` }}>
        {backdrop && <BlurImage path={backdrop} size={backdropSize()} tiny="w300" color="#1c1c20" />}
        <div className="detail-scrim" />
        <div className="detail-fold-dim" style={{ opacity: 0.35 + fold * 0.5 }} />
      </div>
      <div className="detail-topbar-bg" style={{ opacity: fold }} />
      <div className="detail-topbar">
        <GlassIconButton icon={ArrowLeft} label="Back" size={46} onPress={back} />
        <div className="detail-topbar-title" style={{ opacity: fold }}>
          {person.name}
        </div>
      </div>

      <div ref={chrome} className="detail-fold person-fold">
        <div className="person-head">
          <div ref={portrait} className="person-portrait">
            <BlurImage
              path={info?.profile ?? person.profile}
              size="w500"
              tiny="w92"
              color="#1d1d21"
              position="center 20%"
              fallback={<span className="cast-initials">{initials}</span>}
            />
          </div>
          <div className="person-id">
            <h1 className="t-display person-name reveal">{info?.name ?? person.name}</h1>
            {facts.length > 0 && (
              <div className="metaline reveal">
                {facts.map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </div>
            )}
            {!info && person.character && <div className="person-role reveal">as {person.character}</div>}
          </div>
        </div>
        {info?.biography && (
          <div className="detail-right reveal">
            <Overview text={info.biography} />
          </div>
        )}
      </div>

      <div className="detail-below">
        {owned && owned.length > 0 && (
          <Row title="In Your Library" focusKey={`PERSON-LIB-${entryKey}`} onRowFocus={(el) => scrollPageTo(page.current, el, 160)}>
            {(onFocused) =>
              owned.map((s) => (
                <Card
                  key={s.id}
                  card={{ key: s.id, itemId: s.id, image: s.thumb ?? s.backdrop, logo: s.thumb ? null : s.logo, title: s.title, subtitle: [s.year, s.cast.find((c) => c.name === person.name)?.character].filter(Boolean).join(' · '), color: s.color }}
                  onFocused={onFocused}
                />
              ))
            }
          </Row>
        )}
        {others.length > 0 && (
          <Row title="Filmography" focusKey={`PERSON-FILM-${entryKey}`} onRowFocus={(el) => scrollPageTo(page.current, el, 160)}>
            {(onFocused) => others.map((c) => <CreditTile key={`${c.kind}-${c.id}`} c={c} onFocused={onFocused} />)}
          </Row>
        )}
        {loaded && person.id != null && !info && (
          <div className="person-offline">Connect to the internet to see everything {person.name.split(' ')[0]} is in.</div>
        )}
        {info && (
          <div className="detail-attrib">
            <Star size={12} strokeWidth={1.6} /> Details and photos from TMDB.
          </div>
        )}
      </div>
    </Screen>
  )
}

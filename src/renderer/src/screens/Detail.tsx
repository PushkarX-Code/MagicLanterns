import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, CheckCheck, Clapperboard, Copy, Ellipsis, FileText, Heart, Play, Plus, SearchCheck, Star } from 'lucide-react'
import { FixMatch } from '../components/FixMatch'
import type { Episode, MediaItem } from '@shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { backdropSize } from '../lib/img'
import { bitrate, bytes, codecName, hdrLabel, resolutionLabel, runtime, timecode } from '../lib/format'
import { BlurImage } from '../components/BlurImage'
import { GlassIconButton, PillButton } from '../components/Buttons'
import { Card } from '../components/Card'
import { MetaLine, RatingsRow, primaryFile } from '../components/Meta'
import { playLabel } from '../components/Hero'
import { Row, scrollPageTo } from '../components/Row'
import { Screen } from '../components/Screen'
import { Popover } from '../components/Popover'
import { FocusContext, useFocus } from '../focus/focus'
import { useLift } from '../focus/useLift'
import { useAmbient } from '../state/ambient'
import { useNav, type Origin } from '../state/nav'
import { gsap, d, DUR, EASE, reduceMotion } from '../design/motion'

/** Shared-element flight: the card's art grows from where it sat into the full-bleed backdrop. */
function Flight({ origin, onLanded }: { origin: Origin; onLanded: () => void }) {
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const { x, y, width, height } = origin.rect
    if (reduceMotion()) {
      gsap.set(node, { opacity: 0 })
      onLanded()
      return
    }
    gsap.set(node, { left: x, top: y, width, height, borderRadius: 16, opacity: 1 })
    gsap.to(node, {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      borderRadius: 0,
      duration: DUR.flight,
      ease: EASE.flight,
      onComplete: onLanded
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={el} className="flight" style={{ backgroundColor: origin.color }}>
      {origin.src && <img src={origin.src} alt="" />}
    </div>
  )
}

export function CastMember({ person, onFocused }: { person: MediaItem['cast'][number]; onFocused: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const open = (): void => push({ name: 'person', person })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({ onEnterPress: open, onFocus: () => ref.current && onFocused(ref.current) })
  const face = useRef<HTMLDivElement>(null)
  useLift(face, focused, { scale: 1.1, tilt: 0 })
  const initials = person.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  return (
    <div ref={ref} className={`cast ${focused ? 'is-focused' : ''}`} onClick={open} role="button" aria-label={`${person.name}, ${person.character}`} {...pointer}>
      <div ref={face} className="cast-face">
        <BlurImage path={person.profile} size="w185" tiny={false} color="#1d1d21" position="center 20%" fallback={<span className="cast-initials">{initials}</span>} />
      </div>
      <div className="cast-name">{person.name}</div>
      <div className="cast-role">{person.character}</div>
    </div>
  )
}

function EpisodeCard({ ep, show, onFocused }: { ep: Episode; show: MediaItem; onFocused: (el: HTMLElement) => void }) {
  const push = useNav((s) => s.push)
  const frame = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const play = (): void => push({ name: 'player', itemId: show.id, episodeId: ep.id })
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({ onEnterPress: play, onFocus: () => ref.current && onFocused(ref.current) })
  useLift(frame, focused, { sheen, scale: 1.06 })
  const p = ep.progress
  return (
    <div ref={ref} className={`episode ${focused ? 'is-focused' : ''}`} onClick={play} {...pointer}>
      <div ref={frame} className="card-frame">
        <BlurImage path={ep.still} size="w500" tiny="w185" color={show.color} />
        <div className="episode-play">
          <Play size={18} fill="currentColor" strokeWidth={0} />
        </div>
        {p && (
          <div className="card-progress">
            <span style={{ width: `${p.watched ? 100 : Math.max(3, (p.position / p.duration) * 100)}%` }} />
          </div>
        )}
        {p?.watched && (
          <div className="episode-watched">
            <Check size={12} strokeWidth={2.6} />
          </div>
        )}
        <div className="card-glare" />
        <div ref={sheen} className="card-sheen" />
      </div>
      <div className="episode-meta">
        <div className="episode-kicker">
          Episode {ep.number}
          {ep.runtime > 0 ? ` · ${runtime(ep.runtime)}` : ''}
          {p && !p.watched ? ` · ${timecode(p.duration - p.position)} left` : ''}
        </div>
        <div className="episode-title">{ep.title}</div>
        <div className="episode-overview">{ep.overview}</div>
      </div>
    </div>
  )
}

function SeasonTab({ label, active, onSelect, onFocused, focusKey }: { label: string; active: boolean; onSelect: () => void; onFocused: () => void; focusKey: string }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({
    focusKey,
    onEnterPress: onSelect,
    onFocus: () => {
      onSelect()
      onFocused()
    }
  })
  return (
    <button ref={ref} className={`tab ${active ? 'is-active' : ''} ${focused ? 'is-focused' : ''}`} onClick={onSelect} {...pointer}>
      {label}
    </button>
  )
}

function Seasons({ show, page, k }: { show: MediaItem; page: React.RefObject<HTMLDivElement | null>; k: number }) {
  const seasons = show.seasons ?? []
  const initial = useMemo(() => {
    const partial = seasons.find((s) => s.episodes.some((e) => e.progress && !e.progress.watched))
    return partial?.number ?? seasons[0]?.number ?? 1
  }, [seasons])
  const [season, setSeason] = useState(initial)
  const list = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLDivElement>(null)
  // Entering from above lands on the current season's tab, not the episode row beneath it.
  const { ref, focusKey } = useFocus<HTMLDivElement>({
    focusKey: `SEASONS-${k}`,
    trackChildren: true,
    preferredChildFocusKey: `SEASON-TAB-${k}-${season}`
  })
  const current = seasons.find((s) => s.number === season) ?? seasons[0]

  useEffect(() => {
    if (list.current)
      gsap.fromTo(list.current.querySelectorAll('.episode'), { opacity: 0, x: 18 }, { opacity: 1, x: 0, duration: d(0.6), ease: EASE.settle, stagger: 0.04 })
    if (cover.current) gsap.fromTo(cover.current, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: d(0.6), ease: EASE.settle })
  }, [season])

  if (!current) return null
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="detail-section">
        <div className="tabs">
          {seasons.map((s) => (
            <SeasonTab
              key={s.number}
              focusKey={`SEASON-TAB-${k}-${s.number}`}
              label={s.name}
              active={s.number === season}
              onSelect={() => setSeason(s.number)}
              onFocused={() => ref.current && scrollPageTo(page.current, ref.current, 150)}
            />
          ))}
          <span className="tabs-count">{current.episodes.length} Episodes</span>
        </div>
        <div className="season-body">
          {/* Each season wears its own cover. */}
          <div ref={cover} className="poster-frame season-cover">
            <BlurImage key={season} path={current.poster ?? show.poster ?? current.episodes[0]?.still ?? null} size="w342" tiny="w92" color={show.color} fallback={<div className="card-fallback">{current.name}</div>} />
            <div className="card-glare" />
          </div>
          <div ref={list} className="season-episodes">
            <Row title="" focusKey={`EPISODES-${k}-${season}`} className="row-bare" onRowFocus={(el) => scrollPageTo(page.current, el, 200)}>
              {(onFocused) => current.episodes.map((ep) => <EpisodeCard key={ep.id} ep={ep} show={show} onFocused={onFocused} />)}
            </Row>
          </div>
        </div>
      </section>
    </FocusContext.Provider>
  )
}

function FileInfoPanel({ item, k }: { item: MediaItem; k: number }) {
  const f = primaryFile(item)
  const { ref, focused, pointer } = useFocus<HTMLDivElement>({ focusKey: `FILE-INFO-${k}` })
  if (!f) return null
  return (
    <section className="detail-section">
      <h2 className="t-row section-title">File Info</h2>
      <div ref={ref} className={`fileinfo glass ${focused ? 'is-focused' : ''}`} {...pointer}>
        <div className="fi-col">
          <div className="fi-head">Video</div>
          <dl>
            <dt>Codec</dt>
            <dd>{codecName(f.videoCodec)}</dd>
            <dt>Resolution</dt>
            <dd>
              {f.width} × {f.height} · {resolutionLabel(f)}
            </dd>
            <dt>Dynamic range</dt>
            <dd>{hdrLabel(f.hdr) ?? 'SDR'}</dd>
            <dt>Bitrate</dt>
            <dd>{bitrate(f.bitrate)}</dd>
          </dl>
        </div>
        <div className="fi-col">
          <div className="fi-head">Audio</div>
          <ul>
            {f.audio.map((a) => (
              <li key={a.index}>
                {a.title}
                {a.default && <span className="fi-tag">Default</span>}
              </li>
            ))}
          </ul>
          <div className="fi-head fi-gap">Subtitles</div>
          <ul>
            {f.subtitles.map((s) => (
              <li key={s.index}>
                {s.title}
                {s.external && <span className="fi-tag">External</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="fi-col fi-wide">
          <div className="fi-head">File</div>
          <dl>
            <dt>Container</dt>
            <dd>{f.container.toUpperCase()}</dd>
            <dt>Size</dt>
            <dd>{bytes(f.size)}</dd>
            <dt>Runtime</dt>
            <dd>{timecode(f.duration)}</dd>
            <dt>Path</dt>
            <dd className="fi-path">{f.path}</dd>
          </dl>
        </div>
      </div>
    </section>
  )
}

export function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const body = useRef<HTMLParagraphElement>(null)
  const [clamps, setClamps] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (el) setClamps(el.scrollHeight > el.clientHeight + 2)
  }, [text])
  const toggle = (): void => {
    const el = body.current
    if (!el) return
    const from = el.clientHeight
    setOpen((o) => !o)
    requestAnimationFrame(() => {
      const to = el.scrollHeight
      gsap.fromTo(el, { height: from }, { height: open ? 2 * 1.55 * 16 : to, duration: d(0.55), ease: EASE.lift, clearProps: 'height' })
    })
  }
  return (
    <div className="overview">
      <p ref={body} className={`t-body ${open ? 'is-open' : ''}`}>
        {text}
      </p>
      {clamps && <MoreToggle open={open} onToggle={toggle} />}
    </div>
  )
}

function MoreToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { ref, focused, pointer } = useFocus<HTMLButtonElement>({ onEnterPress: onToggle })
  return (
    <button ref={ref} className={`more-toggle ${focused ? 'is-focused' : ''}`} onClick={onToggle} {...pointer}>
      {open ? 'LESS' : 'MORE'}
    </button>
  )
}

export function Detail({ id, origin, entryKey }: { id: string; origin?: Origin; entryKey: number }) {
  const { data: loaded } = useAsync(() => api.getItem(id), [id])
  const { data: similar } = useAsync(() => api.getMoreLikeThis(id), [id])
  const [item, setItem] = useState<MediaItem | null>(null)
  const [landed, setLanded] = useState(!origin)
  const [showFlight, setShowFlight] = useState(!!origin)
  const [scrolled, setScrolled] = useState(0)
  const [menu, setMenu] = useState<null | 'more'>(null)
  const [fixing, setFixing] = useState(false)
  const replace = useNav((s) => s.replace)
  const back = useNav((s) => s.back)
  const push = useNav((s) => s.push)
  const setAmbient = useAmbient((s) => s.set)
  const page = useRef<HTMLDivElement | null>(null)
  const chrome = useRef<HTMLDivElement>(null)
  const below = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (loaded) setItem(loaded)
  }, [loaded])
  useEffect(() => {
    setAmbient(origin?.color ?? item?.color)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.color])

  // Content settles in once the flight has landed and the data is here.
  useEffect(() => {
    if (!item || !landed || !chrome.current) return
    gsap.fromTo(
      chrome.current.querySelectorAll('.reveal'),
      { opacity: 0, y: reduceMotion() ? 0 : 18 },
      { opacity: 1, y: 0, duration: d(0.9), ease: EASE.settle, stagger: 0.06 }
    )
  }, [item, landed])

  const refresh = (next: MediaItem | null): void => {
    if (next) setItem({ ...next })
  }

  if (!item) {
    return (
      <Screen id={`detail-${entryKey}`} className="detail" ref={page} initialFocus={`DETAIL-PLAY-${entryKey}`}>
        {origin && showFlight && <Flight origin={origin} onLanded={() => setLanded(true)} />}
        <DetailSkeleton />
      </Screen>
    )
  }

  const { label, progress } = playLabel(item)
  const p = item.kind === 'movie' ? item.progress : undefined
  const watched = item.kind === 'movie' ? !!p?.watched : (item.seasons ?? []).every((s) => s.episodes.every((e) => e.progress?.watched))
  const fold = Math.min(1, scrolled / (window.innerHeight * 0.6))

  return (
    <Screen id={`detail-${entryKey}`} className="detail" ref={page} initialFocus={`DETAIL-PLAY-${entryKey}`} onScroll={(e) => setScrolled(e.currentTarget.scrollTop)}>
      <div className="detail-backdrop" style={{ transform: `scale(${1 + fold * 0.04})` }}>
        <BlurImage
          path={item.backdrop}
          size={backdropSize()}
          tiny="w300"
          color={item.color}
          onReady={() => showFlight && origin && setTimeout(() => setShowFlight(false), 120)}
        />
        <div className="detail-scrim" />
        <div className="detail-fold-dim" style={{ opacity: fold * 0.85 }} />
      </div>
      {origin && showFlight && <Flight origin={origin} onLanded={() => setLanded(true)} />}

      <div className="detail-topbar-bg" style={{ opacity: fold }} />
      <div className="detail-topbar" style={{ opacity: landed ? 1 : 0 }}>
        <GlassIconButton icon={ArrowLeft} label="Back" size={46} onPress={back} focusKey={`DETAIL-BACK-${entryKey}`} />
        <div className="detail-topbar-title" style={{ opacity: fold }}>
          {item.title}
        </div>
        <div className="detail-topbar-right">
          <div className="popover-anchor">
            <GlassIconButton icon={Ellipsis} label="More" size={46} onPress={() => setMenu(menu === 'more' ? null : 'more')} />
            {menu === 'more' && (
              <Popover
                align="right"
                onClose={() => setMenu(null)}
                options={[
                  { label: watched ? 'Mark as Unwatched' : 'Mark as Watched', icon: CheckCheck, onSelect: () => api.setWatched(item.id, !watched).then(refresh) },
                  { label: 'Show File Info', icon: FileText, onSelect: () => page.current && scrollPageTo(page.current, document.querySelector('.fileinfo') as HTMLElement, 160) },
                  { label: 'Copy File Path', icon: Copy, onSelect: () => navigator.clipboard?.writeText(primaryFile(item)?.path ?? '') },
                  // Real library titles only: point the title at the right film or show.
                  ...(window.lantern?.fixMatch && /^[ms]-\d+$/.test(item.id)
                    ? [{ label: 'Fix Match…', icon: SearchCheck, divider: true, onSelect: () => setFixing(true) }]
                    : [])
                ]}
              />
            )}
          </div>
        </div>
      </div>

      <div ref={chrome} className="detail-fold">
        <div className="detail-left">
          <div className="detail-logo reveal">
            {item.logo ? (
              <BlurImage
                path={item.logo}
                size="w780"
                tiny={false}
                color="transparent"
                fit="contain"
                position="left bottom"
                alt={item.title}
                fallback={<h1 className="t-display">{item.title}</h1>}
              />
            ) : (
              <h1 className="t-display">{item.title}</h1>
            )}
          </div>
          <div className="detail-actions reveal">
            <PillButton icon={Play} progress={progress} focusKey={`DETAIL-PLAY-${entryKey}`} onPress={() => push({ name: 'player', itemId: item.id })}>
              {label}
            </PillButton>
            <GlassIconButton
              icon={watched ? CheckCheck : Check}
              label={watched ? 'Watched' : 'Mark as Watched'}
              active={watched}
              onPress={() => api.setWatched(item.id, !watched).then(refresh)}
            />
            <GlassIconButton
              icon={Clapperboard}
              label="Trailer"
              disabled={!item.trailerKey}
              onPress={() => item.trailerKey && api.openExternal(`https://www.youtube.com/watch?v=${item.trailerKey}`)}
            />
            <GlassIconButton icon={Heart} label={item.favorite ? 'Favorite' : 'Add to Favorites'} active={item.favorite} onPress={() => api.toggleFavorite(item.id).then(refresh)} />
            <GlassIconButton
              icon={item.inList ? Check : Plus}
              label={item.inList ? 'In Watchlist' : 'Add to Watchlist'}
              active={item.inList}
              onPress={() => api.toggleList(item.id).then(refresh)}
            />
          </div>
        </div>

        <div className="detail-right">
          <div className="reveal">
            <MetaLine item={item} />
          </div>
          <div className="reveal">
            <Overview text={item.overview} />
          </div>
          <div className="reveal">
            <RatingsRow ratings={item.ratings} />
          </div>
          {item.credit && (
            <div className="detail-credit reveal">
              <span>{item.credit.role}</span> {item.credit.name}
            </div>
          )}
        </div>

        {p && !p.watched && p.position > 0 && (
          <div className="detail-progress">
            <span style={{ width: `${(p.position / p.duration) * 100}%` }} />
          </div>
        )}
      </div>

      <div ref={below} className="detail-below">
        {item.kind === 'show' && <Seasons show={item} page={page} k={entryKey} />}

        <Row title="Cast & Crew" focusKey={`CAST-${entryKey}`} onRowFocus={(el) => scrollPageTo(page.current, el, 160)}>
          {(onFocused) =>
            item.cast.map((c) => <CastMember key={c.name} person={c} onFocused={onFocused} />)
          }
        </Row>

        <FileInfoPanel item={item} k={entryKey} />

        {similar && similar.length > 0 && (
          <Row title="More Like This" focusKey={`MORE-LIKE-${entryKey}`} onRowFocus={(el) => scrollPageTo(page.current, el, 160)}>
            {(onFocused) =>
              similar.map((s) => (
                <Card
                  key={s.id}
                  card={{ key: s.id, itemId: s.id, image: s.thumb ?? s.backdrop, logo: s.thumb ? null : s.logo, title: s.title, subtitle: `${s.year} · ${s.genres[0] ?? ''}`, color: s.color }}
                  onFocused={onFocused}
                />
              ))
            }
          </Row>
        )}
        {item.tmdbId > 0 && (
          <div className="detail-attrib">
            <Star size={12} strokeWidth={1.6} /> Metadata and artwork from TMDB. Ratings from OMDb.
          </div>
        )}
      </div>
      {fixing && (
        <FixMatch
          item={item}
          onClose={() => setFixing(false)}
          // Fixing can fold this title into one already in the library; follow it there.
          onFixed={(newId) => newId !== item.id && replace({ name: 'detail', id: newId })}
        />
      )}
    </Screen>
  )
}


function DetailSkeleton() {
  return (
    <>
      <div className="detail-backdrop skeleton" />
      <div className="detail-fold">
        <div className="detail-left">
          <div className="skeleton" style={{ width: 420, height: 140, borderRadius: 16 }} />
          <div className="detail-actions">
            <div className="skeleton" style={{ width: 190, height: 54, borderRadius: 999 }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ width: 52, height: 52, borderRadius: 999 }} />
            ))}
          </div>
        </div>
        <div className="detail-right">
          <div className="skeleton sk-line" style={{ width: '90%' }} />
          <div className="skeleton sk-line" style={{ width: '100%', marginTop: 20 }} />
          <div className="skeleton sk-line" style={{ width: '70%', marginTop: 10 }} />
          <div className="skeleton sk-line sk-thin" style={{ width: '50%', marginTop: 22 }} />
        </div>
      </div>
      <div className="detail-below">
        <section className="row">
          <div className="row-title">
            <div className="skeleton sk-line" style={{ width: 140 }} />
          </div>
          <div className="row-viewport">
            <div className="row-scroll">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="cast">
                  <div className="cast-face skeleton" />
                  <div className="skeleton sk-line" style={{ width: 90, margin: '14px auto 0' }} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

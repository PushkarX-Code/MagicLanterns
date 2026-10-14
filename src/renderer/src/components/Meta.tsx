import { Star } from 'lucide-react'
import type { MediaItem, Ratings } from '@shared/types'
import { audioLabel, hdrLabel, resolutionLabel, runtime } from '../lib/format'

export function Badge({ children, tone = 'outline' }: { children: React.ReactNode; tone?: 'outline' | 'solid' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** Primary file for an item: the movie file, or the first episode's file for a show. */
export function primaryFile(item: MediaItem) {
  return item.file ?? item.seasons?.[0]?.episodes[0]?.file
}

/** One quiet line: rating, runtime, year, certification, resolution, HDR, audio, genres. */
export function MetaLine({ item, genres = true }: { item: MediaItem; genres?: boolean }) {
  const f = primaryFile(item)
  const hdr = f ? hdrLabel(f.hdr) : null
  const audio = f ? audioLabel(f.audio.find((a) => a.default) ?? f.audio[0]) : null
  return (
    <div className="metaline">
      {item.ratings.imdb !== undefined && (
        <span className="ml-rating">
          <Star size={13} strokeWidth={0} fill="currentColor" />
          {item.ratings.imdb.toFixed(1)}
        </span>
      )}
      <span>{item.kind === 'show' ? `${item.seasons?.length ?? 1} Season${(item.seasons?.length ?? 1) > 1 ? 's' : ''}` : runtime(item.runtime)}</span>
      {!!item.year && <span>{item.year}</span>}
      {item.certification && <Badge>{item.certification}</Badge>}
      {f && <Badge>{resolutionLabel(f)}</Badge>}
      {hdr && <Badge>{hdr}</Badge>}
      {audio && <Badge>{audio}</Badge>}
      {genres && <span className="ml-genres">{item.genres.slice(0, 3).join(', ')}</span>}
    </div>
  )
}

function Tomato({ fresh }: { fresh: boolean }) {
  return fresh ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="9.2" r="6" fill="#FA320A" />
      <path d="M5.2 3.6c1 .9 1.9 1 2.8.4.7.9 1.7 1.1 2.8.6-.3 1.1-1.2 1.7-2.7 1.7S5.6 5 5.2 3.6Z" fill="#00912D" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 2.5 9.4 5.6l3.3-1-1 3.2 2.8 1.9-3.3.9.3 3.4-3-1.6-2.6 2.3-.5-3.4-3.4-.4 2.2-2.6-1.8-2.9 3.4.4Z" fill="#0AC855" />
    </svg>
  )
}

/** IMDb, Rotten Tomatoes and TMDB scores, small and quiet. */
export function RatingsRow({ ratings }: { ratings: Ratings }) {
  return (
    <div className="ratings">
      {ratings.imdb !== undefined && (
        <span className="rt-item">
          <span className="imdb">IMDb</span>
          {ratings.imdb.toFixed(1)}
        </span>
      )}
      {ratings.rottenTomatoes !== undefined && (
        <span className="rt-item">
          <Tomato fresh={ratings.rottenTomatoes >= 60} />
          {ratings.rottenTomatoes}%
        </span>
      )}
      {ratings.metacritic !== undefined && (
        <span className="rt-item">
          <span className={`mc ${ratings.metacritic >= 61 ? 'good' : ratings.metacritic >= 40 ? 'mixed' : 'bad'}`}>{ratings.metacritic}</span>
          Metacritic
        </span>
      )}
      {ratings.tmdb !== undefined && (
        <span className="rt-item">
          <span className="tmdb">TMDB</span>
          {Math.round(ratings.tmdb * 10)}%
        </span>
      )}
    </div>
  )
}

import { useRef } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { PosterGrid } from '../components/PosterGrid'
import { Screen } from '../components/Screen'

export function GenreScreen({ genre, entryKey }: { genre: string; entryKey: number }) {
  const { data } = useAsync(() => api.getGenre(genre), [genre])
  const page = useRef<HTMLDivElement | null>(null)
  return (
    <Screen id={`genre-${entryKey}`} ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">{genre}</h1>
        <div className="page-count">{data ? `${data.length} titles` : ' '}</div>
      </header>
      <PosterGrid items={data} page={page} focusKey={`GRID-genre-${entryKey}`} />
    </Screen>
  )
}

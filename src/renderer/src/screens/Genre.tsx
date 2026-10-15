import { useRef } from 'react'
import type { MediaItem } from '@shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { PosterGrid } from '../components/PosterGrid'
import { Screen } from '../components/Screen'

/** A titled wall of posters: one genre, or one collection. */
function Shelf({ id, title, subtitle, items }: { id: string; title: string; subtitle?: string; items: MediaItem[] | null }) {
  const page = useRef<HTMLDivElement | null>(null)
  return (
    <Screen id={id} ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">{title}</h1>
        <div className="page-count">{items ? [subtitle, `${items.length} titles`].filter(Boolean).join(' · ') : ' '}</div>
      </header>
      <PosterGrid items={items} page={page} focusKey={`GRID-${id}`} />
    </Screen>
  )
}

export function GenreScreen({ genre, entryKey }: { genre: string; entryKey: number }) {
  const { data } = useAsync(() => api.getGenre(genre), [genre])
  return <Shelf id={`genre-${entryKey}`} title={genre} items={data} />
}

export function CollectionScreen({ id, entryKey }: { id: string; entryKey: number }) {
  const { data } = useAsync(() => api.getCollection(id), [id])
  return <Shelf id={`collection-${entryKey}`} title={data?.collection.name ?? ''} subtitle={data?.collection.description} items={data?.items ?? null} />
}

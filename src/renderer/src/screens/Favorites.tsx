import { useRef } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { PosterGrid } from '../components/PosterGrid'
import { Screen, Quiet } from '../components/Screen'

export function FavoritesScreen() {
  const { data } = useAsync(() => api.getFavorites(), [])
  const page = useRef<HTMLDivElement | null>(null)
  return (
    <Screen id="favorites" ref={page} className="page">
      <header className="page-head">
        <h1 className="t-title">Favorites</h1>
        <div className="page-count">{data ? `${data.length} starred` : ' '}</div>
      </header>
      {data && data.length === 0 ? (
        <Quiet title="Nothing starred yet" line="Star a film or a show from its page or from Files and it will live here." />
      ) : (
        <PosterGrid items={data} page={page} focusKey="GRID-favorites" />
      )}
    </Screen>
  )
}

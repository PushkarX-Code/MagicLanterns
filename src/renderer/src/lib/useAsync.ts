import { useEffect, useState } from 'react'
import { useLibraryVersion } from '../state/library'

/**
 * Minimal async loader. `data` stays null until the first result, so screens render skeletons meanwhile.
 * Reloads by itself when the library changes on disk; the old data stays up until the new arrives.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  const version = useLibraryVersion((s) => s.version)
  useEffect(() => {
    let alive = true
    fn().then((v) => alive && setData(v))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, version])
  return { data, reload: () => setTick((t) => t + 1) }
}

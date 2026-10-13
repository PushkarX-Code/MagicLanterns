import { useEffect, useState } from 'react'

/** Minimal async loader. `data` stays null until the first result, so screens render skeletons meanwhile. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn().then((v) => alive && setData(v))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, reload: () => setTick((t) => t + 1) }
}

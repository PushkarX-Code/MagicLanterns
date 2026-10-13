import { useEffect, useState } from 'react'

const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function Clock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Tick on the minute boundary so the clock never lags.
    let t = window.setTimeout(function tick() {
      setNow(new Date())
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000))
    }, 60_000 - (Date.now() % 60_000))
    return () => window.clearTimeout(t)
  }, [])
  return <span className={className}>{fmt.format(now)}</span>
}

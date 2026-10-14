import { useEffect, useRef, useState } from 'react'
import { Coffee, Heart, RefreshCw } from 'lucide-react'
import { Screen } from '../components/Screen'
import { Lantern, Wordmark } from '../components/Lantern'
import { PillButton } from '../components/Buttons'
import { gsap, d, EASE, reduceMotion } from '../design/motion'

const KOFI = 'https://ko-fi.com/buymeacofi'

const CHECK_TEXT: Record<string, string> = {
  dev: 'Updates are checked in installed copies of the app.',
  latest: "You're on the latest version.",
  available: 'A new version is ready. The update window will walk you through it.',
  offline: "Couldn't reach the update server. Check your connection and try again."
}

/** More Info: what the app is, its version and updates, and the person who makes it. */
export function AboutScreen() {
  const page = useRef<HTMLDivElement | null>(null)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!page.current) return
    gsap.fromTo(
      page.current.querySelectorAll('.info-card'),
      { opacity: 0, y: reduceMotion() ? 0 : 24 },
      { opacity: 1, y: 0, duration: d(0.9), ease: EASE.settle, stagger: 0.09 }
    )
  }, [])

  const check = async (): Promise<void> => {
    if (!window.lantern?.checkForUpdates) return setStatus(CHECK_TEXT.dev)
    setChecking(true)
    setStatus(CHECK_TEXT[await window.lantern.checkForUpdates()])
    setChecking(false)
  }
  const support = (): void => (window.lantern ? window.lantern.openExternal(KOFI) : void window.open(KOFI, '_blank'))

  return (
    <Screen id="about" ref={page} className="page info" initialFocus="INFO-SUPPORT">
      <header className="page-head">
        <h1 className="t-title">More Info</h1>
      </header>

      <div className="info-grid">
        <section className="info-card info-me glass">
          <div className="info-kicker">About me</div>
          <h2 className="info-title">Hi, I'm Pushkar.</h2>
          <p>
            I work in video production, and I build Magic Lanterns myself. I made it because I wanted my films to feel like a cinema again: no
            ads, no accounts, no subscriptions, nothing watching you watch.
          </p>
          <p>
            It's free, and it will stay free. If it has earned a place on your screen, buying me a coffee is the best way to say so. Even{' '}
            <strong>$1</strong> genuinely helps: it pays for the tools, the testing, and the late nights that turn your ideas into the next
            update.
          </p>
          <div className="info-actions">
            <PillButton focusKey="INFO-SUPPORT" icon={Coffee} onPress={support}>
              Support on Ko-fi
            </PillButton>
            <a
              className="info-link"
              href={KOFI}
              onClick={(e) => {
                e.preventDefault()
                support()
              }}
            >
              ko-fi.com/buymeacofi
            </a>
          </div>
          <div className="info-thanks">
            <Heart size={14} strokeWidth={0} fill="currentColor" /> Thank you for watching, and for keeping the lantern lit.
          </div>
        </section>

        <section className="info-card info-app glass">
          <div className="info-mark">
            <Lantern size={104} />
          </div>
          <Wordmark />
          <div className="info-version">Version {__APP_VERSION__}</div>
          <p>
            The magic lantern was the first projector: a light, a painted glass slide, and a dark room turned into a story. Magic Lanterns does
            the same to a folder of files. Every film in your library becomes a lit glass slide waiting to be projected.
          </p>
        </section>

        <section className="info-card glass">
          <div className="info-kicker">Updates</div>
          <h2 className="info-title">Always getting better</h2>
          <p>
            New versions arrive on their own. When one is ready you'll see what's new the next time you open the app, never in the middle of a
            film, and you choose when to install it.
          </p>
          <div className="info-actions">
            <PillButton variant="glass" icon={RefreshCw} onPress={check} disabled={checking}>
              {checking ? 'Checking…' : 'Check for Updates'}
            </PillButton>
          </div>
          {status && <div className="info-status">{status}</div>}
        </section>

        <section className="info-card glass">
          <div className="info-kicker">Credits</div>
          <p className="info-small">
            This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability from JustWatch via TMDB. Includes
            FFmpeg, licensed under the GPL. Preview film: Sintel © Blender Foundation, CC BY 3.0.
          </p>
          <p className="info-small">Made by Pushkar.</p>
        </section>
      </div>
    </Screen>
  )
}

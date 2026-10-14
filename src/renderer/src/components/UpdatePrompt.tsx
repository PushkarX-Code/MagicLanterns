import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, RotateCw, X } from 'lucide-react'
import type { UpdateState } from '@shared/types'
import { PillButton } from './Buttons'
import { Lantern } from './Lantern'
import { FocusContext, getCurrentFocusKey, setFocus, useFocus } from '../focus/focus'
import { useNav } from '../state/nav'
import { gsap, d, EASE } from '../design/motion'

/**
 * Asks before updating. Checked once at launch; never shown over a film (it waits until you leave
 * the player), and nothing installs until you choose to restart.
 */
export function UpdatePrompt({ ready }: { ready: boolean }) {
  const [state, setState] = useState<UpdateState | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const playing = useNav((s) => s.stack[s.stack.length - 1].route.name === 'player')

  useEffect(() => {
    const bridge = window.lantern
    if (!bridge?.onUpdate) return
    bridge.updateState().then((s) => s && setState(s))
    return bridge.onUpdate((s) => {
      setState(s)
      if (s.stage === 'ready' || s.stage === 'error') setDismissed(false)
    })
  }, [])

  if (!state || dismissed || !ready || playing) return null
  return <Sheet state={state} onLater={() => setDismissed(true)} />
}

function Sheet({ state, onLater }: { state: UpdateState; onLater: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null)
  const opener = useRef(getCurrentFocusKey())
  const { ref, focusKey } = useFocus<HTMLDivElement>({ focusKey: 'UPDATE', isFocusBoundary: true, trackChildren: true })
  const later = (): void => {
    onLater()
    requestAnimationFrame(() => opener.current && setFocus(opener.current))
  }
  useEffect(() => {
    if (panel.current) gsap.fromTo(panel.current, { opacity: 0, scale: 0.96, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: d(0.55), ease: EASE.settle })
  }, [])
  useEffect(() => {
    requestAnimationFrame(() => setFocus('UPDATE-PRIMARY'))
  }, [state.stage])

  const version = 'version' in state ? state.version : ''
  return createPortal(
    <FocusContext.Provider value={focusKey}>
      <div className="modal-scrim is-fixed">
        <div
          ref={(el) => {
            panel.current = el
            ;(ref as { current: HTMLDivElement | null }).current = el
          }}
          className="update glass-strong"
        >
          <div className="update-head">
            <Lantern size={56} />
            <div>
              <div className="resume-kicker">Software Update</div>
              <div className="update-title">
                {state.stage === 'error' ? 'The update could not be completed' : `Magic Lanterns ${version} is available`}
              </div>
              {state.stage === 'available' && <div className="update-sub">You have version {state.current}.</div>}
            </div>
          </div>

          {state.stage === 'available' && (
            <div className="update-notes">{state.notes || 'This update includes improvements to performance and reliability.'}</div>
          )}
          {state.stage === 'downloading' && (
            <div className="update-progress">
              <span style={{ width: `${Math.max(2, state.percent)}%` }} />
            </div>
          )}
          {state.stage === 'ready' && <div className="update-notes">The update is ready. Magic Lanterns will restart to finish installing.</div>}
          {state.stage === 'error' && <div className="update-notes">{state.message}</div>}

          <div className="update-actions">
            {state.stage === 'available' && (
              <>
                <PillButton focusKey="UPDATE-PRIMARY" icon={Download} onPress={() => window.lantern?.downloadUpdate()}>
                  Update Now
                </PillButton>
                <PillButton
                  variant="glass"
                  onPress={() => {
                    window.lantern?.skipUpdate(version)
                    later()
                  }}
                >
                  Skip This Version
                </PillButton>
                <PillButton variant="glass" onPress={later}>
                  Later
                </PillButton>
              </>
            )}
            {state.stage === 'downloading' && (
              <PillButton focusKey="UPDATE-PRIMARY" variant="glass" onPress={later}>
                Download in Background
              </PillButton>
            )}
            {state.stage === 'ready' && (
              <>
                <PillButton focusKey="UPDATE-PRIMARY" icon={RotateCw} onPress={() => window.lantern?.installUpdate()}>
                  Restart Now
                </PillButton>
                <PillButton variant="glass" onPress={later}>
                  Install When I Quit
                </PillButton>
              </>
            )}
            {state.stage === 'error' && (
              <PillButton focusKey="UPDATE-PRIMARY" variant="glass" icon={X} onPress={later}>
                Close
              </PillButton>
            )}
          </div>
        </div>
      </div>
    </FocusContext.Provider>,
    document.body
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './design/tokens.css'
import './design/base.css'
import './styles/app.css'
import './styles/cards.css'
import './styles/hero.css'
import './styles/detail.css'
import './styles/player.css'
import './styles/pages.css'
import { initFocus } from './focus/focus'
import { initPressFeedback } from './design/press'
import { App } from './App'

initFocus()
initPressFeedback()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

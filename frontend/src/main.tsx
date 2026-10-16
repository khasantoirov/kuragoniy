import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './lib/i18n'
import './lib/i18n/portal'
import './legacy.css'
// 2-rejim ("ta'lim paneli" ko'rinishi) — legacy.css'dan KEYIN, chunki
// hamma qoidasi [data-skin="r2"] ostida va teng specifikatsiyada
// keyingi fayl ustun turishi kerak. 1-rejimda bitta qoidasi ham
// qo'llanmaydi.
import './skin-edumin.css'
import './styles/portal.css'
import './styles/gate.css'
import './styles/settings.css'

// Service-worker registration/update handling lives in <AutoUpdate>
// (mounted in App.tsx): a new deploy is switched to automatically, but
// only at a moment that loses nothing — never mid-typing, mid-test or
// mid-game.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

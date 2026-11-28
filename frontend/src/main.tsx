import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
// ru/en are a chunk of their own (lib/i18n/index.ts); Uzbek needs none
import { languageReady } from './lib/i18n'
import './legacy.css'
// 2-rejim ("ta'lim paneli" ko'rinishi) — legacy.css'dan KEYIN, chunki
// hamma qoidasi [data-skin="r2"] ostida va teng specifikatsiyada
// keyingi fayl ustun turishi kerak. 1-rejimda bitta qoidasi ham
// qo'llanmaydi.
import './skin-edumin.css'
import './styles/portal.css'
import './styles/gate.css'
import './styles/settings.css'
import './styles/protection.css'
// menu and section icons in the logo's colours — after the skin
import './styles/brand-icons.css'
// iOS-like motion: taps, page changes, sheets (owner, 2026-11-28)
import './styles/motion.css'
import { IN_TELEGRAM, startTelegram } from './lib/telegram'
import { startDeviceMode } from './lib/deviceMode'

// Service-worker registration/update handling lives in <AutoUpdate>
// (mounted in App.tsx): a new deploy is switched to automatically, but
// only at a moment that loses nothing — never mid-typing, mid-test or
// mid-game.

// Qurilma rejimi (Mobil / Kompyuter) before the first paint.
startDeviceMode()

// A saved Русский / English: its dictionary first, so the first paint is
// already in that language (the UI store has picked it up by now).
// inside Telegram (the @kuragoniybot mini app) its script comes first: it
// reads the launch data from the address before the router moves on
void Promise.all([languageReady(), IN_TELEGRAM ? startTelegram() : null]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

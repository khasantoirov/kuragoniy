import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './lib/i18n'
import './legacy.css'
// 2-rejim ("ta'lim paneli" ko'rinishi) — legacy.css'dan KEYIN, chunki
// hamma qoidasi [data-skin="r2"] ostida va teng specifikatsiyada
// keyingi fayl ustun turishi kerak. 1-rejimda bitta qoidasi ham
// qo'llanmaydi.
import './skin-edumin.css'

// Service-worker registration/update handling lives in <UpdatePrompt>
// (mounted in App.tsx) — it used to reload the page automatically the
// moment a new deploy's worker took over, which wiped out anything someone
// was mid-typing (a lesson edit, an announcement). It now just shows a
// banner and waits for the user to click it.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

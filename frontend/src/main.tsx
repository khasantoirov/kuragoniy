import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './lib/i18n'
import './legacy.css'

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

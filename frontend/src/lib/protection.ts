import { api } from '@/lib/api/client'

/* Kontent himoyasi — helpers shared by components/ContentGuard.tsx and the
   pages that print on purpose. A browser can't truly stop a screenshot (a
   phone camera, the OS tools); what this does is make copying awkward, keep
   the browser's own print blank, cover the screen on PrintScreen and put the
   viewer's name on every page, so a leaked picture says whose it was. */

const lastReport: Record<string, number> = {}

/** Tells the security log about an attempt — once a minute per kind. */
export function reportAttempt(kind: 'screenshot' | 'print' | 'copy') {
  const now = Date.now()
  if (now - (lastReport[kind] ?? 0) < 60_000) return
  lastReport[kind] = now
  api.post('/common/protection-event/', { kind, page: window.location.pathname }).catch(() => {})
}

/** The platform's own "Chop etish" buttons: printing allowed for this one
 *  call even while browser printing is blocked. */
export function printPage() {
  const el = document.documentElement
  el.setAttribute('data-printing', '')
  const done = () => {
    el.removeAttribute('data-printing')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
  window.setTimeout(done, 60_000) // afterprint never came (some mobile browsers)
}

/** Is this element one where typing/copying must keep working? */
export function editable(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  return !!el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .allow-copy')
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** A tile of the diagonal watermark as a data: URL (img-src allows data:). */
export function watermarkTile(lines: string[], color: string): string {
  const text = lines.map((l, i) =>
    `<text x="0" y="${i * 20}" fill="${color}" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="14" font-weight="600">${esc(l)}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="240"><g transform="translate(40 150) rotate(-24)">${text}</g></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

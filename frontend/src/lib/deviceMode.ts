import { useSyncExternalStore } from 'react'

/* Qurilma rejimi (Sozlamalar → Ko'rinish): which layout this device uses.
   - auto: the screen's own width decides (the usual).
   - desktop: a phone lays the page out 1280px wide and shows it zoomed out,
     as a browser's "Desktop site" does — the viewport meta is swapped.
   - mobile: a wide screen gets the phone layout in a 480px frame. The CSS
     media rules are re-judged as if the screen were a phone (390px, touch)
     and switched on or off in place; new stylesheets (lazy pages) too.
   Kept per device in localStorage and applied before the first paint. */

export type DeviceMode = 'auto' | 'mobile' | 'desktop'

const KEY = 'af.deviceMode'
const PHONE_W = 390
const DESKTOP_W = 1280
const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

let current: DeviceMode = read()
const listeners = new Set<() => void>()

function read(): DeviceMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'mobile' || v === 'desktop' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function getDeviceMode(): DeviceMode {
  return current
}

export function setDeviceMode(mode: DeviceMode) {
  current = mode
  try {
    if (mode === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch {
    /* private mode: for this visit only */
  }
  applyDeviceMode()
  listeners.forEach((l) => l())
}

export function useDeviceMode(): DeviceMode {
  return useSyncExternalStore((cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, getDeviceMode)
}

/* ── media rules ─────────────────────────────────────────────────── */

const original = new WeakMap<CSSMediaRule, string>()

/** Does one media query hold on a phone? null: can't tell, leave it be. */
function onPhone(query: string): boolean | null {
  const q = query.trim().toLowerCase()
  if (!q || /print|prefers-|speech|not |only /.test(q)) return null
  let ok = true
  for (const part of q.split(/\s+and\s+/)) {
    const p = part.trim()
    if (p === 'screen' || p === 'all') continue
    const m = p.match(/^\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*\)$/)
    if (m) {
      const value = Number(m[3])
      const size = m[2] === 'width' ? PHONE_W : window.innerHeight
      ok &&= m[1] === 'min' ? size >= value : size <= value
      continue
    }
    const f = p.match(/^\(\s*(hover|pointer|orientation)\s*:\s*([a-z-]+)\s*\)$/)
    if (f) {
      const want = { hover: 'none', pointer: 'coarse', orientation: 'portrait' }[f[1] as 'hover' | 'pointer' | 'orientation']
      ok &&= f[2] === want
      continue
    }
    return null
  }
  return ok
}

function judge(rule: CSSMediaRule, phone: boolean) {
  const text = original.get(rule) ?? rule.media.mediaText
  if (!original.has(rule)) original.set(rule, text)
  let next = text
  if (phone) {
    const results = text.split(',').map(onPhone)
    if (!results.includes(null)) next = results.some(Boolean) ? 'all' : 'not all'
  }
  if (rule.media.mediaText !== next) rule.media.mediaText = next
}

function walk(rules: CSSRuleList, phone: boolean) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) judge(rule, phone)
    if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules, phone)
  }
}

function rejudgeAll(phone: boolean) {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules // another site's sheet (Google Fonts) can't be read
    } catch {
      continue
    }
    walk(rules, phone)
  }
}

let observer: MutationObserver | null = null

/** --frame-l: how far the phone frame sits from the window's left edge, in
 *  the body's own units — the body is zoomed (legacy.css), so the bars that
 *  stick to the window are placed from a measurement, not from 100vw. */
function placeFrame(phone: boolean) {
  const body = document.body
  if (!body) return
  if (!phone) {
    body.style.removeProperty('--frame-l')
    return
  }
  const zoom = Number.parseFloat(getComputedStyle(body).zoom) || 1
  const left = Math.max(0, (document.documentElement.clientWidth - body.offsetWidth * zoom) / 2) / zoom
  body.style.setProperty('--frame-l', `${left.toFixed(1)}px`)
}

function phoneLayoutOn(): boolean {
  return current === 'mobile' && window.innerWidth > 760
}

/** Puts the chosen mode on the page; called at start and on every change. */
export function applyDeviceMode() {
  const html = document.documentElement
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const narrow = Math.min(window.screen.width, window.screen.height) < 1000
  if (meta) {
    meta.content = current === 'desktop' && narrow
      ? `width=${DESKTOP_W}, initial-scale=${(window.screen.width / DESKTOP_W).toFixed(3)}, viewport-fit=cover`
      : DEFAULT_VIEWPORT
  }
  const phone = phoneLayoutOn()
  if (phone) html.setAttribute('data-device', 'mobile')
  else html.removeAttribute('data-device')
  rejudgeAll(phone)
  placeFrame(phone)
  if (phone && !observer) {
    observer = new MutationObserver(() => {
      if (!phoneLayoutOn()) return
      // a new <link> has no rules until it loads
      window.setTimeout(() => rejudgeAll(true), 0)
      document.querySelectorAll('link[rel="stylesheet"]').forEach((l) =>
        l.addEventListener('load', () => phoneLayoutOn() && rejudgeAll(true), { once: true }))
    })
    observer.observe(document.head, { childList: true })
  } else if (!phone && observer) {
    observer.disconnect()
    observer = null
  }
}

let started = false
export function startDeviceMode() {
  if (started) return
  started = true
  applyDeviceMode()
  window.addEventListener('load', applyDeviceMode)
  window.addEventListener('resize', () => {
    // phone layout follows the window crossing the phone/desktop line
    if (current === 'mobile') applyDeviceMode()
  })
  document.addEventListener('DOMContentLoaded', () => placeFrame(phoneLayoutOn()))
}

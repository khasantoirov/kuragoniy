/**
 * Inactivity tracking for the 30-minute auto-logout. The last moment the
 * user touched the screen (pointer, keys, scroll) is kept in localStorage,
 * so every open tab of the site shares it: working in one tab keeps the
 * others signed in, and when the limit passes they all sign out together.
 * The same number goes to the server with each token refresh
 * (lib/api/client.ts), which refuses a session reported idle for too long.
 */
const KEY = 'af-last-active'
export const IDLE_LIMIT_MS = 30 * 60_000
/** The warning with a countdown appears this long before the logout. */
export const IDLE_WARN_MS = 2 * 60_000
const WRITE_EVERY_MS = 5_000

let memory = 0
let written = 0

export function markActive(force = false) {
  const now = Date.now()
  memory = now
  if (!force && now - written < WRITE_EVERY_MS) return
  written = now
  try {
    localStorage.setItem(KEY, String(now))
  } catch {
    // Storage blocked — this tab still tracks itself in memory.
  }
}

export function lastActive(): number {
  let stored = 0
  try {
    stored = Number(localStorage.getItem(KEY)) || 0
  } catch {
    // ignore
  }
  return Math.max(stored, memory) || Date.now()
}

export function idleMs() {
  return Math.max(0, Date.now() - lastActive())
}

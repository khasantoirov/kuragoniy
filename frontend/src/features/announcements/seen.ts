const SEEN_KEY = 'afmd.seen'
const listeners = new Set<() => void>()

/** Tiny external store (via useSyncExternalStore) so marking notifications
 * seen on the /notifications page updates the topbar bell's dot right
 * away — they're separate components now that the panel is a real page
 * instead of a dropdown rendered inline with the bell. */
export function getSeenAt(): number {
  return Number(localStorage.getItem(SEEN_KEY) || 0)
}

export function markSeen() {
  localStorage.setItem(SEEN_KEY, String(Date.now()))
  listeners.forEach((l) => l())
}

export function subscribeSeen(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

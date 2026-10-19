import type { LibraryItem } from '../types'

/** Where the reader can load this item's PDF from, or null when it can't
 * be read in place: not a PDF, or on another site (Google Drive etc. —
 * the browser won't let the page read those). Our own uploads may come
 * back with a different host name, so any /media/ path is used as-is. */
export function pdfSource(item: Pick<LibraryItem, 'file' | 'url'>): string | null {
  const raw = item.file || item.url
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw, window.location.href)
  } catch {
    return null
  }
  if (!u.pathname.toLowerCase().endsWith('.pdf')) return null
  if (u.origin === window.location.origin) return u.pathname + u.search
  if (u.pathname.startsWith('/media/')) return u.pathname
  return null
}

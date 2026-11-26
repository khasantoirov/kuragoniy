/* admin.kuragoniy.uz — the administration's own panel. The same build is
   served at both addresses; the address decides which app this is
   (routes/index.tsx). Only an Admin or the developer signs in there
   (backend common/adminhost.py); the session is separate per address. */

const { protocol, hostname, port } = window.location
const portPart = port ? `:${port}` : ''

/** The panel has its own address only once admin.kuragoniy.uz resolves and
 *  has its certificate: the build is made with VITE_ADMIN_PANEL=1 then.
 *  Until that, Boshqaruv stays at kuragoniy.uz/admin (routes/legacyAdmin). */
export const PANEL_ENABLED = import.meta.env.VITE_ADMIN_PANEL === '1'

/** This tab is the Boshqaruv paneli (admin.kuragoniy.uz, admin.localhost). */
export const IS_ADMIN_HOST = hostname.startsWith('admin.')

/** kuragoniy.uz — the platform itself. */
export const MAIN_ORIGIN = IS_ADMIN_HOST
  ? `${protocol}//${hostname.slice('admin.'.length)}${portPart}`
  : window.location.origin

/** admin.kuragoniy.uz — the panel. */
export const ADMIN_ORIGIN = IS_ADMIN_HOST
  ? window.location.origin
  : `${protocol}//admin.${hostname.replace(/^www\./, '')}${portPart}`

/** The panel's sections, by the old Boshqaruv tab keys (?bolim=) that
 *  bookmarks and notifications still carry. */
const OLD_TABS: Record<string, string> = {
  users: 'foydalanuvchilar',
  malumot: 'malumot',
  security: 'xavfsizlik',
  modules: 'modullar',
  himoya: 'himoya',
  litsenziya: 'litsenziyalar',
  yillar: 'yillar',
  sayt: 'sayt',
}

/** A panel address; `bolim` may be an old Boshqaruv tab key. */
export function panelUrl(bolim?: string | null): string {
  if (!PANEL_ENABLED && !IS_ADMIN_HOST) {
    // the panel's section as a tab of kuragoniy.uz/admin
    const key = bolim ? Object.entries(OLD_TABS).find(([, s]) => s === bolim)?.[0] ?? bolim : ''
    return `/admin${key ? `?bolim=${key}` : ''}`
  }
  const slug = bolim ? OLD_TABS[bolim] ?? bolim : ''
  return `${ADMIN_ORIGIN}/${slug}`
}

/** A page of the platform, from inside the panel. */
export function siteUrl(path: string): string {
  return `${MAIN_ORIGIN}${path}`
}

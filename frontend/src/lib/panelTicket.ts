import { IS_ADMIN_HOST } from '@/lib/adminHost'
import { api } from '@/lib/api/client'

/* kuragoniy.uz → «Boshqaruv paneli» opens admin.kuragoniy.uz already signed
   in (owner, 2026-11-28: "to'g'ridan to'g'ri kirsin"): the platform asks
   for a one-time ticket (backend PanelTicketView, a minute's life) and puts
   it after the panel's address as #t=…; the panel trades it for its own
   session (lib/auth/AuthContext.tsx) and takes it out of the address. The
   fragment never reaches a server log or another site. */

/** The panel address with a fresh ticket (the bare address if none came). */
async function withTicket(url: string): Promise<string> {
  const bare = url.split('#')[0]
  try {
    const { ticket } = (await api.post<{ ticket: string }>('/auth/panel-ticket/')).data
    return `${bare}#t=${encodeURIComponent(ticket)}`
  } catch {
    return bare  // the panel then asks for the login and password
  }
}

/** This tab goes over to the panel, signed in. */
export async function goToPanel(url: string): Promise<void> {
  window.location.replace(await withTicket(url))
}

/** The panel in a new tab, signed in (opened at once, so no pop-up block). */
export function openPanel(url: string): void {
  const win = window.open('', '_blank')
  void withTicket(url).then((target) => {
    if (win) {
      win.opener = null
      win.location.href = target
    } else {
      window.location.href = target
    }
  })
}

/** admin.kuragoniy.uz: the ticket the link brought — read once, at load,
 *  and taken out of the address right away. */
export const PANEL_TICKET: string | null = (() => {
  if (!IS_ADMIN_HOST) return null
  const m = /[#&]t=([^&]+)/.exec(window.location.hash)
  if (!m) return null
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  } catch {
    // the address keeps it; it opens nothing a second time anyway
  }
  return decodeURIComponent(m[1])
})()

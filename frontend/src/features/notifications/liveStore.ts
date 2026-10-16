import { create } from 'zustand'

export const useNotifyLive = create<{ unread: number; setUnread: (n: number) => void }>((set) => ({
  unread: 0,
  setUnread: (unread) => set({ unread }),
}))

export function popupsAllowed(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

export function showPopup(title: string, body: string, onClick?: () => void) {
  if (!popupsAllowed()) return false
  try {
    const n = new Notification(title, { body: body.slice(0, 180), icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
    return true
  } catch {
    // Android Chrome only allows popups from the service worker.
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(title, { body: body.slice(0, 180), icon: '/icons/icon-192.png' }))
      .catch(() => {})
    return true
  }
}

import { api } from '@/lib/api/client'

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'unsubscribed'
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error("Bu qurilma bildirishnomalarni qo'llab-quvvatlamaydi")

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Bildirishnoma uchun ruxsat berilmadi')

  const { data } = await api.get<{ publicKey: string }>('/push/vapid-public-key/')
  if (!data.publicKey) throw new Error('Server tomonda sozlanmagan')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    })
  }

  const json = sub.toJSON()
  await api.post('/push/subscribe/', { endpoint: json.endpoint, keys: json.keys })
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await api.post('/push/unsubscribe/', { endpoint }).catch(() => {})
}

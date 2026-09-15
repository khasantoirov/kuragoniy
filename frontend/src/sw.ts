/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

// registerType: 'autoUpdate' only auto-skips-waiting for a *generated*
// (generateSW) worker — vite-plugin-pwa injects that call into the script
// it writes itself. With injectManifest (this hand-written sw.ts), nothing
// does that for us, and the client-side registerSW() in main.tsx never
// posts a SKIP_WAITING message in 'autoUpdate' mode either (it only does
// that for registerType: 'prompt'). Without this line a newly deployed
// worker sits in "waiting" forever behind the still-controlling old one —
// on mobile, where a browser tab is rarely fully closed, that can mean the
// update never appears until the user manually clears site data. Calling
// it unconditionally on install is what makes 'autoUpdate' actually mean
// "auto update".
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// API/WebSocket traffic must never be cached — equivalent to the old
// hand-rolled sw.js explicitly bypassing Firebase/Firestore. /media/ and
// /static/ are real files nginx serves directly (lesson attachments,
// avatars, Django admin assets) — without this denylist entry, opening
// one as a top-level navigation (e.g. the "Dars faylini ochish" link's
// target="_blank") matched here first and got the cached app shell
// instead of the file, since NavigationRoute claims any navigation
// request not in its denylist regardless of what's actually at that URL.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/ws\//, /^\/media\//, /^\/static\//],
  }),
)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/'),
  new NetworkOnly(),
  'GET',
)
registerRoute(
  ({ request }) => ['style', 'script', 'worker', 'image', 'font'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'assets' }),
  'GET',
)

// Web Push — lets an announcement reach a device even with every tab
// closed, unlike the in-app WebSocket listener (lib/ws/useAnnouncementsSocket.ts).
interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }

  const title = data.title || 'STEM LMS'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

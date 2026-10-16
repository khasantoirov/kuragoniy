/** Keeps every open staff tab in step with the inbox: polls the summary
 *  (and re-checks at once when an announcement arrives over the socket),
 *  feeds the bell's unread badge, and for each new message plays the
 *  sound and — when the tab is in the background and the user allowed it
 *  — shows a browser popup. Mounted once in AppShell. */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'
import { useAnnouncementsSocket } from '@/lib/ws/useAnnouncementsSocket'

import type { AppNotification, NotifySummary } from './api'
import { getDeviceSettings, soundFor } from './device'
import { showPopup, useNotifyLive } from './liveStore'
import { playSound } from './sounds'

export function NotificationsLive() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const lastSeen = useRef<number | null>(null)
  const setUnread = useNotifyLive((s) => s.setUnread)

  useAnnouncementsSocket(true)

  const { data } = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: async () =>
      (await api.get<NotifySummary>('/notifications/summary/', { params: { after: lastSeen.current ?? 0 } })).data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const announce = (items: AppNotification[]) => {
    const device = getDeviceSettings()
    if (device.sound) playSound(soundFor(items[items.length - 1].kind))
    for (const n of items.slice(-3)) {
      const open = () => navigate(n.url && n.url !== '/notifications' ? n.url : '/notifications')
      const popped = device.popup && document.hidden && showPopup(t(n.title), t(n.body), open)
      if (!popped && !document.hidden) toast(t(n.title))
    }
  }

  useEffect(() => {
    if (!data) return
    setUnread(data.unread)
    if (lastSeen.current === null) {
      lastSeen.current = data.latest_id // first load: nothing to announce
      return
    }
    const fresh = data.fresh.filter((n) => n.id > (lastSeen.current ?? 0)).sort((a, b) => a.id - b.id)
    lastSeen.current = Math.max(lastSeen.current, data.latest_id)
    if (!fresh.length) return
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] })
    announce(fresh)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

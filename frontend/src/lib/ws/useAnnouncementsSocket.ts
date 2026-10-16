import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { getAccessToken } from '@/lib/api/client'

/**
 * Subscribes to the backend's 'announcements' Channels group (see
 * backend/realtime/consumers.py AnnouncementConsumer) so a new
 * announcement appears instantly in every open tab, replacing the old
 * Firestore onSnapshot listener. Mounted once near the app shell.
 */
export function useAnnouncementsSocket(enabled: boolean) {
  const queryClient = useQueryClient()
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled) return

    const token = getAccessToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/announcements/?token=${token}`
    const socket = new WebSocket(url)
    socketRef.current = socket

    // The new announcement is also an inbox message: the notifications
    // poller (features/notifications/live.tsx) checks at once and plays the
    // user's chosen sound / popup, so nothing is announced twice.
    socket.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'summary'] })
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}

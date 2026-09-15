import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { getAccessToken } from '@/lib/api/client'
import { playNotifySound } from '@/lib/push/sound'
import { useToast } from '@/components/Toast'

/**
 * Subscribes to the backend's 'announcements' Channels group (see
 * backend/realtime/consumers.py AnnouncementConsumer) so a new
 * announcement appears instantly in every open tab, replacing the old
 * Firestore onSnapshot listener. Mounted once near the app shell.
 */
export function useAnnouncementsSocket(enabled: boolean) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled) return

    const token = getAccessToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/announcements/?token=${token}`
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        toast(payload.text ?? 'Yangi e\'lon')
        playNotifySound()
        queryClient.invalidateQueries({ queryKey: ['announcements'] })
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}

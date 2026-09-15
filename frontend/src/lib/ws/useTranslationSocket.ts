import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { getAccessToken } from '@/lib/api/client'

/**
 * Subscribes to the backend's per-lesson 'lesson_translation_{id}'
 * Channels group (see backend/realtime/consumers.py TranslationConsumer)
 * so a lesson-detail/editor view refreshes the moment the Telegram bot's
 * translation worker finishes writing the _ru/_en fields — replaces the
 * old Firestore onSnapshot listener the frontend used to poll.
 */
export function useTranslationSocket(lessonId: number | null | undefined) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!lessonId) return
    const token = getAccessToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/lessons/${lessonId}/translation/?token=${token}`
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onmessage = () => {
      toast(t("Dars tarjimasi tayyor bo'ldi"))
      queryClient.invalidateQueries({ queryKey: ['lessons'] })
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])
}

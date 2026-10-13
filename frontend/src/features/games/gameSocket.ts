import { useEffect, useRef } from 'react'

import { getAccessToken } from '@/lib/api/client'

/** Subscribes to a live game's "changed" pings (realtime/consumers.py
 * GameConsumer) and calls `onChange` — the caller refetches its own state
 * over REST. Falls back to polling every `pollMs` while the socket isn't
 * open, so a blocked WebSocket only makes the game a little laggier. */
export function useGameSocket(sessionId: number | null, onChange: () => void, pollMs = 2500) {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  })

  useEffect(() => {
    if (!sessionId) return
    let socket: WebSocket | null = null
    let open = false
    let closed = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      const token = getAccessToken()
      if (!token || closed) return
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${protocol}://${window.location.host}/ws/games/${sessionId}/?token=${token}`)
      socket.onopen = () => { open = true }
      socket.onmessage = () => cb.current()
      socket.onclose = () => {
        open = false
        if (!closed) retry = setTimeout(connect, 4000)
      }
    }
    connect()
    const poll = setInterval(() => { if (!open) cb.current() }, pollMs)

    return () => {
      closed = true
      clearInterval(poll)
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [sessionId, pollMs])
}

export const OPTION_STYLES = [
  { cls: 'gans-a', shape: '▲' },
  { cls: 'gans-b', shape: '◆' },
  { cls: 'gans-c', shape: '●' },
  { cls: 'gans-d', shape: '■' },
]
